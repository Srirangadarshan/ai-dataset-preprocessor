/**
 * AI Dataset Preprocessor - Frontend Application
 */

// State management
const state = {
    originalData: null,
    processedData: null,
    fileType: null,
    fileName: null,
    currentView: 'original',
    // ML State
    selectedModel: null,
    trainedModelId: null,
    featureColumns: [],
    targetColumn: null,
    lastTrainingResult: null
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
    toastMessage: document.getElementById('toast-message'),
    // ML Elements
    mlSection: document.getElementById('ml-section'),
    targetColumn: document.getElementById('target-column'),
    testSplit: document.getElementById('test-split'),
    trainBtn: document.getElementById('train-btn'),
    resultsSection: document.getElementById('results-section'),
    metricsGrid: document.getElementById('metrics-grid'),
    downloadModelBtn: document.getElementById('download-model-btn'),
    predictionSection: document.getElementById('prediction-section'),
    predictionInputs: document.getElementById('prediction-inputs'),
    predictBtn: document.getElementById('predict-btn'),
    predictionResult: document.getElementById('prediction-result'),
    resultValue: document.getElementById('result-value')
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

    // ML Model selection
    document.querySelectorAll('.model-card').forEach(card => {
        card.addEventListener('click', () => selectModel(card));
    });

    // Target column change
    if (elements.targetColumn) {
        elements.targetColumn.addEventListener('change', updateTrainButton);
    }

    // Train button
    if (elements.trainBtn) {
        elements.trainBtn.addEventListener('click', trainModel);
    }

    // Download model button
    if (elements.downloadModelBtn) {
        elements.downloadModelBtn.addEventListener('click', downloadModel);
    }

    // Download report button
    const downloadReportBtn = document.getElementById('download-report-btn');
    if (downloadReportBtn) {
        downloadReportBtn.addEventListener('click', downloadTrainingReport);
    }

    // Predict button
    if (elements.predictBtn) {
        elements.predictBtn.addEventListener('click', makePrediction);
    }
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
        elements.fileName.textContent = result.filename;
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
    state.selectedModel = null;
    state.trainedModelId = null;
    state.featureColumns = [];
    state.targetColumn = null;

    elements.fileInput.value = '';
    elements.fileInfo.style.display = 'none';
    elements.promptSection.style.display = 'none';
    elements.dataSection.style.display = 'none';
    elements.exportSection.style.display = 'none';
    elements.promptInput.value = '';
    elements.processedTab.disabled = true;

    // Hide ML sections
    if (elements.mlSection) elements.mlSection.style.display = 'none';
    if (elements.resultsSection) elements.resultsSection.style.display = 'none';
    if (elements.predictionSection) elements.predictionSection.style.display = 'none';
    
    // Reset model selection
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
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

        // Show ML section if data is suitable
        showMLSection();

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
        <span><strong>${data.length}</strong> rows</span>
        <span><strong>${headers.length}</strong> columns</span>
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
    elements.dataStats.innerHTML = `<span><strong>${text.length}</strong> characters</span>`;
    elements.tableContainer.innerHTML = `<pre class="text-preview">${escapeHTML(text)}</pre>`;
}

