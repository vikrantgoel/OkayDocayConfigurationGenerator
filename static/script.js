// ================================
// OKAYDOCAY ENHANCED - COMPLETE MERGED JAVASCRIPT
// PDF Configuration Maker with GitHub Integration
// All features in one file - no conflicts
// ================================

// ================================
// GLOBAL VARIABLES
// ================================

let currentPdf = null;
let currentPage = 1;
let totalPages = 0;
let isSelecting = false;
let selectionStart = null;
let currentScale = 1.0;
let baseResolution = 150;
let pdfDimensions = { width: 0, height: 0 };
let currentImageDimensions = { width: 0, height: 0 };
let hasValidSelection = false;
let fieldDefinitions = [];
let currentFieldType = 'text';
let currentCheckboxOptions = [];
let isAddingCheckboxOption = false;

// GitHub Integration Variables
let githubConfigured = false;
let githubRepoInfo = null;
let pendingDownloadData = null;

// Field types
const FIELD_TYPES = {
    TEXT: 'text',
    SIGNATURE: 'signature',
    CHECKBOX: 'checkbox'
};

// DOM elements - Safe references
let uploadArea, fileInput, pdfControls, pdfCanvas, pageInfo, statusArea;
let extractedText, debugInfo, coordinateDebug, zoomInfo, canvasContainer;
let loadingOverlay, loadingText;
let stepUpload, stepNavigate, stepSelect, stepExtract;

// ================================
// INITIALIZATION WITH GITHUB CHECK
// ================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 OkayDocay Enhanced with GitHub Integration - Initializing...');

    // Initialize DOM references
    initializeDOMReferences();

    // Setup all event listeners
    setupEventListeners();

    // Initialize UI state
    updateStepIndicator('upload');
    setupRightClickNavigation();
    setupFieldTypeControls();
    setupModalEventListeners();

    // Check GitHub configuration
    checkGitHubConfiguration();

    console.log('✅ OkayDocay Enhanced with GitHub - Ready!');
});

function initializeDOMReferences() {
    // Main UI elements
    uploadArea = document.getElementById('upload-area');
    fileInput = document.getElementById('pdf-file');
    pdfControls = document.getElementById('pdf-controls');
    pdfCanvas = document.getElementById('pdf-canvas');
    pageInfo = document.getElementById('page-info');
    statusArea = document.getElementById('status-area');
    extractedText = document.getElementById('extracted-text');
    debugInfo = document.getElementById('debug-info');
    coordinateDebug = document.getElementById('coordinate-debug');
    zoomInfo = document.getElementById('zoom-info');
    canvasContainer = document.getElementById('canvas-container');
    loadingOverlay = document.getElementById('loading-overlay');
    loadingText = document.getElementById('loading-text');

    // Step indicators
    stepUpload = document.getElementById('step-upload');
    stepNavigate = document.getElementById('step-navigate');
    stepSelect = document.getElementById('step-select');
    stepExtract = document.getElementById('step-extract');
}

// ================================
// GITHUB CONFIGURATION FUNCTIONS
// ================================

async function checkGitHubConfiguration() {
    try {
        const response = await fetch('/github_config');
        const result = await response.json();

        if (result.success) {
            githubConfigured = result.github_configured;
            githubRepoInfo = {
                owner: result.repo_owner,
                name: result.repo_name,
                url: result.repo_url
            };

            updateGitHubUI();
            console.log(`🐙 GitHub Status: ${githubConfigured ? 'Configured' : 'Not configured'}`);
        }
    } catch (error) {
        console.error('Error checking GitHub configuration:', error);
        githubConfigured = false;
        updateGitHubUI();
    }
}

function updateGitHubUI() {
    const githubStatus = document.getElementById('github-status');
    const githubStatusContent = document.getElementById('github-status-content');
    const githubSection = document.getElementById('github-integration-section');
    const githubCheckbox = document.getElementById('upload-to-github');
    const githubDescription = document.getElementById('github-option-description');
    const repoInfo = document.getElementById('github-repo-info');
    const repoDisplay = document.getElementById('repo-display');

    // Show GitHub status panel
    if (githubStatus) githubStatus.style.display = 'block';

    if (githubConfigured) {
        // GitHub is configured
        if (githubStatusContent) {
            githubStatusContent.innerHTML = `
                <p style="font-size: 0.875rem; color: var(--success); margin: 0;">
                    ✅ Connected to <strong>${githubRepoInfo.owner}/${githubRepoInfo.name}</strong>
                </p>
                <a href="${githubRepoInfo.url}" target="_blank" style="font-size: 0.8rem; color: var(--github); text-decoration: none;">
                    View Repository →
                </a>
            `;
        }

        if (githubSection) {
            githubSection.classList.add('github-configured');
            githubSection.classList.remove('github-not-configured');
        }

        if (githubCheckbox) githubCheckbox.disabled = false;
        if (githubDescription) {
            githubDescription.textContent = 'Upload generated files directly to your GitHub repository for easy access and version control';
        }

        if (repoDisplay) repoDisplay.textContent = `${githubRepoInfo.owner}/${githubRepoInfo.name}`;

    } else {
        // GitHub is not configured
        if (githubStatusContent) {
            githubStatusContent.innerHTML = `
                <p style="font-size: 0.875rem; color: var(--warning); margin: 0;">
                    ⚠️ GitHub not configured - files will be downloaded only
                </p>
                <p style="font-size: 0.8rem; color: var(--gray-600); margin: 4px 0 0 0;">
                    Set GITHUB_TOKEN environment variable to enable GitHub integration
                </p>
            `;
        }

        if (githubSection) {
            githubSection.classList.add('github-not-configured');
            githubSection.classList.remove('github-configured');
        }

        if (githubCheckbox) {
            githubCheckbox.disabled = true;
            githubCheckbox.checked = false;
        }

        if (githubDescription) {
            githubDescription.textContent = 'GitHub integration not available - configure GITHUB_TOKEN to enable repository uploads';
        }
    }
}

function handleGitHubOptionChange() {
    const githubCheckbox = document.getElementById('upload-to-github');
    const repoInfo = document.getElementById('github-repo-info');

    if (githubCheckbox && repoInfo) {
        if (githubCheckbox.checked && githubConfigured) {
            repoInfo.style.display = 'block';
        } else {
            repoInfo.style.display = 'none';
        }
    }

    updateGitHubReminder();
}

function updateGitHubReminder() {
    const githubCheckbox = document.getElementById('upload-to-github');
    const githubReminder = document.getElementById('github-reminder');
    const githubReminderText = document.getElementById('github-reminder-text');

    if (githubCheckbox && githubReminder && githubReminderText) {
        if (githubCheckbox.checked && githubConfigured) {
            githubReminder.style.display = 'block';
            githubReminderText.textContent = `Will upload to ${githubRepoInfo.owner}/${githubRepoInfo.name}`;
        } else {
            githubReminder.style.display = 'none';
        }
    }
}

// ================================
// FIELD TYPE SETUP AND MANAGEMENT
// ================================

function setupFieldTypeControls() {
    const fieldTypeSelect = document.getElementById('field-type');
    const addOptionBtn = document.getElementById('add-checkbox-option-btn');
    const finishCheckboxBtn = document.getElementById('finish-checkbox-btn');

    if (fieldTypeSelect) {
        fieldTypeSelect.addEventListener('change', handleFieldTypeChange);
    }

    if (addOptionBtn) {
        addOptionBtn.addEventListener('click', addCheckboxOption);
    }

    if (finishCheckboxBtn) {
        finishCheckboxBtn.addEventListener('click', finishCheckboxField);
    }
}

function handleFieldTypeChange() {
    const fieldTypeSelect = document.getElementById('field-type');
    if (!fieldTypeSelect) return;

    const fieldType = fieldTypeSelect.value;
    const checkboxContainer = document.getElementById('checkbox-options-container');
    const normalControls = document.getElementById('normal-field-controls');

    currentFieldType = fieldType;

    if (fieldType === FIELD_TYPES.CHECKBOX) {
        if (checkboxContainer) checkboxContainer.classList.remove('hidden');
        if (normalControls) normalControls.classList.add('hidden');
        currentCheckboxOptions = [];
        updateCheckboxOptionsList();
        showStatus('Checkbox mode: Select areas for each option', 'info');
    } else {
        if (checkboxContainer) checkboxContainer.classList.add('hidden');
        if (normalControls) normalControls.classList.remove('hidden');
        currentCheckboxOptions = [];
        isAddingCheckboxOption = false;
    }

    validateField();
}

