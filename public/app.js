/**
 * AI Dataset Preprocessor - Frontend Application
 */

// State management
const state = {
    originalData: null,
    processedData: null,
    fileType: null,
    fileName: null,
    currentView: 'original'
};

// DOM Elements
const elements = {
    uploadZone: document.getElementById('upload-zone'),
    fileInput: document.getElementById('file-input'),
    fileInfo: document.getElementById('file-info'),
    fileName: document.getElementById('file-name'),
    clearFile: document.getElementById('clear-file'),
    promptSection: document.getElementById('prompt-section'),
    promptInput: document.getElementById('prompt-input'),
    processBtn: document.getElementById('process-btn'),
    dataSection: document.getElementById('data-section'),
    tableContainer: document.getElementById('table-container'),
    dataStats: document.getElementById('data-stats'),
    exportSection: document.getElementById('export-section'),
    processedTab: document.getElementById('processed-tab'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupEventListeners();
}

function setupEventListeners() {
    // File upload
    elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);
    elements.clearFile.addEventListener('click', clearFile);

    // Drag and drop
    elements.uploadZone.addEventListener('dragover', handleDragOver);
    elements.uploadZone.addEventListener('dragleave', handleDragLeave);
    elements.uploadZone.addEventListener('drop', handleDrop);

    // Process button
    elements.processBtn.addEventListener('click', processData);

    // Quick prompts
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            elements.promptInput.value = chip.dataset.prompt;
            elements.promptInput.focus();
        });
    });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.view));
    });

    // Export buttons
    document.querySelectorAll('.btn-export').forEach(btn => {
        btn.addEventListener('click', () => exportData(btn.dataset.format));
    });
}

// File handling
function handleDragOver(e) {
    e.preventDefault();
    elements.uploadZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.uploadZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    elements.uploadZone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
}

async function processFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        showToast('Uploading file...', 'info');

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Upload failed');
        }

        // Update state
        state.originalData = result.data;
        state.fileType = result.type;
        state.fileName = result.filename;
        state.processedData = null;

        // Update UI
        elements.fileName.textContent = `✅ ${result.filename}`;
        elements.fileInfo.style.display = 'flex';
        elements.promptSection.style.display = 'block';
        elements.dataSection.style.display = 'block';
        elements.exportSection.style.display = 'none';
        elements.processedTab.disabled = true;

        // Reset tabs
        switchTab('original');

        // Render preview
        renderData(state.originalData, state.fileType);

        showToast('File uploaded successfully!', 'success');

    } catch (error) {
        console.error('Upload error:', error);
        showToast(error.message, 'error');
    }
}

function clearFile() {
    state.originalData = null;
    state.processedData = null;
    state.fileType = null;
    state.fileName = null;

    elements.fileInput.value = '';
    elements.fileInfo.style.display = 'none';
    elements.promptSection.style.display = 'none';
    elements.dataSection.style.display = 'none';
    elements.exportSection.style.display = 'none';
    elements.promptInput.value = '';
    elements.processedTab.disabled = true;
}

// Data processing
async function processData() {
    const prompt = elements.promptInput.value.trim();

    if (!prompt) {
        showToast('Please enter a preprocessing instruction', 'error');
        return;
    }

    if (!state.originalData) {
        showToast('Please upload a file first', 'error');
        return;
    }

    const btn = elements.processBtn;
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');

    try {
        // Show loading state
        btn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        btnLoading.innerHTML = '<span class="loading"></span> Processing...';

        showToast('Processing with AI...', 'info');

        const response = await fetch('/api/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: state.originalData,
                prompt: prompt,
                type: state.fileType
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Processing failed');
        }

        // Update state
        state.processedData = result.data;

        // Enable processed tab and switch to it
        elements.processedTab.disabled = false;
        switchTab('processed');

        // Show export section
        elements.exportSection.style.display = 'block';

        showToast('Data processed successfully!', 'success');

    } catch (error) {
        console.error('Processing error:', error);
        showToast(error.message, 'error');
    } finally {
        // Reset button
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

// Tab switching
function switchTab(view) {
    state.currentView = view;

    // Update tab styles
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });

    // Render appropriate data
    if (view === 'original') {
        renderData(state.originalData, state.fileType);
    } else {
        renderData(state.processedData, 'json');
    }
}

// Data rendering
function renderData(data, type) {
    if (!data) {
        elements.tableContainer.innerHTML = '<p class="empty-state">No data to display</p>';
        elements.dataStats.innerHTML = '';
        return;
    }

    // Handle different data types
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        renderTable(data);
    } else if (typeof data === 'object' && data !== null) {
        // Check if it's a wrapper object with data inside
        if (data.data && typeof data.data === 'string') {
            renderText(data.data);
        } else if (data.rows && Array.isArray(data.rows)) {
            renderTable(data.rows);
        } else if (Array.isArray(Object.values(data)[0])) {
            // Convert object with arrays to table
            renderTable(objectToTable(data));
        } else {
            renderJSON(data);
        }
    } else if (typeof data === 'string') {
        renderText(data);
    } else {
        renderJSON(data);
    }
}

function renderTable(data) {
    if (!Array.isArray(data) || data.length === 0) {
        elements.tableContainer.innerHTML = '<p class="empty-state">No data to display</p>';
        elements.dataStats.innerHTML = '';
        return;
    }

    const headers = Object.keys(data[0]);

    // Stats
    elements.dataStats.innerHTML = `
        <span>📊 <strong>${data.length}</strong> rows</span>
        <span>📋 <strong>${headers.length}</strong> columns</span>
    `;

    // Table
    let html = '<table class="data-table"><thead><tr>';
    headers.forEach(h => {
        html += `<th>${escapeHTML(h)}</th>`;
    });
    html += '</tr></thead><tbody>';

    data.forEach(row => {
        html += '<tr>';
        headers.forEach(h => {
            const value = row[h] !== undefined ? String(row[h]) : '';
            html += `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    elements.tableContainer.innerHTML = html;
}

function renderText(text) {
    elements.dataStats.innerHTML = `<span>📝 <strong>${text.length}</strong> characters</span>`;
    elements.tableContainer.innerHTML = `<pre class="text-preview">${escapeHTML(text)}</pre>`;
}

function renderJSON(data) {
    const json = JSON.stringify(data, null, 2);
    elements.dataStats.innerHTML = `<span>📋 JSON object</span>`;
    elements.tableContainer.innerHTML = `<pre class="text-preview">${escapeHTML(json)}</pre>`;
}

function objectToTable(obj) {
    const keys = Object.keys(obj);
    const maxLen = Math.max(...keys.map(k => Array.isArray(obj[k]) ? obj[k].length : 1));
    const result = [];

    for (let i = 0; i < maxLen; i++) {
        const row = {};
        keys.forEach(k => {
            row[k] = Array.isArray(obj[k]) ? obj[k][i] : obj[k];
        });
        result.push(row);
    }

    return result;
}

// Export
async function exportData(format) {
    if (!state.processedData) {
        showToast('No processed data to export', 'error');
        return;
    }

    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: state.processedData,
                format: format
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Export failed');
        }

        // Download file
        downloadFile(result.content, result.filename, result.contentType);
        showToast(`Downloaded ${result.filename}`, 'success');

    } catch (error) {
        console.error('Export error:', error);
        showToast(error.message, 'error');
    }
}

function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// UI Utilities
function showToast(message, type = 'info') {
    elements.toastMessage.textContent = message;
    elements.toast.className = 'toast show ' + type;

    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
