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

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

        // Add retry logic for quota issues
        let result, response, responseText;
        let retries = 3;
        
        while (retries > 0) {
            try {
                result = await model.generateContent(aiPrompt);
                response = await result.response;
                responseText = response.text().trim();
                break; // Success, exit retry loop
            } catch (retryError) {
                retries--;
                if (retryError.message.includes('quota') && retries > 0) {
                    console.log(`Quota exceeded, retrying in 2 seconds... (${retries} retries left)`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    throw retryError; // Re-throw if not quota error or no retries left
                }
            }
        }

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

        // More specific error messages
        if (error.message.includes('API key')) {
            res.status(400).json({ error: 'Invalid API key. Please check your Gemini API key in .env file' });
        } else if (error.message.includes('quota')) {
            res.status(429).json({ error: 'API quota exceeded. Please try again later' });
        } else if (error.message.includes('model')) {
            res.status(400).json({ error: 'Model not available. Please try again or contact support' });
        } else {
            res.status(500).json({ error: 'AI processing failed: ' + error.message });
        }
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

// Store trained models in memory (for demo purposes)
const trainedModels = new Map();

// ML Training endpoint - uses Gemini to simulate ML training
app.post('/api/train', async (req, res) => {
    try {
        const { data, targetColumn, modelType, testSplit } = req.body;

        if (!data || !targetColumn || !modelType) {
            return res.status(400).json({ error: 'Data, target column, and model type are required' });
        }

        if (!Array.isArray(data) || data.length < 10) {
            return res.status(400).json({ error: 'Need at least 10 rows of data for training' });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Get feature columns (all except target)
        const allColumns = Object.keys(data[0]);
        const featureColumns = allColumns.filter(col => col !== targetColumn);

        // Prepare data summary for AI
        const dataSample = JSON.stringify(data.slice(0, 20), null, 2);
        const dataStats = {
            totalRows: data.length,
            columns: allColumns,
            targetColumn: targetColumn,
            featureColumns: featureColumns,
            testSplit: testSplit || 0.2
        };

        // Craft the ML training prompt with comprehensive data science info
        const aiPrompt = `You are a machine learning expert and data scientist. Analyze this dataset and simulate training a ${modelType} model with comprehensive analysis.

DATASET STATISTICS:
- Total rows: ${dataStats.totalRows}
- Feature columns: ${featureColumns.join(', ')}
- Target column: ${targetColumn}
- Test split: ${(dataStats.testSplit * 100)}%
- Model type: ${modelType}

SAMPLE DATA (first 20 rows):
${dataSample}

TASK: Simulate training a ${modelType} model on this data. Provide comprehensive data science analysis including model parameters, feature importance, and detailed metrics.

RESPOND WITH ONLY THIS JSON FORMAT (no other text):
{
    "success": true,
    "modelType": "${modelType}",
    "modelDisplayName": "<Human readable model name>",
    "taskType": "<classification or regression>",
    "metrics": {
        "accuracy": <number between 0.6 and 0.98 for classification, null for regression>,
        "precision": <number between 0.6 and 0.98 for classification, null for regression>,
        "recall": <number between 0.6 and 0.98 for classification, null for regression>,
        "f1Score": <number between 0.6 and 0.98 for classification, null for regression>,
        "mse": <number for regression, null for classification>,
        "rmse": <number for regression, null for classification>,
        "mae": <number for regression, null for classification>,
        "r2Score": <number between 0.5 and 0.98 for regression, null for classification>,
        "crossValScore": <number between 0.6 and 0.95>,
        "trainingTime": "<time in seconds like 0.45s>"
    },
    "trainSize": ${Math.floor(dataStats.totalRows * (1 - dataStats.testSplit))},
    "testSize": ${Math.floor(dataStats.totalRows * dataStats.testSplit)},
    "featureImportance": {
        ${featureColumns.map(col => `"${col}": <importance between 0.01 and 1.0>`).join(',\n        ')}
    },
    "modelParameters": {
        ${modelType === 'linear-regression' ? '"fit_intercept": true, "normalize": false, "coefficients": "computed"' : ''}
        ${modelType === 'logistic-regression' ? '"solver": "lbfgs", "max_iter": 100, "C": 1.0, "penalty": "l2"' : ''}
        ${modelType === 'decision-tree' ? '"max_depth": <number 3-10>, "min_samples_split": 2, "min_samples_leaf": 1, "criterion": "gini"' : ''}
        ${modelType === 'random-forest' ? '"n_estimators": 100, "max_depth": <number 5-15>, "min_samples_split": 2, "bootstrap": true' : ''}
        ${modelType === 'knn' ? '"n_neighbors": <number 3-7>, "weights": "uniform", "algorithm": "auto", "metric": "minkowski"' : ''}
        ${modelType === 'naive-bayes' ? '"var_smoothing": 1e-9, "priors": null, "type": "GaussianNB"' : ''}
    },
    "dataAnalysis": {
        "totalFeatures": ${featureColumns.length},
        "totalSamples": ${dataStats.totalRows},
        "missingValues": <number 0-5>,
        "categoricalFeatures": <number>,
        "numericalFeatures": <number>,
        "targetDistribution": "<balanced or imbalanced for classification, continuous for regression>"
    },
    "modelSummary": "<2-3 sentence detailed analysis of model performance, strengths, and potential improvements>",
    "recommendations": "<1-2 sentence recommendation for improving model performance>"
}

Make all metrics realistic based on the data quality, size, and model type. Ensure feature importance values sum close to 1.0.`;

        let result, response, responseText;
        let retries = 3;
        
        while (retries > 0) {
            try {
                result = await model.generateContent(aiPrompt);
                response = await result.response;
                responseText = response.text().trim();
                break;
            } catch (retryError) {
                retries--;
                if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    throw retryError;
                }
            }
        }

        // Clean up response
        responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        let trainingResult;
        try {
            trainingResult = JSON.parse(responseText);
        } catch (parseError) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                trainingResult = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Failed to parse training results');
            }
        }

        // Generate a model ID and store model info
        const modelId = `model_${Date.now()}`;
        trainedModels.set(modelId, {
            modelType,
            targetColumn,
            featureColumns,
            metrics: trainingResult.metrics,
            trainedAt: new Date().toISOString(),
            dataShape: { rows: data.length, features: featureColumns.length }
        });

        res.json({
            success: true,
            modelId: modelId,
            ...trainingResult,
            featureColumns: featureColumns
        });

    } catch (error) {
        console.error('Training error:', error);
        res.status(500).json({ error: 'Model training failed: ' + error.message });
    }
});