function addCheckboxOption() {
    const optionNameInput = document.getElementById('checkbox-option-name');
    const currentCoordsInput = document.getElementById('current-coords');
    const targetPageSelect = document.getElementById('target-page');

    if (!optionNameInput || !currentCoordsInput || !targetPageSelect) return;

    const optionName = optionNameInput.value.trim();
    const coordinates = currentCoordsInput.value;

    if (!optionName) {
        showStatus('Please enter an option name', 'error');
        return;
    }

    if (!coordinates || !hasValidSelection) {
        showStatus('Please select an area on the PDF for this option', 'error');
        return;
    }

    // Check for duplicate option names
    if (currentCheckboxOptions.find(opt => opt.name === optionName)) {
        showStatus(`Option "${optionName}" already exists`, 'warning');
        return;
    }

    const option = {
        name: optionName,
        coordinates: coordinates,
        page: parseInt(targetPageSelect.value)
    };

    currentCheckboxOptions.push(option);
    updateCheckboxOptionsList();

    // Clear inputs for next option
    optionNameInput.value = '';
    currentCoordsInput.value = '';
    clearSelectionOnly();

    showStatus(`Option "${optionName}" added. Add more options or finish the checkbox field.`, 'success');

    // Enable finish button
    const finishBtn = document.getElementById('finish-checkbox-btn');
    if (finishBtn) finishBtn.disabled = false;
}

function updateCheckboxOptionsList() {
    const optionsList = document.getElementById('checkbox-options-list');
    if (!optionsList) return;

    if (currentCheckboxOptions.length === 0) {
        optionsList.innerHTML = '<div style="text-align: center; opacity: 0.7; font-style: italic;">No options added yet. Select areas and add options above.</div>';
        return;
    }

    let html = '<div style="margin-bottom: 10px;"><strong>📋 Checkbox Options:</strong></div>';
    currentCheckboxOptions.forEach((option, index) => {
        html += `<div class="checkbox-option-item" style="margin: 5px 0; padding: 8px; background: rgba(147, 51, 234, 0.05); border-radius: 5px; font-size: 12px; border: 1px solid rgba(147, 51, 234, 0.1);">`;
        html += `☑️ <strong>${option.name}</strong><br>`;
        html += `📍 Page ${option.page}: ${option.coordinates}`;
        html += `<button onclick="removeCheckboxOption(${index})" class="remove-field-btn" style="float: right; margin-left: 5px; padding: 2px 6px; font-size: 11px;">Remove</button>`;
        html += `<button onclick="previewCheckboxOption(${index})" class="edit-field-btn" style="float: right; margin-right: 5px; padding: 2px 6px; font-size: 11px;">Preview</button>`;
        html += `</div>`;
    });

    optionsList.innerHTML = html;
}

function removeCheckboxOption(index) {
    if (index >= 0 && index < currentCheckboxOptions.length) {
        const removedOption = currentCheckboxOptions.splice(index, 1)[0];
        updateCheckboxOptionsList();
        showStatus(`Option "${removedOption.name}" removed`, 'info');

        if (currentCheckboxOptions.length === 0) {
            const finishBtn = document.getElementById('finish-checkbox-btn');
            if (finishBtn) finishBtn.disabled = true;
        }
    }
}

function previewCheckboxOption(index) {
    if (index >= 0 && index < currentCheckboxOptions.length) {
        const option = currentCheckboxOptions[index];
        const coords = option.coordinates.split(',').map(c => parseFloat(c));

        if (coords.length === 4) {
            // Navigate to option's page if different
            if (option.page !== currentPage) {
                currentPage = option.page;
                loadPage(currentPage).then(() => {
                    showFieldPreview(coords[0], coords[1], coords[2], coords[3], '#9333ea');
                });
            } else {
                showFieldPreview(coords[0], coords[1], coords[2], coords[3], '#9333ea');
            }
            showStatus(`Previewing option "${option.name}" on page ${option.page}`, 'info');
        }
    }
}

function finishCheckboxField() {
    const fieldNameInput = document.getElementById('field-name');
    if (!fieldNameInput) return;

    const fieldName = fieldNameInput.value.trim();

    if (!fieldName) {
        showStatus('Please enter a field name for the checkbox group', 'error');
        return;
    }

    if (currentCheckboxOptions.length === 0) {
        showStatus('Please add at least one checkbox option', 'error');
        return;
    }

    // Create checkbox field
    const checkboxField = {
        name: fieldName,
        type: FIELD_TYPES.CHECKBOX,
        options: currentCheckboxOptions.map(opt => ({
            name: opt.name,
            coordinates: opt.coordinates,
            page: opt.page
        })),
        created_at: new Date().toISOString()
    };

    addFieldToDefinitions(checkboxField);

    // Reset checkbox mode
    currentCheckboxOptions = [];
    fieldNameInput.value = '';

    const optionNameInput = document.getElementById('checkbox-option-name');
    const finishBtn = document.getElementById('finish-checkbox-btn');

    if (optionNameInput) optionNameInput.value = '';
    if (finishBtn) finishBtn.disabled = true;

    updateCheckboxOptionsList();

    showStatus(`Checkbox field "${fieldName}" created with ${checkboxField.options.length} options`, 'success');
}

// ================================
// SERVER-SIDE EXTRACTED DATA FUNCTIONS
// ================================

async function getExtractedData() {
    try {
        const response = await fetch('/get_extracted_data');
        const result = await response.json();
        if (result.success) {
            return result.extracted_data;
        }
        throw new Error(result.error || 'Failed to get extracted data');
    } catch (error) {
        console.error('Error getting extracted data:', error);
        return null;
    }
}

async function updateExtractedData(updates) {
    try {
        const response = await fetch('/update_extracted_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        const result = await response.json();
        if (result.success) {
            return result.extracted_data;
        }
        throw new Error(result.error || 'Failed to update extracted data');
    } catch (error) {
        console.error('Error updating extracted data:', error);
        return null;
    }
}

async function addFieldToServer(fieldData) {
    try {
        const response = await fetch('/add_field_to_extracted_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fieldData)
        });
        const result = await response.json();
        if (result.success) {
            return result.extracted_data;
        }
        throw new Error(result.error || 'Failed to add field');
    } catch (error) {
        console.error('Error adding field to server:', error);
        return null;
    }
}

// ================================
// EVENT LISTENERS SETUP
// ================================

function setupEventListeners() {
    console.log('Setting up event listeners...');

    // File upload events
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }

    // Drag and drop events
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('drop', handleDrop);
        uploadArea.addEventListener('dragleave', handleDragLeave);
    }

    // Page navigation controls
    setupPageControls();

    // Canvas selection events
    setupCanvasEvents();

    // Input field events
    setupInputEvents();

    // Button events
    setupButtonEvents();

    // Search events
    setupSearchEvents();

    // Config maker events
    setupConfigMakerEvents();
}

function setupPageControls() {
    const prevPage = document.getElementById('prev-page');
    const nextPage = document.getElementById('next-page');
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const resetZoomBtn = document.getElementById('reset-zoom');

    if (prevPage) prevPage.addEventListener('click', () => changePage(-1));
    if (nextPage) nextPage.addEventListener('click', () => changePage(1));
    if (zoomIn) zoomIn.addEventListener('click', () => changeZoom(1.25));
    if (zoomOut) zoomOut.addEventListener('click', () => changeZoom(0.8));
    if (resetZoomBtn) resetZoomBtn.addEventListener('click', () => resetZoom());
}

function setupCanvasEvents() {
    if (pdfCanvas) {
        pdfCanvas.addEventListener('mousedown', startSelection);
        pdfCanvas.addEventListener('load', onImageLoad);
        pdfCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Global mouse events for selection
    document.addEventListener('mousemove', updateSelection);
    document.addEventListener('mouseup', endSelection);
}

function setupInputEvents() {
    // Coordinate inputs
    const coordInput = document.getElementById('coord-input');
    if (coordInput) {
        coordInput.addEventListener('input', updateCoordinatesFromInput);
    }

    // Individual coordinate fields
    ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', validateAndUpdateCoordinates);
        }
    });

    // Field name input
    const fieldNameInput = document.getElementById('field-name');
    if (fieldNameInput) {
        fieldNameInput.addEventListener('input', validateField);
    }

    // Checkbox option name input
    const optionNameInput = document.getElementById('checkbox-option-name');
    if (optionNameInput) {
        optionNameInput.addEventListener('input', validateField);
    }
}

function setupButtonEvents() {
    // Action buttons
    const buttons = [
        { id: 'extract-btn', handler: extractText },
        { id: 'show-area-btn', handler: showArea },
        { id: 'clear-selection-btn', handler: clearSelection },
        { id: 'search-btn', handler: searchText },
        { id: 'export-btn', handler: exportResults },
        { id: 'analyze-layout-btn', handler: analyzeLayout }
    ];

    buttons.forEach(({ id, handler }) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('click', handler);
        }
    });
}

function setupSearchEvents() {
    const searchTextInput = document.getElementById('search-text');
    if (searchTextInput) {
        searchTextInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchText();
            }
        });
    }
}

