const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Parse different file types
function parseFileContent(buffer, filename) {
    const ext = path.extname(filename).toLowerCase();
    const content = buffer.toString('utf-8');
    
    try {
        if (ext === '.json') {
            return { type: 'json', data: JSON.parse(content), raw: content };
        } else if (ext === '.csv') {
            return { type: 'csv', data: parseCSV(content), raw: content };
        } else {
            // Treat as text/other
            return { type: 'text', data: content, raw: content };
        }
    } catch (error) {
        return { type: 'text', data: content, raw: content };
    }
}

// Simple CSV parser
function parseCSV(content) {
    const lines = content.trim().split('\n');
    if (lines.length === 0) return [];
    
    const headers = parseCSVLine(lines[0]);
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((header, index) => {
            row[header.trim()] = values[index]?.trim() || '';
        });
        data.push(row);
    }
    
    return data;
}

// Parse CSV line handling quoted values
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    
    return result;
}

// Convert data back to CSV
function dataToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvLines = [headers.join(',')];
    
    for (const row of data) {
        const values = headers.map(h => {
            const val = String(row[h] || '');
            // Escape values with commas or quotes
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        });
        csvLines.push(values.join(','));
    }
    
    return csvLines.join('\n');
}

// Upload and process endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const parsed = parseFileContent(req.file.buffer, req.file.originalname);
        
        res.json({
            success: true,
            filename: req.file.originalname,
            type: parsed.type,
            data: parsed.data,
            preview: Array.isArray(parsed.data) ? parsed.data.slice(0, 10) : parsed.data
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to process file: ' + error.message });
    }
});

// Process with AI endpoint
app.post('/api/process', async (req, res) => {
    try {
        const { data, prompt, type } = req.body;
        
        if (!data || !prompt) {
            return res.status(400).json({ error: 'Data and prompt are required' });
        }
        
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
            return res.status(400).json({ error: 'Please configure your Gemini API key in .env file' });
        }
        
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        // Prepare data string for AI
        let dataString;
        if (type === 'csv' || Array.isArray(data)) {
            dataString = JSON.stringify(data, null, 2);
        } else if (type === 'json') {
            dataString = JSON.stringify(data, null, 2);
        } else {
            dataString = data;
        }
        
        // Craft the AI prompt
        const aiPrompt = `You are a data preprocessing assistant. You will receive a dataset and a user instruction.
Your task is to transform/preprocess the data according to the user's instruction.

IMPORTANT RULES:
1. Return ONLY valid JSON - no explanations, no markdown, no code blocks
2. If the input is an array of objects, return an array of objects
3. If the input is a single object, return an object
4. If the input is text, return a JSON object with a "data" field containing the processed text
5. Preserve the structure as much as possible unless the user asks to change it
6. Handle missing values, duplicates, type conversions as requested
7. For text data, you can return as { "data": "processed text" } or { "rows": [...] } if converting to structured format

USER'S INSTRUCTION: ${prompt}

DATASET TO PROCESS:
${dataString}

RESPOND WITH ONLY THE PROCESSED JSON DATA, NO OTHER TEXT:`;

        const result = await model.generateContent(aiPrompt);
        const response = await result.response;
        let responseText = response.text().trim();
        
        // Clean up response - remove markdown code blocks if present
        responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        
        // Try to parse the response
        let processedData;
        try {
            processedData = JSON.parse(responseText);
        } catch (parseError) {
            // If parsing fails, try to extract JSON from the response
            const jsonMatch = responseText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
            if (jsonMatch) {
                processedData = JSON.parse(jsonMatch[0]);
            } else {
                // Return as text wrapper
                processedData = { data: responseText };
            }
        }
        
        res.json({
            success: true,
            data: processedData,
            originalType: type
        });
        
    } catch (error) {
        console.error('Processing error:', error);
        res.status(500).json({ error: 'AI processing failed: ' + error.message });
    }
});

// Export endpoint
app.post('/api/export', (req, res) => {
    try {
        const { data, format } = req.body;
        
        let content, contentType, filename;
        
        if (format === 'csv') {
            content = dataToCSV(Array.isArray(data) ? data : [data]);
            contentType = 'text/csv';
            filename = 'processed_data.csv';
        } else if (format === 'json') {
            content = JSON.stringify(data, null, 2);
            contentType = 'application/json';
            filename = 'processed_data.json';
        } else {
            content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            contentType = 'text/plain';
            filename = 'processed_data.txt';
        }
        
        res.json({
            success: true,
            content: content,
            contentType: contentType,
            filename: filename
        });
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Dataset Preprocessor running at http://localhost:${PORT}`);
    console.log(`📁 Upload your dataset and use AI to preprocess it!`);
});