// Download trained model endpoint
app.get('/api/model/:modelId/download', (req, res) => {
    try {
        const { modelId } = req.params;
        const modelInfo = trainedModels.get(modelId);

        if (!modelInfo) {
            return res.status(404).json({ error: 'Model not found' });
        }

        // Create a model file (JSON representation)
        const modelFile = {
            modelId: modelId,
            ...modelInfo,
            exportedAt: new Date().toISOString(),
            version: '1.0.0',
            framework: 'AI Dataset Preprocessor',
            note: 'This is a simulated model for demonstration purposes'
        };

        res.json({
            success: true,
            content: JSON.stringify(modelFile, null, 2),
            filename: `${modelInfo.modelType}_model_${modelId}.json`,
            contentType: 'application/json'
        });

    } catch (error) {
        console.error('Model download error:', error);
        res.status(500).json({ error: 'Failed to download model: ' + error.message });
    }
});

// Prediction endpoint
app.post('/api/predict', async (req, res) => {
    try {
        const { modelId, inputData } = req.body;

        if (!modelId || !inputData) {
            return res.status(400).json({ error: 'Model ID and input data are required' });
        }

        const modelInfo = trainedModels.get(modelId);
        if (!modelInfo) {
            return res.status(404).json({ error: 'Model not found. Please train a model first.' });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Craft prediction prompt
        const aiPrompt = `You are a machine learning prediction system. Based on the trained ${modelInfo.modelType} model, predict the ${modelInfo.targetColumn} value.

MODEL INFO:
- Type: ${modelInfo.modelType}
- Target: ${modelInfo.targetColumn}
- Features: ${modelInfo.featureColumns.join(', ')}
- Model Accuracy: ${modelInfo.metrics.accuracy || modelInfo.metrics.r2Score}

INPUT DATA FOR PREDICTION:
${JSON.stringify(inputData, null, 2)}

TASK: Provide a realistic prediction for the target column "${modelInfo.targetColumn}" based on the input values.

RESPOND WITH ONLY THIS JSON FORMAT (no other text):
{
    "prediction": <predicted value - number or string based on model type>,
    "confidence": <confidence score between 0.7 and 0.99>,
    "explanation": "<brief explanation of the prediction>"
}`;

        let result, response, responseText;
        let retries = 3;
        
        while (retries > 0) {
            try {
                result = await model.generateContent(aiPrompt);
                response = await result.response;
                responseText = response.text().trim();
                break;
            } catch (retryError) {
                retries--;
                if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    throw retryError;
                }
            }
        }

        // Clean up response
        responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        let predictionResult;
        try {
            predictionResult = JSON.parse(responseText);
        } catch (parseError) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                predictionResult = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Failed to parse prediction');
            }
        }

        res.json({
            success: true,
            ...predictionResult
        });

    } catch (error) {
        console.error('Prediction error:', error);
        res.status(500).json({ error: 'Prediction failed: ' + error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Dataset Preprocessor running at http://localhost:${PORT}`);
    console.log(`📁 Upload your dataset and use AI to preprocess it!`);
    console.log(`🤖 ML Training feature enabled!`);
});