function setupConfigMakerEvents() {
    const configButtons = [
        { id: 'target-page', handler: handlePageSelection, event: 'change' },
        { id: 'add-field-btn', handler: addField, event: 'click' },
        { id: 'preview-field-btn', handler: previewField, event: 'click' },
        { id: 'clear-fields-btn', handler: clearAllFields, event: 'click' },
        { id: 'generate-config-btn', handler: generateConfig, event: 'click' }
    ];

    configButtons.forEach(({ id, handler, event }) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        }
    });
}


// MODAL EVENT LISTENERS (GITHUB INTEGRATION)


function setupModalEventListeners() {
    // Modal controls
    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeConfigGenerationModal);

    const cancelBtn = document.getElementById('cancel-generation-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeConfigGenerationModal);

    const continueBtn = document.getElementById('continue-generation-btn');
    if (continueBtn) continueBtn.addEventListener('click', continueGeneration);

    const backBtn = document.getElementById('back-generation-btn');
    if (backBtn) backBtn.addEventListener('click', backToStep1);

    const generateFinalBtn = document.getElementById('generate-final-btn');
    if (generateFinalBtn) generateFinalBtn.addEventListener('click', executeGeneration);

    // JSON input controls
    const loadExampleBtn = document.getElementById('load-example-data-btn');
    if (loadExampleBtn) loadExampleBtn.addEventListener('click', loadExampleSimpleJson);

    const validateBtn = document.getElementById('validate-json-btn');
    if (validateBtn) validateBtn.addEventListener('click', validateJsonInput);

    const clearBtn = document.getElementById('clear-json-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearJsonInput);

    // GitHub controls
    const githubCheckbox = document.getElementById('upload-to-github');
    if (githubCheckbox) githubCheckbox.addEventListener('change', handleGitHubOptionChange);

    const downloadFilesBtn = document.getElementById('download-files-btn');
    if (downloadFilesBtn) downloadFilesBtn.addEventListener('click', downloadPendingFiles);

    const uploadToGithubLaterBtn = document.getElementById('upload-to-github-later-btn');
    if (uploadToGithubLaterBtn) uploadToGithubLaterBtn.addEventListener('click', uploadToGithubLater);

    // Close modal when clicking outside
    const modal = document.getElementById('config-generation-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeConfigGenerationModal();
            }
        });
    }
}


// RIGHT-CLICK DRAG NAVIGATION


function setupRightClickNavigation() {
    let isRightDragging = false;
    let rightDragStart = { x: 0, y: 0 };
    let scrollStart = { x: 0, y: 0 };

    if (!canvasContainer) return;

    canvasContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    canvasContainer.addEventListener('mousedown', (e) => {
        if (e.button === 2) { // Right click
            isRightDragging = true;
            rightDragStart.x = e.clientX;
            rightDragStart.y = e.clientY;
            scrollStart.x = canvasContainer.scrollLeft;
            scrollStart.y = canvasContainer.scrollTop;
            canvasContainer.style.cursor = 'grabbing';
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });

    canvasContainer.addEventListener('mousemove', (e) => {
        if (isRightDragging) {
            const deltaX = rightDragStart.x - e.clientX;
            const deltaY = rightDragStart.y - e.clientY;
            canvasContainer.scrollLeft = scrollStart.x + deltaX;
            canvasContainer.scrollTop = scrollStart.y + deltaY;
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isRightDragging && e.button === 2) {
            isRightDragging = false;
            canvasContainer.style.cursor = 'crosshair';
        }
    });

    canvasContainer.addEventListener('mouseleave', () => {
        if (isRightDragging) {
            isRightDragging = false;
            canvasContainer.style.cursor = 'crosshair';
        }
    });
}


// UTILITY FUNCTIONS


function showLoading(message = 'Processing...') {
    if (loadingText) loadingText.textContent = message;
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

function updateStepIndicator(currentStep) {
    const steps = [stepUpload, stepNavigate, stepSelect, stepExtract];
    steps.forEach(step => {
        if (step) {
            step.classList.remove('active', 'completed');
        }
    });

    switch(currentStep) {
        case 'upload':
            if (stepUpload) stepUpload.classList.add('active');
            break;
        case 'navigate':
            if (stepUpload) stepUpload.classList.add('completed');
            if (stepNavigate) stepNavigate.classList.add('active');
            break;
        case 'select':
            if (stepUpload) stepUpload.classList.add('completed');
            if (stepNavigate) stepNavigate.classList.add('completed');
            if (stepSelect) stepSelect.classList.add('active');
            break;
        case 'extract':
            if (stepUpload) stepUpload.classList.add('completed');
            if (stepNavigate) stepNavigate.classList.add('completed');
            if (stepSelect) stepSelect.classList.add('completed');
            if (stepExtract) stepExtract.classList.add('active');
            break;
    }
}

function enableControls(enable = true) {
    const controlIds = [
        'search-text', 'search-btn', 'coord-input',
        'pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2',
        'show-area-btn', 'clear-selection-btn', 'analyze-layout-btn'
    ];

    controlIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = !enable;
        }
    });

    if (enable) {
        const configSection = document.getElementById('config-section');
        const configControls = document.getElementById('config-controls');
        const targetPageSelect = document.getElementById('target-page');

        if (configSection) configSection.style.display = 'block';
        if (configControls) configControls.classList.remove('hidden');
        if (targetPageSelect) targetPageSelect.disabled = false;

        populatePageDropdown();
    }
}

function enableExtractionControls(enable = true) {
    const extractBtn = document.getElementById('extract-btn');
    const exportBtn = document.getElementById('export-btn');

    if (extractBtn) extractBtn.disabled = !enable;
    if (exportBtn) exportBtn.disabled = !enable;
}

function updatePageControls() {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function updateZoomInfo() {
    if (zoomInfo) zoomInfo.textContent = Math.round(currentScale * 100) + '%';
}

function updatePageInfo() {
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

function updateDebugInfo(info) {
    if (debugInfo) debugInfo.innerHTML = info;
}

function getCoordinateConversionFactor() {
    return {
        x: pdfDimensions.width / currentImageDimensions.width,
        y: pdfDimensions.height / currentImageDimensions.height
    };
}

function showStatus(message, type) {
    if (statusArea) {
        statusArea.innerHTML = `<div class="status ${type}">${message}</div>`;
        setTimeout(() => {
            if (statusArea && statusArea.innerHTML.includes(message)) {
                statusArea.innerHTML = '';
            }
        }, 6000);
    }
}

// ================================
// FILE UPLOAD FUNCTIONS
// ================================

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        uploadPdf(file);
    } else {
        showStatus('Please select a valid PDF file', 'error');
    }
}

function handleDragOver(event) {
    event.preventDefault();
    if (uploadArea) uploadArea.classList.add('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    if (uploadArea) uploadArea.classList.remove('dragover');

    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        if (fileInput) fileInput.files = event.dataTransfer.files;
        uploadPdf(file);
    } else {
        showStatus('Please drop a valid PDF file', 'error');
    }
}

function handleDragLeave(event) {
    if (uploadArea) uploadArea.classList.remove('dragover');
}

async function uploadPdf(file) {
    const formData = new FormData();
    formData.append('pdf_file', file);

    showLoading('Processing PDF with OkayDocay Enhanced...');

    try {
        const response = await fetch('/upload_pdf', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            currentPdf = result.filename;
            totalPages = result.page_count;
            currentPage = 1;
            pdfDimensions.width = result.page_width;
            pdfDimensions.height = result.page_height;

            // Reset field definitions for new PDF
            fieldDefinitions = [];
            currentCheckboxOptions = [];
            updateFieldsList();

            // Update UI
            if (uploadArea) uploadArea.classList.add('hidden');
            if (pdfControls) pdfControls.classList.remove('hidden');
            if (coordinateDebug) coordinateDebug.classList.remove('hidden');

            currentScale = 1.0;
            hideLoading();

            await loadPage(1);
            enableControls(true);
            updateStepIndicator('navigate');

            showStatus(`PDF loaded successfully! ${totalPages} pages (${result.page_width}×${result.page_height} pts)`, 'success');

            console.log('Server-side extracted data initialized:', result.extracted_data);
        } else {
            hideLoading();
            showStatus(`Upload failed: ${result.error}`, 'error');
        }
    } catch (error) {
        hideLoading();
        showStatus(`Upload error: ${error.message}`, 'error');
        console.error('Upload error:', error);
    }
}

// ================================
// PDF PAGE LOADING
// ================================

