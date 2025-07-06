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

// GitHub Integration Variables
let githubConfigured = false;
let githubRepoInfo = null;
let pendingDownloadData = null;

// Simplified field types - no complex checkbox options
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
    console.log('🚀 OkayDocay Enhanced with Simplified Checkboxes - Initializing...');

    // Initialize DOM references
    initializeDOMReferences();

    // Setup all event listeners
    setupEventListeners();

    // Initialize UI state
    updateStepIndicator('upload');
    setupRightClickNavigation();
    setupSimplifiedFieldTypeControls();
    setupModalEventListeners();

    // Check GitHub configuration
    checkGitHubConfiguration();

    console.log('✅ OkayDocay Enhanced with Simplified Checkboxes - Ready!');
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
            githubDescription.textContent = 'Upload configuration and scripts directly to your GitHub repository for easy access and version control';
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
}

// ================================
// SIMPLIFIED FIELD TYPE SETUP
// ================================

function setupSimplifiedFieldTypeControls() {
    const fieldTypeSelect = document.getElementById('field-type');

    if (fieldTypeSelect) {
        fieldTypeSelect.addEventListener('change', handleSimplifiedFieldTypeChange);
    }

    // Hide checkbox options container since we're not using complex checkboxes
    const checkboxContainer = document.getElementById('checkbox-options-container');
    if (checkboxContainer) {
        checkboxContainer.style.display = 'none';
    }
}

function handleSimplifiedFieldTypeChange() {
    const fieldTypeSelect = document.getElementById('field-type');
    if (!fieldTypeSelect) return;

    const fieldType = fieldTypeSelect.value;
    currentFieldType = fieldType;

    // All field types use the same simple interface now
    const normalControls = document.getElementById('normal-field-controls');
    if (normalControls) normalControls.classList.remove('hidden');

    validateField();
}

// ================================
// SERVER-SIDE DATA FUNCTIONS
// ================================

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
        { id: 'add-field-btn', handler: addSimplifiedField, event: 'click' },
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