function renderJSON(data) {
    const json = JSON.stringify(data, null, 2);
    elements.dataStats.innerHTML = `<span>JSON object</span>`;
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

// ==========================================
// ML Training Functions
// ==========================================

function selectModel(card) {
    // Remove selection from all cards
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
    
    // Select clicked card
    card.classList.add('selected');
    state.selectedModel = card.dataset.model;
    
    updateTrainButton();
}

function updateTrainButton() {
    const hasTarget = elements.targetColumn && elements.targetColumn.value;
    const hasModel = state.selectedModel;
    
    if (elements.trainBtn) {
        elements.trainBtn.disabled = !(hasTarget && hasModel);
    }
}

function populateTargetColumns(data) {
    if (!elements.targetColumn || !Array.isArray(data) || data.length === 0) return;
    
    const columns = Object.keys(data[0]);
    
    // Clear existing options
    elements.targetColumn.innerHTML = '<option value="">Select target column...</option>';
    
    // Add column options
    columns.forEach(col => {
        const option = document.createElement('option');
        option.value = col;
        option.textContent = col;
        elements.targetColumn.appendChild(option);
    });
}

function showMLSection() {
    if (elements.mlSection && state.processedData && Array.isArray(state.processedData)) {
        elements.mlSection.style.display = 'block';
        populateTargetColumns(state.processedData);
    }
}

async function trainModel() {
    if (!state.processedData || !state.selectedModel || !elements.targetColumn.value) {
        showToast('Please select target column and model type', 'error');
        return;
    }

    const btn = elements.trainBtn;
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');

    try {
        // Show loading state
        btn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        btnLoading.innerHTML = '<span class="loading"></span> Training...';

        showToast('Training model...', 'info');

        const response = await fetch('/api/train', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: state.processedData,
                targetColumn: elements.targetColumn.value,
                modelType: state.selectedModel,
                testSplit: parseFloat(elements.testSplit.value)
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Training failed');
        }

        // Store model info
        state.trainedModelId = result.modelId;
        state.featureColumns = result.featureColumns;
        state.targetColumn = elements.targetColumn.value;
        state.lastTrainingResult = result;

        // Display results
        displayTrainingResults(result);

        showToast('Model trained successfully!', 'success');

    } catch (error) {
        console.error('Training error:', error);
        showToast(error.message, 'error');
    } finally {
        // Reset button
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        updateTrainButton();
    }
}

function displayTrainingResults(result) {
    if (!elements.resultsSection || !elements.metricsGrid) return;

    // Show results section
    elements.resultsSection.style.display = 'block';

    // Model Info Summary
    const modelInfoSummary = document.getElementById('model-info-summary');
    if (modelInfoSummary) {
        modelInfoSummary.innerHTML = `
            <div class="model-info-item">
                <span class="model-info-label">Model</span>
                <span class="model-info-value">${result.modelDisplayName || result.modelType}</span>
            </div>
            <div class="model-info-item">
                <span class="model-info-label">Task Type</span>
                <span class="model-info-value">${result.taskType || 'Classification'}</span>
            </div>
            <div class="model-info-item">
                <span class="model-info-label">Features</span>
                <span class="model-info-value">${result.featureColumns?.length || 0}</span>
            </div>
            <div class="model-info-item">
                <span class="model-info-label">Samples</span>
                <span class="model-info-value">${result.trainSize + result.testSize}</span>
            </div>
            <div class="model-info-item">
                <span class="model-info-label">Training Time</span>
                <span class="model-info-value">${result.metrics?.trainingTime || '0.5s'}</span>
            </div>
        `;
    }

    // Build metrics HTML
    const metrics = result.metrics;
    let metricsHTML = '';

    if (metrics.accuracy !== null && metrics.accuracy !== undefined) {
        metricsHTML += `
            <div class="metric-card">
                <span class="metric-value">${(metrics.accuracy * 100).toFixed(1)}%</span>
                <span class="metric-label">Accuracy</span>
            </div>
        `;
    }

    if (metrics.precision !== null && metrics.precision !== undefined) {
        metricsHTML += `
            <div class="metric-card">
                <span class="metric-value">${(metrics.precision * 100).toFixed(1)}%</span>
                <span class="metric-label">Precision</span>
            </div>
        `;
    }

    if (metrics.recall !== null && metrics.recall !== undefined) {
        metricsHTML += `
            <div class="metric-card">
                <span class="metric-value">${(metrics.recall * 100).toFixed(1)}%</span>
                <span class="metric-label">Recall</span>
            </div>
        `;
    }

    if (metrics.f1Score !== null && metrics.f1Score !== undefined) {
        metricsHTML += `
            <div class="metric-card">
                <span class="metric-value">${(metrics.f1Score * 100).toFixed(1)}%</span>
                <span class="metric-label">F1 Score</span>
            </div>
        `;
    }

    if (metrics.r2Score !== null && metrics.r2Score !== undefined) {
        metricsHTML += `
            <div class="metric-card">
                <span class="metric-value">${(metrics.r2Score * 100).toFixed(1)}%</span>
                <span class="metric-label">R² Score</span>
            </div>
        `;
    }

    if (metrics.mse !== null && metrics.mse !== undefined) {
        metricsHTML += `
            <div class="metric-card">
                <span class="metric-value">${typeof metrics.mse === 'number' ? metrics.mse.toFixed(4) : metrics.mse}</span>
                <span class="metric-label">MSE</span>
            </div>
        `;
    }

    if (metrics.rmse !== null && metrics.rmse !== undefined) {
        metricsHTML += `
            <div class="metric-card">
                <span class="metric-value">${typeof metrics.rmse === 'number' ? metrics.rmse.toFixed(4) : metrics.rmse}</span>
                <span class="metric-label">RMSE</span>
            </div>
        `;
    }

    if (metrics.mae !== null && metrics.mae !== undefined) {
        metricsHTML += `
            <div class="metric-card">
                <span class="metric-value">${typeof metrics.mae === 'number' ? metrics.mae.toFixed(4) : metrics.mae}</span>
                <span class="metric-label">MAE</span>
            </div>
        `;
    }

    if (metrics.crossValScore !== null && metrics.crossValScore !== undefined) {
        metricsHTML += `
            <div class="metric-card">
                <span class="metric-value">${(metrics.crossValScore * 100).toFixed(1)}%</span>
                <span class="metric-label">Cross-Val Score</span>
            </div>
        `;
    }

    elements.metricsGrid.innerHTML = metricsHTML;

    // Data Split Info
    const splitInfo = document.getElementById('split-info');
    if (splitInfo) {
        const trainPercent = (result.trainSize / (result.trainSize + result.testSize) * 100).toFixed(0);
        const testPercent = (result.testSize / (result.trainSize + result.testSize) * 100).toFixed(0);
        
        splitInfo.innerHTML = `
            <div class="split-bar-container">
                <div class="split-bar">
                    <div class="split-train" style="width: ${trainPercent}%">${result.trainSize}</div>
                    <div class="split-test" style="width: ${testPercent}%">${result.testSize}</div>
                </div>
                <div class="split-legend">
                    <div class="split-legend-item">
                        <span class="legend-dot train"></span>
                        <span>Training Set (${trainPercent}%)</span>
                    </div>
                    <div class="split-legend-item">
                        <span class="legend-dot test"></span>
                        <span>Test Set (${testPercent}%)</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Feature Importance
    const featureImportance = document.getElementById('feature-importance');
    if (featureImportance && result.featureImportance) {
        const sortedFeatures = Object.entries(result.featureImportance)
            .sort((a, b) => b[1] - a[1]);
        
        let featureHTML = '';
        sortedFeatures.forEach(([feature, importance]) => {
            const barWidth = (importance * 100).toFixed(0);
            featureHTML += `
                <div class="feature-bar-item">
                    <span class="feature-name">${feature}</span>
                    <div class="feature-bar-wrapper">
                        <div class="feature-bar" style="width: ${barWidth}%"></div>
                    </div>
                    <span class="feature-value">${(importance * 100).toFixed(1)}%</span>
                </div>
            `;
        });
        featureImportance.innerHTML = featureHTML;
    }

    // Model Parameters
    const modelParams = document.getElementById('model-params');
    if (modelParams && result.modelParameters) {
        let paramsHTML = '';
        Object.entries(result.modelParameters).forEach(([param, value]) => {
            paramsHTML += `
                <div class="param-item">
                    <span class="param-name">${param}</span>
                    <span class="param-value">${value}</span>
                </div>
            `;
        });
        modelParams.innerHTML = paramsHTML;
    }

    // Model Summary
    const modelSummaryText = document.getElementById('model-summary-text');
    if (modelSummaryText) {
        let summaryContent = result.modelSummary || 'Model trained successfully.';
        if (result.recommendations) {
            summaryContent += `<br><br><strong>Recommendations:</strong> ${result.recommendations}`;
        }
        modelSummaryText.innerHTML = summaryContent;
    }

    // Training Configuration
    const trainingConfig = document.getElementById('training-config');
    if (trainingConfig) {
        const dataAnalysis = result.dataAnalysis || {};
        trainingConfig.innerHTML = `
            <div class="config-item">
                <span class="config-label">Random State</span>
                <span class="config-value">42</span>
            </div>
            <div class="config-item">
                <span class="config-label">Validation</span>
                <span class="config-value">5-Fold CV</span>
            </div>
            <div class="config-item">
                <span class="config-label">Scaling</span>
                <span class="config-value">StandardScaler</span>
            </div>
            <div class="config-item">
                <span class="config-label">Missing Values</span>
                <span class="config-value">${dataAnalysis.missingValues || 0}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Categorical Features</span>
                <span class="config-value">${dataAnalysis.categoricalFeatures || 0}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Numerical Features</span>
                <span class="config-value">${dataAnalysis.numericalFeatures || result.featureColumns?.length || 0}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Target Distribution</span>
                <span class="config-value">${dataAnalysis.targetDistribution || 'Analyzed'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Encoding</span>
                <span class="config-value">Label Encoder</span>
            </div>
        `;
    }

    // Render Charts
    renderCharts(result);

    // Show prediction section
    showPredictionSection();
}

// Chart rendering functions
let featureChart = null;
let metricsChart = null;

function renderCharts(result) {
    // Feature Importance Chart
    const featureCtx = document.getElementById('feature-importance-chart');
    if (featureCtx && result.featureImportance) {
        // Destroy existing chart
        if (featureChart) {
            featureChart.destroy();
        }

        const sortedFeatures = Object.entries(result.featureImportance)
            .sort((a, b) => b[1] - a[1]);
        
        const labels = sortedFeatures.map(([name]) => name);
        const data = sortedFeatures.map(([, value]) => (value * 100).toFixed(1));

        featureChart = new Chart(featureCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Importance (%)',
                    data: data,
                    backgroundColor: 'rgba(26, 115, 232, 0.8)',
                    borderColor: 'rgba(26, 115, 232, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    // Metrics Chart
    const metricsCtx = document.getElementById('metrics-chart');
    if (metricsCtx && result.metrics) {
        // Destroy existing chart
        if (metricsChart) {
            metricsChart.destroy();
        }

        const metrics = result.metrics;
        const metricLabels = [];
        const metricData = [];
        const metricColors = [];

        if (metrics.accuracy !== null && metrics.accuracy !== undefined) {
            metricLabels.push('Accuracy');
            metricData.push((metrics.accuracy * 100).toFixed(1));
            metricColors.push('rgba(19, 115, 51, 0.8)');
        }
        if (metrics.precision !== null && metrics.precision !== undefined) {
            metricLabels.push('Precision');
            metricData.push((metrics.precision * 100).toFixed(1));
            metricColors.push('rgba(26, 115, 232, 0.8)');
        }
        if (metrics.recall !== null && metrics.recall !== undefined) {
            metricLabels.push('Recall');
            metricData.push((metrics.recall * 100).toFixed(1));
            metricColors.push('rgba(249, 171, 0, 0.8)');
        }
        if (metrics.f1Score !== null && metrics.f1Score !== undefined) {
            metricLabels.push('F1 Score');
            metricData.push((metrics.f1Score * 100).toFixed(1));
            metricColors.push('rgba(217, 48, 37, 0.8)');
        }
        if (metrics.r2Score !== null && metrics.r2Score !== undefined) {
            metricLabels.push('R² Score');
            metricData.push((metrics.r2Score * 100).toFixed(1));
            metricColors.push('rgba(156, 39, 176, 0.8)');
        }
        if (metrics.crossValScore !== null && metrics.crossValScore !== undefined) {
            metricLabels.push('Cross-Val');
            metricData.push((metrics.crossValScore * 100).toFixed(1));
            metricColors.push('rgba(0, 150, 136, 0.8)');
        }

        metricsChart = new Chart(metricsCtx, {
            type: 'radar',
            data: {
                labels: metricLabels,
                datasets: [{
                    label: 'Model Performance',
                    data: metricData,
                    backgroundColor: 'rgba(26, 115, 232, 0.2)',
                    borderColor: 'rgba(26, 115, 232, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(26, 115, 232, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(26, 115, 232, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            callback: function(value) {
                                return value + '%';
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        angleLines: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    }
                }
            }
        });
    }
}

function showPredictionSection() {
    if (!elements.predictionSection || !elements.predictionInputs || !state.featureColumns) return;

    elements.predictionSection.style.display = 'block';

    // Build input fields for each feature
    let inputsHTML = '';
    state.featureColumns.forEach(col => {
        inputsHTML += `
            <div class="prediction-input-group">
                <label for="pred-${col}">${col}</label>
                <input type="text" id="pred-${col}" data-feature="${col}" placeholder="Enter ${col}">
            </div>
        `;
    });

    elements.predictionInputs.innerHTML = inputsHTML;
}

async function downloadModel() {
    if (!state.trainedModelId) {
        showToast('No trained model to download', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/model/${state.trainedModelId}/download`);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Download failed');
        }

        downloadFile(result.content, result.filename, result.contentType);
        showToast(`Downloaded ${result.filename}`, 'success');

    } catch (error) {
        console.error('Download error:', error);
        showToast(error.message, 'error');
    }
}