async function loadPage(pageNum) {
    if (!currentPdf) return;

    showStatus(`Loading page ${pageNum} at ${Math.round(currentScale * 100)}% zoom...`, 'info');

    try {
        const response = await fetch(`/get_page/${pageNum}?scale=${currentScale}&filename=${currentPdf}`);
        const result = await response.json();

        if (result.success) {
            if (pdfCanvas) {
                pdfCanvas.src = result.image;
            }

            currentImageDimensions.width = result.display_width;
            currentImageDimensions.height = result.display_height;

            updateZoomInfo();
            updatePageInfo();
            updatePageControls();

            // Update target page dropdown
            const targetPageDropdown = document.getElementById('target-page');
            if (targetPageDropdown && targetPageDropdown.value !== pageNum.toString()) {
                targetPageDropdown.value = pageNum.toString();
            }

            clearSelectionOnly();

            const qualityInfo = result.cached ? ' (cached)' : '';
            showStatus(`Page ${pageNum} loaded at ${result.resolution} DPI${qualityInfo} - ${result.word_count} words`, 'success');

            updateDebugInfo(`Loaded: PDF(${pdfDimensions.width}×${pdfDimensions.height}) -> Image(${currentImageDimensions.width}×${currentImageDimensions.height})`);
        } else {
            showStatus(`Failed to load page: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus(`Page load error: ${error.message}`, 'error');
        console.error('Page load error:', error);
    }
}

function onImageLoad() {
    if (pdfCanvas) {
        pdfCanvas.style.width = currentImageDimensions.width + 'px';
        pdfCanvas.style.height = currentImageDimensions.height + 'px';
        updateDebugInfo(`Image set to: ${currentImageDimensions.width}×${currentImageDimensions.height}px`);
    }
}

function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        loadPage(currentPage);
    }
}

function changeZoom(factor) {
    currentScale *= factor;
    currentScale = Math.max(0.25, Math.min(4.0, currentScale));
    loadPage(currentPage);
}

function resetZoom() {
    currentScale = 1.0;
    loadPage(currentPage);
}


// SELECTION FUNCTIONS


function startSelection(event) {
    if (!currentPdf || !pdfCanvas) return;
    if (event.button !== 0) return; // Only left click

    isSelecting = true;
    const rect = pdfCanvas.getBoundingClientRect();

    selectionStart = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };

    clearHighlights();
    console.log(`Starting selection at: (${selectionStart.x}, ${selectionStart.y})`);
    event.preventDefault();
}

function updateSelection(event) {
    if (!isSelecting || !selectionStart || !pdfCanvas) return;

    const rect = pdfCanvas.getBoundingClientRect();
    const currentPos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };

    const imageCoords = {
        x1: Math.min(selectionStart.x, currentPos.x),
        y1: Math.min(selectionStart.y, currentPos.y),
        x2: Math.max(selectionStart.x, currentPos.x),
        y2: Math.max(selectionStart.y, currentPos.y)
    };

    const conversionFactor = getCoordinateConversionFactor();
    const pdfCoords = {
        x1: imageCoords.x1 * conversionFactor.x,
        y1: imageCoords.y1 * conversionFactor.y,
        x2: imageCoords.x2 * conversionFactor.x,
        y2: imageCoords.y2 * conversionFactor.y
    };

    showSelectionBox(selectionStart, currentPos);
    updateDebugInfo(`Selecting: PDF(${pdfCoords.x1.toFixed(1)}, ${pdfCoords.y1.toFixed(1)}, ${pdfCoords.x2.toFixed(1)}, ${pdfCoords.y2.toFixed(1)})`);
}

function endSelection(event) {
    if (!isSelecting || !selectionStart || !pdfCanvas) return;

    console.log('Selection ended');
    isSelecting = false;

    const rect = pdfCanvas.getBoundingClientRect();
    const endPos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };

    const selectionWidth = Math.abs(endPos.x - selectionStart.x);
    const selectionHeight = Math.abs(endPos.y - selectionStart.y);

    console.log(`Selection size: ${selectionWidth}x${selectionHeight}`);

    if (selectionWidth > 10 && selectionHeight > 10) {
        console.log('Valid selection - processing...');

        const imageCoords = {
            x1: Math.min(selectionStart.x, endPos.x),
            y1: Math.min(selectionStart.y, endPos.y),
            x2: Math.max(selectionStart.x, endPos.x),
            y2: Math.max(selectionStart.y, endPos.y)
        };

        const conversionFactor = getCoordinateConversionFactor();
        const pdfCoords = {
            x1: imageCoords.x1 * conversionFactor.x,
            y1: imageCoords.y1 * conversionFactor.y,
            x2: imageCoords.x2 * conversionFactor.x,
            y2: imageCoords.y2 * conversionFactor.y
        };

        console.log('Final PDF coordinates:', pdfCoords);

        updateCoordinateFields(pdfCoords.x1, pdfCoords.y1, pdfCoords.x2, pdfCoords.y2);
        extractTextFromSelection(pdfCoords.x1, pdfCoords.y1, pdfCoords.x2, pdfCoords.y2);
        showHighlight(imageCoords.x1, imageCoords.y1, imageCoords.x2, imageCoords.y2, '#ef4444');

    } else {
        console.log('Selection too small - ignoring');
        if (extractedText) {
            extractedText.textContent = 'Text will appear here after selection...';
            extractedText.classList.remove('has-text');
        }
    }

    clearSelectionBox();
}

function updateCoordinateFields(x1, y1, x2, y2) {
    const coordinateFields = {
        'pdf_x1': Math.round(x1 * 10) / 10,
        'pdf_y1': Math.round(y1 * 10) / 10,
        'pdf_x2': Math.round(x2 * 10) / 10,
        'pdf_y2': Math.round(y2 * 10) / 10,
        'coord-input': `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`,
        'current-coords': `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`,
        'checkbox-coords': `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`
    };

    Object.entries(coordinateFields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.value = value;
    });

    hasValidSelection = true;
    enableExtractionControls(true);
    updateStepIndicator('select');
    validateField();
}

function validateAndUpdateCoordinates() {
    const coordElements = ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2'];
    const coords = coordElements.map(id => {
        const element = document.getElementById(id);
        return element ? parseFloat(element.value) || 0 : 0;
    });

    const coordInput = document.getElementById('coord-input');
    if (coordInput) coordInput.value = coords.join(',');

    updateDebugInfo(`Manual PDF coords: (${coords.join(', ')})`);
    showArea();
}

function updateCoordinatesFromInput() {
    const coordInput = document.getElementById('coord-input');
    if (!coordInput) return;

    const input = coordInput.value;
    const coords = input.split(',').map(x => parseFloat(x.trim()));

    if (coords.length === 4 && coords.every(x => !isNaN(x))) {
        ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2'].forEach((id, index) => {
            const element = document.getElementById(id);
            if (element) element.value = coords[index];
        });
        showArea();
    }
}

function clearSelectionOnly() {
    clearHighlights();
    clearSelectionBox();

    const fieldIds = ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2', 'coord-input', 'current-coords', 'checkbox-coords'];
    fieldIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });

    if (extractedText) {
        extractedText.textContent = 'Text will appear here after selection...';
        extractedText.classList.remove('has-text');
    }

    hasValidSelection = false;
    updateDebugInfo('No coordinates selected');
    validateField();
}

function clearSelection() {
    clearSelectionOnly();
}

// ================================
// TEXT EXTRACTION
// ================================

async function extractTextFromSelection(x1, y1, x2, y2) {
    if (!currentPdf) {
        console.log('No PDF loaded');
        return;
    }

    console.log('Extracting text from coordinates:', { x1, y1, x2, y2, page: currentPage });

    try {
        const requestData = {
            page_num: currentPage,
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2
        };

        console.log('Sending extraction request:', requestData);

        const response = await fetch('/extract_text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Extraction result:', result);

        if (result.success) {
            const extractedTextValue = result.text || 'No text found in selected area';
            if (extractedText) {
                extractedText.textContent = extractedTextValue;
                extractedText.classList.add('has-text');
            }

            const conversionFactor = getCoordinateConversionFactor();
            const imageCoords = [
                x1 / conversionFactor.x,
                y1 / conversionFactor.y,
                x2 / conversionFactor.x,
                y2 / conversionFactor.y
            ];

            showHighlight(imageCoords[0], imageCoords[1], imageCoords[2], imageCoords[3]);

            const wordCount = result.word_count || 0;
            const preview = extractedTextValue.substring(0, 50) + (extractedTextValue.length > 50 ? '...' : '');
            showStatus(`Extracted ${wordCount} words: "${preview}"`, 'success');
        } else {
            const errorMsg = `Extraction failed: ${result.error || 'Unknown error'}`;
            if (extractedText) {
                extractedText.textContent = errorMsg;
                extractedText.classList.remove('has-text');
            }
            showStatus(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Text extraction error:', error);
        const errorMsg = `Error: ${error.message}`;
        if (extractedText) {
            extractedText.textContent = errorMsg;
            extractedText.classList.remove('has-text');
        }
        showStatus(`Text extraction error: ${error.message}`, 'error');
    }
}

async function extractText() {
    if (!currentPdf) {
        showStatus('Please upload a PDF first', 'error');
        return;
    }

    const coords = ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2'].map(id => {
        const element = document.getElementById(id);
        return element ? parseFloat(element.value) : NaN;
    });

    if (coords.some(isNaN)) {
        showStatus('Please enter valid coordinates', 'error');
        return;
    }

    try {
        const response = await fetch('/extract_text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page_num: currentPage,
                x1: coords[0],
                y1: coords[1],
                x2: coords[2],
                y2: coords[3]
            })
        });

        const result = await response.json();

        if (result.success) {
            if (extractedText) {
                extractedText.textContent = result.text || 'No text found in selected area';
                extractedText.classList.add('has-text');
            }
            showStatus(`Extracted ${result.word_count} words successfully`, 'success');

            const conversionFactor = getCoordinateConversionFactor();
            const imageCoords = [
                coords[0] / conversionFactor.x,
                coords[1] / conversionFactor.y,
                coords[2] / conversionFactor.x,
                coords[3] / conversionFactor.y
            ];

            showHighlight(imageCoords[0], imageCoords[1], imageCoords[2], imageCoords[3]);
            updateDebugInfo(`Extracted from PDF: (${coords.join(', ')})<br>Highlighted at image: (${imageCoords.map(c => c.toFixed(1)).join(', ')})`);
            updateStepIndicator('extract');
        } else {
            showStatus(`Extraction failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus(`Extraction error: ${error.message}`, 'error');
    }
}

// ================================
// VISUAL HELPERS
// ================================

function showHighlight(x1, y1, x2, y2, color = '#ef4444') {
    if (!canvasContainer) return;

    const highlight = document.createElement('div');
    highlight.className = 'highlight-box';
    highlight.style.cssText = `
        position: absolute;
        left: ${x1}px;
        top: ${y1}px;
        width: ${x2 - x1}px;
        height: ${y2 - y1}px;
        border: 2px solid ${color};
        background: ${color}33;
        pointer-events: none;
        z-index: 10;
        border-radius: 2px;
        animation: highlightPulse 2s ease-in-out infinite;
    `;

    canvasContainer.appendChild(highlight);
}

function showSelectionBox(start, end) {
    clearSelectionBox();
    if (!canvasContainer) return;

    const box = document.createElement('div');
    box.className = 'selection-box';
    box.id = 'selection-box';

    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    box.style.cssText = `
        position: absolute;
        left: ${left}px;
        top: ${top}px;
        width: ${width}px;
        height: ${height}px;
        border: 2px dashed #2563eb;
        background: rgba(37, 99, 235, 0.05);
        pointer-events: none;
        z-index: 10;
        border-radius: 2px;
        animation: selectionBlink 1.5s ease-in-out infinite;
    `;

    canvasContainer.appendChild(box);
}

function clearSelectionBox() {
    const box = document.getElementById('selection-box');
    if (box) box.remove();
}

function clearHighlights() {
    const highlights = document.querySelectorAll('.highlight-box');
    highlights.forEach(h => h.remove());
}

function showArea() {
    const coords = ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2'].map(id => {
        const element = document.getElementById(id);
        return element ? parseFloat(element.value) : NaN;
    });

    if (!coords.some(isNaN)) {
        const conversionFactor = getCoordinateConversionFactor();
        const imageCoords = [
            coords[0] / conversionFactor.x,
            coords[1] / conversionFactor.y,
            coords[2] / conversionFactor.x,
            coords[3] / conversionFactor.y
        ];

        showHighlight(imageCoords[0], imageCoords[1], imageCoords[2], imageCoords[3], '#f59e0b');
        updateDebugInfo(`Showing area: PDF(${coords.join(', ')}) -> Image(${imageCoords.map(c => c.toFixed(1)).join(', ')})`);
    }
}