function setupModalEventListeners() {
    // Modal controls
    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeConfigGenerationModal);

    const cancelBtn = document.getElementById('cancel-generation-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeConfigGenerationModal);

    const generateFinalBtn = document.getElementById('generate-final-btn');
    if (generateFinalBtn) generateFinalBtn.addEventListener('click', executeGeneration);

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

// ================================
// UTILITY FUNCTIONS
// ================================

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

// ================================
// SELECTION FUNCTIONS
// ================================

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
        'current-coords': `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`
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

    const fieldIds = ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2', 'coord-input', 'current-coords'];
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
        app: 'OkayDocay Enhanced - Simplified Checkboxes'
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
            a.download = `okaydocay_simplified_coordinates_${currentPdf}_export.txt`;
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
// SIMPLIFIED CONFIG MAKER FUNCTIONS
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
    const validation = document.getElementById('field-validation');
    const addBtn = document.getElementById('add-field-btn');
    const previewBtn = document.getElementById('preview-field-btn');

    if (!fieldNameInput || !targetPageSelect) return;

    const fieldName = fieldNameInput.value.trim();
    const targetPage = targetPageSelect.value;

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
    if (addBtn) addBtn.disabled = !isValid;
    if (previewBtn) previewBtn.disabled = !isValid;
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

// ================================
// SIMPLIFIED FIELD ADDITION
// ================================

function addSimplifiedField() {
    const fieldNameInput = document.getElementById('field-name');
    const fieldTypeSelect = document.getElementById('field-type');
    const targetPageSelect = document.getElementById('target-page');
    const currentCoordsInput = document.getElementById('current-coords');

    if (!fieldNameInput || !fieldTypeSelect || !targetPageSelect || !currentCoordsInput) return;

    const fieldName = fieldNameInput.value.trim();
    const fieldType = fieldTypeSelect.value;
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

    // Create simplified field object - same structure for all field types
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
    updateFieldsReference();

    // Add field to server-side extracted data
    addFieldToServer({
        field_name: field.name,
        field_type: field.type,
        coordinates: field.coordinates || '',
        page_num: field.page
    });

    // Clear inputs but preserve page state
    const fieldNameInput = document.getElementById('field-name');
    const currentCoordsInput = document.getElementById('current-coords');

    if (fieldNameInput) fieldNameInput.value = '';
    if (currentCoordsInput) currentCoordsInput.value = '';

    hasValidSelection = false;
    enableExtractionControls(false);
    clearSelectionOnly();

    showStatus(`${field.type} field "${field.name}" added successfully`, 'success');

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
        if (!fieldsByPage[field.page]) {
            fieldsByPage[field.page] = [];
        }
        fieldsByPage[field.page].push(field);
    });

    let html = '';
    for (const [page, fields] of Object.entries(fieldsByPage)) {
        html += `<div style="margin-bottom: 15px;">`;
        html += `<strong>📄 Page ${page} (${fields.length} fields):</strong><br>`;

        fields.forEach((field) => {
            const typeIcon = getFieldTypeIcon(field.type);
            html += `<div class="fields-list-item ${field.type}" style="margin: 5px 0; padding: 12px; background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: var(--radius); font-size: 0.875rem; transition: var(--transition-slow); position: relative; overflow: hidden;">`;
            html += `${typeIcon} <strong>${field.name}</strong> (${field.type})<br>`;
            html += `📍 Coordinates: ${field.coordinates}`;

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

// ================================
// SIMPLIFIED FIELD REFERENCE PANEL
// ================================

function updateFieldsReference() {
    const referenceList = document.getElementById('fields-reference-list');
    if (!referenceList) return;

    if (fieldDefinitions.length === 0) {
        referenceList.innerHTML = `
            <div style="text-align: center; color: var(--gray-500); font-style: italic; padding: 20px;">
                <div style="font-size: 2rem; margin-bottom: 10px;">📋</div>
                <div>No fields configured yet.</div>
                <div style="font-size: 0.8rem; margin-top: 5px;">Add fields first to see the reference.</div>
            </div>
        `;
        return;
    }

    // Group fields by page
    const fieldsByPage = {};
    fieldDefinitions.forEach(field => {
        if (!fieldsByPage[field.page]) fieldsByPage[field.page] = [];
        fieldsByPage[field.page].push(field);
    });

    // Generate simplified reference HTML
    let html = `<div class="field-reference-container">`;

    const sortedPages = Object.keys(fieldsByPage).sort((a, b) => parseInt(a) - parseInt(b));

    sortedPages.forEach((page, pageIndex) => {
        html += `
            <div class="page-section">
                <div class="page-header">
                    <span>📄</span>
                    <span>Page ${page}</span>
                    <span style="opacity: 0.8; font-weight: normal; font-size: 0.75rem;">(${fieldsByPage[page].length} fields)</span>
                </div>
                <div class="fields-grid">
        `;

        fieldsByPage[page].forEach((field, fieldIndex) => {
            const fieldClass = `${field.type}-field`;
            const typeEmoji = getFieldTypeEmoji(field.type);
            const copyId = `copy-${page}-${fieldIndex}`;

            html += `
                <div class="field-block ${fieldClass}" onclick="copyFieldName('${field.name}', '${copyId}')">
                    <button class="copy-button" id="${copyId}" onclick="event.stopPropagation(); copyFieldName('${field.name}', '${copyId}')">
                        📋 Copy
                    </button>

                    <div class="field-header">
                        <div class="field-name">${field.name}</div>
                    </div>

                    <div class="field-type ${field.type}">
                        ${typeEmoji} ${field.type}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    // Add usage examples with actual field names
    html += `
        <div class="usage-examples">
            <div class="usage-title">
                💡 Usage Examples
            </div>
            <div class="usage-code">
                # Access field by name<br>
                field = get_field_by_name(config, '${fieldDefinitions[0]?.name || 'field_name'}')
            </div>
            <div class="usage-code">
                # Loop through page fields<br>
                for field in config['pages']['${sortedPages[0] || '1'}']['fields']:
            </div>
            <div class="usage-code">
                # Access first field directly<br>
                first_field = config['pages']['${sortedPages[0] || '1'}']['fields'][0]['name']
            </div>
        </div>
    `;

    html += `</div>`;

    referenceList.innerHTML = html;
}

// Function to copy field name to clipboard
function copyFieldName(fieldName, buttonId) {
    // Create a temporary textarea to copy the text
    const tempTextarea = document.createElement('textarea');
    tempTextarea.value = fieldName;
    document.body.appendChild(tempTextarea);
    tempTextarea.select();

    try {
        document.execCommand('copy');

        // Update button to show success
        const button = document.getElementById(buttonId);
        if (button) {
            const originalText = button.innerHTML;
            button.innerHTML = '✅ Copied';
            button.classList.add('copied');

            // Reset button after 2 seconds
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('copied');
            }, 2000);
        }

        // Show status message
        showStatus(`Field name "${fieldName}" copied to clipboard!`, 'success');

    } catch (err) {
        console.error('Failed to copy text: ', err);
        showStatus('Failed to copy field name', 'error');
    } finally {
        document.body.removeChild(tempTextarea);
    }
}

// Enhanced setup function for reference panel
function setupReferencePanel() {
    const toggleBtn = document.getElementById('toggle-reference-btn');
    const referenceContent = document.getElementById('fields-reference-content');

    if (toggleBtn && referenceContent) {
        // Set initial state to expanded
        let isExpanded = true;

        toggleBtn.addEventListener('click', function() {
            isExpanded = !isExpanded;

            if (isExpanded) {
                referenceContent.style.display = 'block';
                toggleBtn.textContent = 'Hide ↑';
                toggleBtn.style.background = 'var(--primary-100)';
                toggleBtn.style.color = 'var(--primary-700)';
            } else {
                referenceContent.style.display = 'none';
                toggleBtn.textContent = 'Show ↓';
                toggleBtn.style.background = 'var(--gray-100)';
                toggleBtn.style.color = 'var(--gray-600)';
            }
        });

        // Set initial button style
        toggleBtn.style.background = 'var(--primary-100)';
        toggleBtn.style.color = 'var(--primary-700)';
        toggleBtn.style.borderRadius = '4px';
        toggleBtn.style.padding = '4px 8px';
        toggleBtn.style.fontSize = '0.75rem';
        toggleBtn.style.fontWeight = '500';
        toggleBtn.style.transition = 'all 0.2s ease';
    }
}

// Helper function to get field type emoji
function getFieldTypeEmoji(type) {
    switch(type) {
        case FIELD_TYPES.TEXT: return '📝';
        case FIELD_TYPES.SIGNATURE: return '✍️';
        case FIELD_TYPES.CHECKBOX: return '☑️';
        default: return '🎯';
    }
}

// ================================
// CONFIG GENERATION WITH SIMPLIFIED STRUCTURE
// ================================

function showConfigGenerationModal() {
    const modal = document.getElementById('config-generation-modal');
    const scriptsSection = document.getElementById('scripts-input-section');
    const processing = document.getElementById('generation-processing');
    const success = document.getElementById('generation-success');

    if (modal) modal.classList.remove('hidden');
    if (scriptsSection) scriptsSection.classList.remove('hidden');
    if (processing) processing.classList.add('hidden');
    if (success) success.classList.add('hidden');

    // Reset form
    const githubCheckbox = document.getElementById('upload-to-github');
    if (githubCheckbox) githubCheckbox.checked = false;

    const scriptInputs = ['script1', 'script2', 'script3'];
    scriptInputs.forEach(id => {
        const textarea = document.getElementById(id);
        if (textarea) textarea.value = '';
    });

    // Update simplified fields reference
    updateFieldsReference();
    setupReferencePanel();

    handleGitHubOptionChange();
}

function closeConfigGenerationModal() {
    const modal = document.getElementById('config-generation-modal');
    if (modal) modal.classList.add('hidden');
    pendingDownloadData = null;
}

async function executeGeneration() {
    const githubCheckbox = document.getElementById('upload-to-github');
    const uploadToGithub = githubCheckbox && githubCheckbox.checked && githubConfigured;

    // Get manual scripts
    const script1 = document.getElementById('script1')?.value || '';
    const script2 = document.getElementById('script2')?.value || '';
    const script3 = document.getElementById('script3')?.value || '';

    // Show processing state
    const scriptsSection = document.getElementById('scripts-input-section');
    const processing = document.getElementById('generation-processing');

    if (scriptsSection) scriptsSection.classList.add('hidden');
    if (processing) processing.classList.remove('hidden');

    // Update processing status
    const processingStatus = document.getElementById('processing-status');
    if (processingStatus) {
        processingStatus.textContent = uploadToGithub ?
            'Generating simplified config and uploading to GitHub...' :
            'Generating simplified configuration package...';
    }

    try {
        // Prepare request data
        const requestData = {
            script1: script1,
            script2: script2,
            script3: script3,
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
                    `simplified_config_package_${Date.now()}.zip`;

                a.download = filename;
                a.click();
                window.URL.revokeObjectURL(url);

                // Store download data for potential GitHub upload later
                pendingDownloadData = {
                    blob: blob,
                    filename: filename,
                    script1: script1,
                    script2: script2,
                    script3: script3
                };

                showDownloadSuccess();
            }

        } else {
            const errorResult = await response.json();
            throw new Error(errorResult.error || 'Generation failed');
        }

    } catch (error) {
        if (processing) processing.classList.add('hidden');
        showStatus(`Generation failed: ${error.message}`, 'error');
        if (scriptsSection) scriptsSection.classList.remove('hidden');
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
        successDetails.textContent = 'Your simplified configuration and scripts have been uploaded to GitHub!';
    }

    if (githubSuccessInfo) {
        githubSuccessInfo.style.display = 'block';
    }

    if (githubUploadDetails) {
        githubUploadDetails.textContent = `Simplified configuration and scripts uploaded to ${githubRepoInfo.owner}/${githubRepoInfo.name}`;
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
        showStatus('Simplified configuration package uploaded to GitHub successfully!', 'success');
    }, 5000);
}

function showDownloadSuccess() {
    const processing = document.getElementById('generation-processing');
    const success = document.getElementById('generation-success');
    const successDetails = document.getElementById('success-details');
    const downloadActions = document.getElementById('download-actions');
    const uploadToGithubLaterBtn = document.getElementById('upload-to-github-later-btn');

    if (processing) processing.classList.add('hidden');
    if (success) success.classList.remove('hidden');

    if (successDetails) {
        successDetails.textContent = 'Simplified configuration package with your custom scripts has been downloaded.';
    }

    // Show download actions if GitHub is configured
    if (githubConfigured && downloadActions) {
        downloadActions.classList.remove('hidden');

        if (uploadToGithubLaterBtn) {
            uploadToGithubLaterBtn.style.display = githubConfigured ? 'inline-flex' : 'none';
        }
    }

    // Auto close modal after 3 seconds if no GitHub option
    if (!githubConfigured) {
        setTimeout(() => {
            closeConfigGenerationModal();
            showStatus('Simplified configuration package generated successfully!', 'success');
        }, 3000);
    }
}

async function uploadToGithubLater() {
    if (!pendingDownloadData || !githubConfigured) {
        showStatus('No files available for upload or GitHub not configured', 'error');
        return;
    }

    try {
        const uploadBtn = document.getElementById('upload-to-github-later-btn');
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = '🔄 Uploading...';
        }

        // Re-send the generation request with GitHub upload enabled
        const requestData = {
            script1: pendingDownloadData.script1 || '',
            script2: pendingDownloadData.script2 || '',
            script3: pendingDownloadData.script3 || '',
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

        showStatus('Package downloaded successfully!', 'success');
    }
}

async function generateConfig() {
    if (fieldDefinitions.length === 0) {
        showStatus('No field data to export', 'warning');
        return;
    }

    showConfigGenerationModal();
}

function clearAllFields() {
    if (fieldDefinitions.length === 0) return;

    if (confirm('Are you sure you want to clear all field definitions?')) {
        try {
            fieldDefinitions = [];
            updateFieldsList();
            updateFieldsReference();

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
// GLOBAL FUNCTION EXPORTS
// ================================

// Make copyFieldName globally accessible
window.copyFieldName = copyFieldName;

window.removeField = function(fieldName) {
    fieldDefinitions = fieldDefinitions.filter(f => f.name !== fieldName);
    updateFieldsList();
    updateFieldsReference();
    showStatus(`Field "${fieldName}" removed`, 'info');

    if (fieldDefinitions.length === 0) {
        const clearFieldsBtn = document.getElementById('clear-fields-btn');
        const generateConfigBtn = document.getElementById('generate-config-btn');

        if (clearFieldsBtn) clearFieldsBtn.disabled = true;
        if (generateConfigBtn) generateConfigBtn.disabled = true;
    }
};

window.editField = function(fieldName) {
    const field = fieldDefinitions.find(f => f.name === fieldName);
    if (!field) return;

    const fieldNameInput = document.getElementById('field-name');
    const fieldTypeSelect = document.getElementById('field-type');
    const targetPageSelect = document.getElementById('target-page');
    const currentCoordsInput = document.getElementById('current-coords');

    if (fieldNameInput) fieldNameInput.value = field.name;
    if (fieldTypeSelect) fieldTypeSelect.value = field.type;
    if (targetPageSelect) targetPageSelect.value = field.page;
    if (currentCoordsInput) currentCoordsInput.value = field.coordinates;

    if (field.page !== currentPage) {
        currentPage = field.page;
        loadPage(currentPage);
    }

    window.removeField(fieldName);
    showStatus(`Field "${fieldName}" loaded for editing`, 'info');
};

// Make functions globally accessible for HTML onclick handlers
window.generateConfig = generateConfig;
window.showConfigGenerationModal = showConfigGenerationModal;
window.closeConfigGenerationModal = closeConfigGenerationModal;
window.executeGeneration = executeGeneration;
window.handleGitHubOptionChange = handleGitHubOptionChange;
window.uploadToGithubLater = uploadToGithubLater;
window.downloadPendingFiles = downloadPendingFiles;

// ================================
// ERROR HANDLING AND RECOVERY
// ================================

window.addEventListener('error', function(event) {
    console.error('Global JavaScript Error:', event.error);
    showStatus(`Application error: ${event.error?.message || 'Unknown error'}`, 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled Promise Rejection:', event.reason);
    showStatus(`Network error: ${event.reason?.message || 'Request failed'}`, 'error');
});

// ================================
// KEYBOARD SHORTCUTS
// ================================

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

// ================================
// FINAL INITIALIZATION CHECK
// ================================

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
        console.log('✅ All critical elements found - OkayDocay Enhanced with Simplified Checkboxes ready!');
    }

    // Initialize UI state
    const generateConfigBtn = document.getElementById('generate-config-btn');
    const clearFieldsBtn = document.getElementById('clear-fields-btn');

    if (generateConfigBtn) generateConfigBtn.disabled = true;
    if (clearFieldsBtn) clearFieldsBtn.disabled = true;

    showStatus('Ready! Upload a PDF to begin simplified field configuration.', 'info');
});

// ================================
// PERFORMANCE MONITORING
// ================================

if (window.performance && window.performance.mark) {
    window.performance.mark('okaydocay-simplified-script-loaded');

    window.addEventListener('load', function() {
        window.performance.mark('okaydocay-simplified-app-ready');

        const loadTime = window.performance.now();
        console.log(`🚀 OkayDocay Enhanced with Simplified Checkboxes loaded in ${loadTime.toFixed(2)}ms`);
    });
}

// ================================
// CONSOLE LOGGING AND DEBUG
// ================================

console.log('📄 OkayDocay Enhanced with Simplified Checkboxes - JavaScript Loaded');
console.log('🎯 Features: PDF Upload, Simplified Field Configuration, Manual Script Upload');
console.log('⚡ Field Types: Text, Signature, Simple Checkbox (Tick Box)');
console.log('☑️ Checkbox Implementation: Simple tick boxes with coordinates only');
console.log('🔧 Manual Scripts: Upload 3 custom Python scripts');
console.log('🐙 GitHub Integration: Direct repository uploads');
console.log('🚀 Ready for simplified PDF processing!');

let currentPdf = null;