function downloadTrainingReport() {
    if (!state.trainedModelId || !state.lastTrainingResult) {
        showToast('No training report available', 'error');
        return;
    }

    const result = state.lastTrainingResult;
    const report = `
================================================================================
                        MACHINE LEARNING TRAINING REPORT
================================================================================

Generated: ${new Date().toISOString()}
Model ID: ${state.trainedModelId}

--------------------------------------------------------------------------------
MODEL CONFIGURATION
--------------------------------------------------------------------------------
Model Type:          ${result.modelDisplayName || result.modelType}
Task Type:           ${result.taskType || 'Classification'}
Target Column:       ${state.targetColumn}
Feature Columns:     ${state.featureColumns.join(', ')}

--------------------------------------------------------------------------------
DATA SPLIT
--------------------------------------------------------------------------------
Total Samples:       ${result.trainSize + result.testSize}
Training Samples:    ${result.trainSize}
Test Samples:        ${result.testSize}
Test Split Ratio:    ${(result.testSize / (result.trainSize + result.testSize) * 100).toFixed(0)}%

--------------------------------------------------------------------------------
PERFORMANCE METRICS
--------------------------------------------------------------------------------
${result.metrics.accuracy !== null ? `Accuracy:            ${(result.metrics.accuracy * 100).toFixed(2)}%` : ''}
${result.metrics.precision !== null ? `Precision:           ${(result.metrics.precision * 100).toFixed(2)}%` : ''}
${result.metrics.recall !== null ? `Recall:              ${(result.metrics.recall * 100).toFixed(2)}%` : ''}
${result.metrics.f1Score !== null ? `F1 Score:            ${(result.metrics.f1Score * 100).toFixed(2)}%` : ''}
${result.metrics.r2Score !== null ? `R² Score:            ${(result.metrics.r2Score * 100).toFixed(2)}%` : ''}
${result.metrics.mse !== null ? `MSE:                 ${result.metrics.mse}` : ''}
${result.metrics.rmse !== null ? `RMSE:                ${result.metrics.rmse}` : ''}
${result.metrics.mae !== null ? `MAE:                 ${result.metrics.mae}` : ''}
${result.metrics.crossValScore !== null ? `Cross-Val Score:     ${(result.metrics.crossValScore * 100).toFixed(2)}%` : ''}
Training Time:       ${result.metrics.trainingTime || 'N/A'}

--------------------------------------------------------------------------------
FEATURE IMPORTANCE
--------------------------------------------------------------------------------
${Object.entries(result.featureImportance || {})
    .sort((a, b) => b[1] - a[1])
    .map(([feature, importance]) => `${feature.padEnd(20)} ${(importance * 100).toFixed(2)}%`)
    .join('\n')}

--------------------------------------------------------------------------------
HYPERPARAMETERS
--------------------------------------------------------------------------------
${Object.entries(result.modelParameters || {})
    .map(([param, value]) => `${param.padEnd(20)} ${value}`)
    .join('\n')}

--------------------------------------------------------------------------------
MODEL SUMMARY
--------------------------------------------------------------------------------
${result.modelSummary || 'N/A'}

${result.recommendations ? `
--------------------------------------------------------------------------------
RECOMMENDATIONS
--------------------------------------------------------------------------------
${result.recommendations}
` : ''}

================================================================================
                              END OF REPORT
================================================================================
`;

    downloadFile(report, `training_report_${state.trainedModelId}.txt`, 'text/plain');
    showToast('Training report downloaded', 'success');
}

async function makePrediction() {
    if (!state.trainedModelId) {
        showToast('Please train a model first', 'error');
        return;
    }

    // Gather input values
    const inputData = {};
    let hasAllInputs = true;

    state.featureColumns.forEach(col => {
        const input = document.querySelector(`[data-feature="${col}"]`);
        if (input && input.value.trim()) {
            // Try to convert to number if possible
            const value = input.value.trim();
            inputData[col] = isNaN(value) ? value : parseFloat(value);
        } else {
            hasAllInputs = false;
        }
    });

    if (!hasAllInputs) {
        showToast('Please fill in all feature values', 'error');
        return;
    }

    try {
        showToast('Making prediction...', 'info');

        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                modelId: state.trainedModelId,
                inputData: inputData
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Prediction failed');
        }

        // Display prediction result
        if (elements.predictionResult && elements.resultValue) {
            elements.predictionResult.style.display = 'flex';
            elements.resultValue.textContent = result.prediction;
        }

        showToast('Prediction complete!', 'success');

    } catch (error) {
        console.error('Prediction error:', error);
        showToast(error.message, 'error');
    }
}