// ================================
// SEARCH FUNCTIONS
// ================================

async function searchText() {
    const searchTextInput = document.getElementById('search-text');
    const searchTerm = searchTextInput ? searchTextInput.value.trim() : '';

    if (!searchTerm || !currentPdf) return;

    try {
        const response = await fetch('/search_text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page_num: currentPage,
                search_term: searchTerm
            })
        });

        const result = await response.json();

        if (result.success) {
            clearHighlights();
            const conversionFactor = getCoordinateConversionFactor();

            result.results.forEach(item => {
                const imageCoords = [
                    item.x1 / conversionFactor.x,
                    item.y1 / conversionFactor.y,
                    item.x2 / conversionFactor.x,
                    item.y2 / conversionFactor.y
                ];
                showHighlight(imageCoords[0], imageCoords[1], imageCoords[2], imageCoords[3], '#10b981');
            });
            showStatus(`Found ${result.count} matches for "${searchTerm}"`, 'success');
        } else {
            showStatus(`Search failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus(`Search error: ${error.message}`, 'error');
    }
}

// ================================
// LAYOUT ANALYSIS
// ================================

async function analyzeLayout() {
    if (!currentPdf) return;

    try {
        const response = await fetch('/analyze_layout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_num: currentPage })
        });

        const result = await response.json();

        if (result.success) {
            let layoutText = `📊 OkayDocay Layout Analysis (Page ${result.page_number})\n\n`;
            layoutText += `📝 Words: ${result.total_words}\n`;
            layoutText += `📄 Lines: ${result.total_lines}\n`;
            layoutText += `📋 Tables: ${result.total_tables}\n`;
            layoutText += `📐 Dimensions: ${result.page_width}×${result.page_height} points\n`;
            layoutText += `🔍 Current zoom: ${Math.round(currentScale * 100)}%\n\n`;

            if (result.top_fonts && result.top_fonts.length > 0) {
                layoutText += `🔤 Top Fonts:\n`;
                result.top_fonts.forEach((font, i) => {
                    layoutText += `${i + 1}. ${font.font} (${font.size}pt) - ${font.count} words\n`;
                });
                layoutText += `\n`;
            }

            if (result.lines && result.lines.length > 0) {
                layoutText += `📄 First lines:\n`;
                result.lines.slice(0, 10).forEach((line, i) => {
                    layoutText += `${i + 1}. ${line.text.substring(0, 50)}...\n`;
                });
            }

            if (extractedText) {
                extractedText.textContent = layoutText;
                extractedText.classList.add('has-text');
            }
            showStatus('Layout analysis completed', 'success');
        } else {
            showStatus(`Analysis failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus(`Analysis error: ${error.message}`, 'error');
    }
}

// ================================
// EXPORT FUNCTIONS
// ================================

async function exportResults() {
    if (!currentPdf) return;

    const coords = ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2'].map(id => {
        const element = document.getElementById(id);
        return element ? parseFloat(element.value) || 0 : 0;
    });

    const coordinates = [{
        page: currentPage,
        pdf_x1: coords[0],
        pdf_y1: coords[1],
        pdf_x2: coords[2],
        pdf_y2: coords[3],
        text: extractedText ? extractedText.textContent : '',
        zoom_level: currentScale,
        image_dimensions: currentImageDimensions,
        pdf_dimensions: pdfDimensions,
        app: 'OkayDocay Enhanced'
    }];

    try {
        const response = await fetch('/export_coordinates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `okaydocay_coordinates_${currentPdf}_export.txt`;
            a.click();
            window.URL.revokeObjectURL(url);
            showStatus('Export completed successfully', 'success');
        } else {
            showStatus('Export failed', 'error');
        }
    } catch (error) {
        showStatus(`Export error: ${error.message}`, 'error');
    }
}

// ================================
// CONFIG MAKER FUNCTIONS
// ================================

function populatePageDropdown() {
    const dropdown = document.getElementById('target-page');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">Select page...</option>';

    for (let i = 1; i <= totalPages; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Page ${i}`;
        dropdown.appendChild(option);
    }
}

function handlePageSelection() {
    const targetPageSelect = document.getElementById('target-page');
    if (!targetPageSelect) return;

    const selectedPage = parseInt(targetPageSelect.value);

    if (selectedPage && selectedPage !== currentPage) {
        showStatus(`Navigating to page ${selectedPage}...`, 'info');
        currentPage = selectedPage;
        loadPage(currentPage);
    }

    validateField();
}

function validateField() {
    const fieldNameInput = document.getElementById('field-name');
    const targetPageSelect = document.getElementById('target-page');
    const fieldTypeSelect = document.getElementById('field-type');
    const validation = document.getElementById('field-validation');
    const addBtn = document.getElementById('add-field-btn');
    const previewBtn = document.getElementById('preview-field-btn');
    const addOptionBtn = document.getElementById('add-checkbox-option-btn');
    const previewCheckboxBtn = document.getElementById('preview-checkbox-btn');

    if (!fieldNameInput || !targetPageSelect || !fieldTypeSelect) return;

    const fieldName = fieldNameInput.value.trim();
    const targetPage = targetPageSelect.value;
    const fieldType = fieldTypeSelect.value;

    let isValid = false;

    if (!fieldName) {
        if (validation) {
            validation.textContent = 'Please enter a field name';
            validation.classList.remove('hidden');
        }
    } else if (!targetPage) {
        if (validation) {
            validation.textContent = 'Please select a target page';
            validation.classList.remove('hidden');
        }
    } else if (fieldType === FIELD_TYPES.CHECKBOX) {
        if (validation) validation.classList.add('hidden');
        isValid = true;
    } else {
        const currentCoordsInput = document.getElementById('current-coords');
        const currentCoords = currentCoordsInput ? currentCoordsInput.value : '';
        if (!currentCoords || !hasValidSelection) {
            if (validation) {
                validation.textContent = 'Please select an area on the PDF first';
                validation.classList.remove('hidden');
            }
        } else {
            if (validation) validation.classList.add('hidden');
            isValid = true;
        }
    }

    // Update button states
    if (fieldType === FIELD_TYPES.CHECKBOX) {
        if (addBtn) addBtn.disabled = true;
        if (previewBtn) previewBtn.disabled = !hasValidSelection;
        if (addOptionBtn) {
            const optionNameInput = document.getElementById('checkbox-option-name');
            const optionName = optionNameInput ? optionNameInput.value.trim() : '';
            addOptionBtn.disabled = !hasValidSelection || !optionName;
        }
        if (previewCheckboxBtn) {
            previewCheckboxBtn.disabled = !hasValidSelection;
        }
    } else {
        if (addBtn) addBtn.disabled = !isValid;
        if (previewBtn) previewBtn.disabled = !isValid;
        if (addOptionBtn) addOptionBtn.disabled = true;
        if (previewCheckboxBtn) previewCheckboxBtn.disabled = true;
    }
}

function previewField() {
    const targetPageSelect = document.getElementById('target-page');
    const currentCoordsInput = document.getElementById('current-coords');

    if (!targetPageSelect || !currentCoordsInput) return;

    const targetPage = parseInt(targetPageSelect.value);
    const coords = currentCoordsInput.value.split(',');

    if (coords.length !== 4) {
        showStatus('Invalid coordinates for preview', 'error');
        return;
    }

    const [x1, y1, x2, y2] = coords.map(c => parseFloat(c));

    if (targetPage !== currentPage) {
        showStatus(`Switching to page ${targetPage} to preview field...`, 'info');
        currentPage = targetPage;
        loadPage(currentPage).then(() => {
            showFieldPreview(x1, y1, x2, y2);
        });
    } else {
        showFieldPreview(x1, y1, x2, y2);
    }
}

function showFieldPreview(x1, y1, x2, y2, color = '#10b981') {
    clearHighlights();

    const conversionFactor = getCoordinateConversionFactor();
    const imageCoords = [
        x1 / conversionFactor.x,
        y1 / conversionFactor.y,
        x2 / conversionFactor.x,
        y2 / conversionFactor.y
    ];

    showHighlight(imageCoords[0], imageCoords[1], imageCoords[2], imageCoords[3], color);
    showStatus('Field preview highlighted', 'success');

    extractTextFromSelection(x1, y1, x2, y2);
}

function addField() {
    const fieldTypeSelect = document.getElementById('field-type');
    if (!fieldTypeSelect) return;

    const fieldType = fieldTypeSelect.value;

    if (fieldType === FIELD_TYPES.CHECKBOX) {
        showStatus('For checkbox fields, use "Add Option" to add individual options, then "Finish Checkbox Field"', 'info');
        return;
    }

    const fieldNameInput = document.getElementById('field-name');
    const targetPageSelect = document.getElementById('target-page');
    const currentCoordsInput = document.getElementById('current-coords');

    if (!fieldNameInput || !targetPageSelect || !currentCoordsInput) return;

    const fieldName = fieldNameInput.value.trim();
    const targetPage = parseInt(targetPageSelect.value);
    const coordinates = currentCoordsInput.value;

    if (!fieldName || !coordinates || !targetPage) {
        showStatus('Please fill all required fields', 'error');
        return;
    }

    const existingField = fieldDefinitions.find(f => f.name === fieldName);
    if (existingField) {
        showStatus(`Field "${fieldName}" already exists`, 'warning');
        return;
    }

    const field = {
        name: fieldName,
        type: fieldType,
        coordinates: coordinates,
        page: targetPage,
        created_at: new Date().toISOString()
    };

    addFieldToDefinitions(field);
}

function addFieldToDefinitions(field) {
    fieldDefinitions.push(field);
    updateFieldsList();

    // Add field to server-side extracted data
    addFieldToServer({
        field_name: field.name,
        field_type: field.type,
        coordinates: field.coordinates || '',
        page_num: field.page,
        options: field.options || []
    });

    // Clear inputs but preserve page state
    const fieldNameInput = document.getElementById('field-name');
    const currentCoordsInput = document.getElementById('current-coords');

    if (fieldNameInput) fieldNameInput.value = '';
    if (currentCoordsInput) currentCoordsInput.value = '';

    hasValidSelection = false;
    enableExtractionControls(false);
    clearSelectionOnly();

    const fieldTypeText = field.type === FIELD_TYPES.CHECKBOX ?
        `checkbox with ${field.options.length} options` : field.type;
    showStatus(`${fieldTypeText} field "${field.name}" added successfully`, 'success');

    const clearFieldsBtn = document.getElementById('clear-fields-btn');
    const generateConfigBtn = document.getElementById('generate-config-btn');

    if (clearFieldsBtn) clearFieldsBtn.disabled = false;
    if (generateConfigBtn) generateConfigBtn.disabled = false;
}

function updateFieldsList() {
    const fieldsList = document.getElementById('fields-list');
    if (!fieldsList) return;

    if (fieldDefinitions.length === 0) {
        fieldsList.innerHTML = '<div style="text-align: center; opacity: 0.7; font-style: italic;">No fields defined yet. Add fields using the controls above.</div>';
        return;
    }

    const fieldsByPage = {};
    fieldDefinitions.forEach(field => {
        const pages = field.type === FIELD_TYPES.CHECKBOX ?
            [...new Set(field.options.map(opt => opt.page))] : [field.page];

        pages.forEach(page => {
            if (!fieldsByPage[page]) {
                fieldsByPage[page] = [];
            }
            fieldsByPage[page].push(field);
        });
    });

    let html = '';
    for (const [page, fields] of Object.entries(fieldsByPage)) {
        html += `<div style="margin-bottom: 15px;">`;
        html += `<strong>📄 Page ${page} (${fields.length} fields):</strong><br>`;

        fields.forEach((field) => {
            const typeIcon = getFieldTypeIcon(field.type);
            html += `<div class="fields-list-item" style="margin: 5px 0; padding: 12px; background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: var(--radius); font-size: 0.875rem; transition: var(--transition-slow); position: relative; overflow: hidden;">`;
            html += `${typeIcon} <strong>${field.name}</strong> (${field.type})<br>`;

            if (field.type === FIELD_TYPES.CHECKBOX) {
                html += `📋 ${field.options.length} options:<br>`;
                field.options.forEach(option => {
                    html += `&nbsp;&nbsp;☑️ ${option.name} (Page ${option.page})<br>`;
                });
            } else {
                html += `📍 Coordinates: ${field.coordinates}`;
            }

            html += `<button onclick="editField('${field.name}')" class="edit-field-btn" style="float: right; margin-left: 5px; padding: 4px 8px; font-size: 11px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Edit</button>`;
            html += `<button onclick="removeField('${field.name}')" class="remove-field-btn" style="float: right; padding: 4px 8px; font-size: 11px; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer;">Remove</button>`;
            html += `</div>`;
        });

        html += `</div>`;
    }

    fieldsList.innerHTML = html;
}

function getFieldTypeIcon(type) {
    switch(type) {
        case FIELD_TYPES.TEXT:
            return '📝';
        case FIELD_TYPES.SIGNATURE:
            return '✍️';
        case FIELD_TYPES.CHECKBOX:
            return '☑️';
        default:
            return '🎯';
    }
}

function editField(fieldName) {
    const field = fieldDefinitions.find(f => f.name === fieldName);
    if (!field) return;

    const fieldNameInput = document.getElementById('field-name');
    const fieldTypeSelect = document.getElementById('field-type');
    const targetPageSelect = document.getElementById('target-page');
    const currentCoordsInput = document.getElementById('current-coords');

    if (fieldNameInput) fieldNameInput.value = field.name;
    if (fieldTypeSelect) fieldTypeSelect.value = field.type;

    if (field.type === FIELD_TYPES.CHECKBOX) {
        currentCheckboxOptions = [...field.options];
        handleFieldTypeChange();
        updateCheckboxOptionsList();
    } else {
        if (targetPageSelect) targetPageSelect.value = field.page;
        if (currentCoordsInput) currentCoordsInput.value = field.coordinates;

        if (field.page !== currentPage) {
            currentPage = field.page;
            loadPage(currentPage);
        }
    }

    removeField(fieldName);
    showStatus(`Field "${fieldName}" loaded for editing`, 'info');
}

async function removeField(fieldName) {
    try {
        fieldDefinitions = fieldDefinitions.filter(f => f.name !== fieldName);
        updateFieldsList();
        showStatus(`Field "${fieldName}" removed`, 'info');

        if (fieldDefinitions.length === 0) {
            const clearFieldsBtn = document.getElementById('clear-fields-btn');
            const generateConfigBtn = document.getElementById('generate-config-btn');

            if (clearFieldsBtn) clearFieldsBtn.disabled = true;
            if (generateConfigBtn) generateConfigBtn.disabled = true;
        }
    } catch (error) {
        showStatus(`Error removing field: ${error.message}`, 'error');
    }
}

async function clearAllFields() {
    if (fieldDefinitions.length === 0) return;

    if (confirm('Are you sure you want to clear all field definitions?')) {
        try {
            fieldDefinitions = [];
            currentCheckboxOptions = [];
            updateFieldsList();
            updateCheckboxOptionsList();

            const clearFieldsBtn = document.getElementById('clear-fields-btn');
            const generateConfigBtn = document.getElementById('generate-config-btn');

            if (clearFieldsBtn) clearFieldsBtn.disabled = true;
            if (generateConfigBtn) generateConfigBtn.disabled = true;

            showStatus('All fields cleared', 'info');
        } catch (error) {
            showStatus(`Error clearing fields: ${error.message}`, 'error');
        }
    }
}

// ================================
// ENHANCED CONFIG GENERATION WITH GITHUB INTEGRATION
// ================================

function showConfigGenerationModal() {
    const modal = document.getElementById('config-generation-modal');
    const step1 = document.getElementById('generation-step-1');
    const step2 = document.getElementById('generation-step-2');
    const processing = document.getElementById('generation-processing');
    const success = document.getElementById('generation-success');

    if (modal) modal.classList.remove('hidden');
    if (step1) step1.classList.remove('hidden');
    if (step2) step2.classList.add('hidden');
    if (processing) processing.classList.add('hidden');
    if (success) success.classList.add('hidden');

    // Reset form
    const configOnlyRadio = document.querySelector('input[name="generation_type"][value="config_only"]');
    if (configOnlyRadio) configOnlyRadio.checked = true;

    const githubCheckbox = document.getElementById('upload-to-github');
    if (githubCheckbox) githubCheckbox.checked = false;

    const jsonInput = document.getElementById('simple-json-input');
    if (jsonInput) jsonInput.value = '';

    const validationResult = document.getElementById('json-validation-result');
    if (validationResult) validationResult.classList.add('hidden');

    handleGitHubOptionChange();
}

function closeConfigGenerationModal() {
    const modal = document.getElementById('config-generation-modal');
    if (modal) modal.classList.add('hidden');
    pendingDownloadData = null;
}

function continueGeneration() {
    const selectedType = document.querySelector('input[name="generation_type"]:checked');
    if (!selectedType) return;

    if (selectedType.value === 'populated_config') {
        // Show step 2 for JSON input
        const step1 = document.getElementById('generation-step-1');
        const step2 = document.getElementById('generation-step-2');

        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.remove('hidden');

        loadFormatExample();
        loadExampleSimpleJson();
        updateGitHubReminder();
    } else {
        // Directly generate for other types
        executeGeneration();
    }
}

function backToStep1() {
    const step1 = document.getElementById('generation-step-1');
    const step2 = document.getElementById('generation-step-2');

    if (step2) step2.classList.add('hidden');
    if (step1) step1.classList.remove('hidden');
}

function loadFormatExample() {
    const example = generateSimpleJsonExample();
    const formatDiv = document.getElementById('format-example');

    if (!formatDiv) return;

    let exampleText = '{\n';
    Object.keys(example).forEach((key, index, array) => {
        const value = typeof example[key] === 'string' ? `"${example[key]}"` : example[key];
        exampleText += `  "${key}": ${value}`;
        if (index < array.length - 1) exampleText += ',';
        exampleText += '\n';
    });
    exampleText += '}';

    formatDiv.textContent = exampleText;
}

function generateSimpleJsonExample() {
    const example = {};

    fieldDefinitions.forEach(field => {
        if (field.type === FIELD_TYPES.CHECKBOX) {
            // Add checkbox options
            field.options.forEach((option, index) => {
                example[`${field.name}/${option.name}`] = index === 0; // First option true
            });
        } else if (field.type === FIELD_TYPES.SIGNATURE) {
            example[field.name] = "base64_signature_data_here";
        } else {
            // Text field
            example[field.name] = `Sample ${field.name.replace(/_/g, ' ')}`;
        }
    });

    return example;
}

function loadExampleSimpleJson() {
    const example = generateSimpleJsonExample();
    const jsonInput = document.getElementById('simple-json-input');
    if (jsonInput) {
        jsonInput.value = JSON.stringify(example, null, 2);
    }
}

function validateJsonInput() {
    const jsonInput = document.getElementById('simple-json-input');
    const resultDiv = document.getElementById('json-validation-result');

    if (!jsonInput || !resultDiv) return false;

    const jsonText = jsonInput.value.trim();

    if (!jsonText) {
        resultDiv.innerHTML = '<div class="status warning">No JSON data entered</div>';
        resultDiv.classList.remove('hidden');
        return false;
    }

    try {
        const parsed = JSON.parse(jsonText);
        resultDiv.innerHTML = '<div class="status success">✅ Valid JSON format</div>';
        resultDiv.classList.remove('hidden');
        return true;
    } catch (error) {
        resultDiv.innerHTML = `<div class="status error">❌ Invalid JSON: ${error.message}</div>`;
        resultDiv.classList.remove('hidden');
        return false;
    }
}

function clearJsonInput() {
    const jsonInput = document.getElementById('simple-json-input');
    const validationResult = document.getElementById('json-validation-result');

    if (jsonInput) jsonInput.value = '';
    if (validationResult) validationResult.classList.add('hidden');
}

async function executeGeneration() {
    const selectedTypeRadio = document.querySelector('input[name="generation_type"]:checked');
    const githubCheckbox = document.getElementById('upload-to-github');

    if (!selectedTypeRadio) return;

    const selectedType = selectedTypeRadio.value;
    const uploadToGithub = githubCheckbox && githubCheckbox.checked && githubConfigured;
    let simpleJsonData = {};

    // Show processing state
    const step1 = document.getElementById('generation-step-1');
    const step2 = document.getElementById('generation-step-2');
    const processing = document.getElementById('generation-processing');

    if (step1) step1.classList.add('hidden');
    if (step2) step2.classList.add('hidden');
    if (processing) processing.classList.remove('hidden');

    // Get simple JSON data if needed
    if (selectedType === 'populated_config') {
        const jsonInput = document.getElementById('simple-json-input');
        const jsonText = jsonInput ? jsonInput.value.trim() : '';

        if (!jsonText) {
            showStatus('Please enter simple JSON data', 'error');
            backToStep1();
            return;
        }

        try {
            simpleJsonData = JSON.parse(jsonText);
        } catch (error) {
            showStatus(`Invalid JSON format: ${error.message}`, 'error');
            backToStep1();
            return;
        }
    }

    // Update processing status
    const processingStatus = document.getElementById('processing-status');
    if (processingStatus) {
        processingStatus.textContent = uploadToGithub ?
            'Generating and uploading to GitHub...' :
            'Generating configuration...';
    }

    try {
        // Prepare request data
        const requestData = {
            simple_json: selectedType === 'populated_config' ? simpleJsonData : {},
            generate_script: selectedType === 'config_with_script' || selectedType === 'populated_config',
            upload_to_github: uploadToGithub
        };

        const response = await fetch('/generate_config_json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (response.ok) {
            // Check if response is JSON (GitHub upload) or blob (file download)
            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                // GitHub upload response
                const result = await response.json();

                if (result.uploaded_to_github) {
                    showGitHubUploadSuccess(result);
                } else {
                    throw new Error(result.error || 'Unknown error');
                }
            } else {
                // File download response
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;

                // Get filename from response headers
                const disposition = response.headers.get('Content-Disposition');
                const filename = disposition ?
                    disposition.split('filename=')[1]?.replace(/"/g, '') :
                    `config_${Date.now()}.json`;

                a.download = filename;
                a.click();
                window.URL.revokeObjectURL(url);

                // Store download data for potential GitHub upload later
                pendingDownloadData = {
                    blob: blob,
                    filename: filename,
                    selectedType: selectedType,
                    simpleJsonData: simpleJsonData
                };

                showDownloadSuccess(selectedType);
            }

        } else {
            const errorResult = await response.json();
            throw new Error(errorResult.error || 'Generation failed');
        }

    } catch (error) {
        if (processing) processing.classList.add('hidden');
        showStatus(`Generation failed: ${error.message}`, 'error');
        backToStep1();
    }
}

function showGitHubUploadSuccess(result) {
    const processing = document.getElementById('generation-processing');
    const success = document.getElementById('generation-success');
    const successDetails = document.getElementById('success-details');
    const githubSuccessInfo = document.getElementById('github-success-info');
    const githubUploadDetails = document.getElementById('github-upload-details');
    const githubViewLink = document.getElementById('github-view-link');
    const githubDownloadLink = document.getElementById('github-download-link');

    if (processing) processing.classList.add('hidden');
    if (success) success.classList.remove('hidden');

    if (successDetails) {
        successDetails.textContent = 'Your configuration has been uploaded to GitHub!';
    }

    if (githubSuccessInfo) {
        githubSuccessInfo.style.display = 'block';
    }

    if (githubUploadDetails) {
        githubUploadDetails.textContent = `Files uploaded to ${githubRepoInfo.owner}/${githubRepoInfo.name}`;
    }

    if (githubViewLink && result.github_url) {
        githubViewLink.href = result.github_url;
    }

    if (githubDownloadLink && result.download_url) {
        githubDownloadLink.href = result.download_url;
    }

    // Auto close modal after 5 seconds
    setTimeout(() => {
        closeConfigGenerationModal();
        showStatus('Configuration uploaded to GitHub successfully!', 'success');
    }, 5000);
}

function showDownloadSuccess(selectedType) {
    const processing = document.getElementById('generation-processing');
    const success = document.getElementById('generation-success');
    const successDetails = document.getElementById('success-details');
    const downloadActions = document.getElementById('download-actions');
    const uploadToGithubLaterBtn = document.getElementById('upload-to-github-later-btn');

    if (processing) processing.classList.add('hidden');
    if (success) success.classList.remove('hidden');

    let successMessage = '';
    if (selectedType === 'config_only') {
        successMessage = 'Configuration JSON has been downloaded.';
    } else if (selectedType === 'config_with_script') {
        successMessage = 'ZIP package with configuration JSON and transformer script has been downloaded.';
    } else {
        successMessage = 'ZIP package with populated configuration and transformer script has been downloaded.';
    }

    if (successDetails) {
        successDetails.textContent = successMessage;
    }

    // Show download actions if GitHub is configured
    if (githubConfigured && downloadActions) {
        downloadActions.classList.remove('hidden');

        // Hide GitHub upload button if not configured
        if (uploadToGithubLaterBtn) {
            uploadToGithubLaterBtn.style.display = githubConfigured ? 'inline-flex' : 'none';
        }
    }

    // Auto close modal after 3 seconds if no GitHub option
    if (!githubConfigured) {
        setTimeout(() => {
            closeConfigGenerationModal();
            showStatus('Configuration generated successfully!', 'success');
        }, 3000);
    }
}

async function uploadToGithubLater() {
    if (!pendingDownloadData || !githubConfigured) {
        showStatus('No files available for upload or GitHub not configured', 'error');
        return;
    }

    try {
        // Show loading
        const uploadBtn = document.getElementById('upload-to-github-later-btn');
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = '🔄 Uploading...';
        }

        // Re-send the generation request with GitHub upload enabled
        const requestData = {
            simple_json: pendingDownloadData.simpleJsonData || {},
            generate_script: pendingDownloadData.selectedType === 'config_with_script' || pendingDownloadData.selectedType === 'populated_config',
            upload_to_github: true
        };

        const response = await fetch('/generate_config_json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (response.ok) {
            const result = await response.json();

            if (result.uploaded_to_github) {
                showGitHubUploadSuccess(result);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } else {
            const errorResult = await response.json();
            throw new Error(errorResult.error || 'Upload failed');
        }

    } catch (error) {
        showStatus(`GitHub upload failed: ${error.message}`, 'error');

        // Reset button
        const uploadBtn = document.getElementById('upload-to-github-later-btn');
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '🐙 Upload to GitHub';
        }
    }
}

function downloadPendingFiles() {
    if (pendingDownloadData) {
        const url = window.URL.createObjectURL(pendingDownloadData.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pendingDownloadData.filename;
        a.click();
        window.URL.revokeObjectURL(url);

        showStatus('Files downloaded successfully!', 'success');
    }
}

async function generateConfig() {
    if (fieldDefinitions.length === 0) {
        showStatus('No field data to export', 'warning');
        return;
    }

    showConfigGenerationModal();
}


// GLOBAL FUNCTION EXPORTS


// Make functions globally accessible for HTML onclick handlers
window.removeField = removeField;
window.editField = editField;
window.removeCheckboxOption = removeCheckboxOption;
window.previewCheckboxOption = previewCheckboxOption;
window.generateConfig = generateConfig;
window.showConfigGenerationModal = showConfigGenerationModal;
window.closeConfigGenerationModal = closeConfigGenerationModal;
window.continueGeneration = continueGeneration;
window.backToStep1 = backToStep1;
window.executeGeneration = executeGeneration;
window.loadExampleSimpleJson = loadExampleSimpleJson;
window.validateJsonInput = validateJsonInput;
window.clearJsonInput = clearJsonInput;
window.handleGitHubOptionChange = handleGitHubOptionChange;
window.uploadToGithubLater = uploadToGithubLater;
window.downloadPendingFiles = downloadPendingFiles;


// CONSOLE LOGGING AND DEBUG


console.log('📄 OkayDocay Enhanced - JavaScript Loaded');
console.log('🎯 Features: PDF Upload, Field Configuration, Script Generation');
console.log('⚡ Field Types: Text, Signature, Checkbox');
console.log('🔧 Script Maker: Integrated transformation script generation');
console.log('🐙 GitHub Integration: Direct repository uploads');
console.log('🚀 Ready for PDF processing!');


// ERROR HANDLING AND RECOVERY


window.addEventListener('error', function(event) {
    console.error('Global JavaScript Error:', event.error);
    showStatus(`Application error: ${event.error?.message || 'Unknown error'}`, 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled Promise Rejection:', event.reason);
    showStatus(`Network error: ${event.reason?.message || 'Request failed'}`, 'error');
});


// PERFORMANCE MONITORING


if (window.performance && window.performance.mark) {
    window.performance.mark('okaydocay-script-loaded');

    window.addEventListener('load', function() {
        window.performance.mark('okaydocay-app-ready');

        const loadTime = window.performance.now();
        console.log(`🚀 OkayDocay Enhanced loaded in ${loadTime.toFixed(2)}ms`);
    });
}


// KEYBOARD SHORTCUTS


document.addEventListener('keydown', function(event) {
    // Escape key to close modal
    if (event.key === 'Escape') {
        const modal = document.getElementById('config-generation-modal');
        if (modal && !modal.classList.contains('hidden')) {
            closeConfigGenerationModal();
        }
    }

    // Ctrl/Cmd + Enter to generate config (when fields exist)
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (fieldDefinitions.length > 0) {
            event.preventDefault();
            generateConfig();
        }
    }

    // Arrow keys for page navigation (when PDF is loaded)
    if (currentPdf && !isSelecting) {
        if (event.key === 'ArrowLeft' && currentPage > 1) {
            event.preventDefault();
            changePage(-1);
        } else if (event.key === 'ArrowRight' && currentPage < totalPages) {
            event.preventDefault();
            changePage(1);
        }
    }
});


// FINAL INITIALIZATION CHECK


document.addEventListener('DOMContentLoaded', function() {
    // Verify all critical elements are present
    const criticalElements = [
        'upload-area', 'pdf-canvas', 'status-area', 'extracted-text',
        'field-type', 'field-name', 'target-page', 'current-coords',
        'generate-config-btn', 'config-generation-modal'
    ];

    const missingElements = criticalElements.filter(id => !document.getElementById(id));

    if (missingElements.length > 0) {
        console.warn('⚠️ Missing critical elements:', missingElements);
    } else {
        console.log('✅ All critical elements found - OkayDocay Enhanced ready!');
    }

    // Initialize UI state
    const generateConfigBtn = document.getElementById('generate-config-btn');
    const clearFieldsBtn = document.getElementById('clear-fields-btn');

    if (generateConfigBtn) generateConfigBtn.disabled = true;
    if (clearFieldsBtn) clearFieldsBtn.disabled = true;

    showStatus('Ready! Upload a PDF to begin field configuration.', 'info');
});

