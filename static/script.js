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

// Field types
const FIELD_TYPES = {
    TEXT: 'text',
    SIGNATURE: 'signature',
    CHECKBOX: 'checkbox'
};

// DOM elements
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('pdf-file');
const pdfControls = document.getElementById('pdf-controls');
const pdfCanvas = document.getElementById('pdf-canvas');
const pageInfo = document.getElementById('page-info');
const statusArea = document.getElementById('status-area');
const extractedText = document.getElementById('extracted-text');
const debugInfo = document.getElementById('debug-info');
const coordinateDebug = document.getElementById('coordinate-debug');
const zoomInfo = document.getElementById('zoom-info');
const canvasContainer = document.getElementById('canvas-container');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// Step elements
const stepUpload = document.getElementById('step-upload');
const stepNavigate = document.getElementById('step-navigate');
const stepSelect = document.getElementById('step-select');
const stepExtract = document.getElementById('step-extract');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    updateStepIndicator('upload');
    setupRightClickNavigation();
    setupFieldTypeControls();
});

// ================================
// FIELD TYPE SETUP
// ================================

function setupFieldTypeControls() {
    const fieldTypeSelect = document.getElementById('field-type');
    const checkboxOptionsContainer = document.getElementById('checkbox-options-container');
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
    const fieldType = document.getElementById('field-type').value;
    const checkboxContainer = document.getElementById('checkbox-options-container');
    const normalControls = document.getElementById('normal-field-controls');
    const checkboxControls = document.getElementById('checkbox-field-controls');

    currentFieldType = fieldType;

    if (fieldType === FIELD_TYPES.CHECKBOX) {
        checkboxContainer.classList.remove('hidden');
        normalControls.classList.add('hidden');
        checkboxControls.classList.remove('hidden');
        currentCheckboxOptions = [];
        updateCheckboxOptionsList();
        showStatus('Checkbox mode: Select areas for each option', 'info');
    } else {
        checkboxContainer.classList.add('hidden');
        normalControls.classList.remove('hidden');
        checkboxControls.classList.add('hidden');
        currentCheckboxOptions = [];
        isAddingCheckboxOption = false;
    }

    validateField();
}

function addCheckboxOption() {
    const optionName = document.getElementById('checkbox-option-name').value.trim();
    const coordinates = document.getElementById('current-coords').value;

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
        page: parseInt(document.getElementById('target-page').value)
    };

    currentCheckboxOptions.push(option);
    updateCheckboxOptionsList();

    // Clear inputs for next option
    document.getElementById('checkbox-option-name').value = '';
    document.getElementById('current-coords').value = '';
    clearSelectionOnly();

    showStatus(`Option "${optionName}" added. Add more options or finish the checkbox field.`, 'success');
    
    // Enable finish button
    document.getElementById('finish-checkbox-btn').disabled = false;
}

function updateCheckboxOptionsList() {
    const optionsList = document.getElementById('checkbox-options-list');
    
    if (currentCheckboxOptions.length === 0) {
        optionsList.innerHTML = '<div style="text-align: center; opacity: 0.7; font-style: italic;">No options added yet. Select areas and add options above.</div>';
        return;
    }

    let html = '<div style="margin-bottom: 10px;"><strong>📋 Checkbox Options:</strong></div>';
    currentCheckboxOptions.forEach((option, index) => {
        html += `<div class="checkbox-option-item" style="margin: 5px 0; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 5px; font-size: 12px;">`;
        html += `☑️ <strong>${option.name}</strong><br>`;
        html += `📍 Page ${option.page}: ${option.coordinates}`;
        html += `<button onclick="removeCheckboxOption(${index})" class="remove-field-btn" style="float: right;">Remove</button>`;
        html += `<button onclick="previewCheckboxOption(${index})" class="edit-field-btn" style="float: right; margin-right: 5px;">Preview</button>`;
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
            document.getElementById('finish-checkbox-btn').disabled = true;
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
    const fieldName = document.getElementById('field-name').value.trim();
    
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
    document.getElementById('field-name').value = '';
    document.getElementById('checkbox-option-name').value = '';
    document.getElementById('finish-checkbox-btn').disabled = true;
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

async function removeFieldFromServer(fieldName, pageNum) {
    try {
        const response = await fetch('/remove_field_from_extracted_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                field_name: fieldName,
                page_num: pageNum
            })
        });
        const result = await response.json();
        if (result.success) {
            return result.extracted_data;
        }
        throw new Error(result.error || 'Failed to remove field');
    } catch (error) {
        console.error('Error removing field from server:', error);
        return null;
    }
}

async function clearExtractedDataOnServer() {
    try {
        const response = await fetch('/clear_extracted_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
            return result.extracted_data;
        }
        throw new Error(result.error || 'Failed to clear extracted data');
    } catch (error) {
        console.error('Error clearing extracted data:', error);
        return null;
    }
}

// ================================
// EVENT LISTENERS
// ================================

function setupEventListeners() {
    // File upload
    fileInput.addEventListener('change', handleFileUpload);

    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('drop', handleDrop);
    uploadArea.addEventListener('dragleave', handleDragLeave);

    // Page controls
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
    document.getElementById('zoom-in').addEventListener('click', () => changeZoom(1.25));
    document.getElementById('zoom-out').addEventListener('click', () => changeZoom(0.8));
    document.getElementById('reset-zoom').addEventListener('click', resetZoom);

    // Canvas selection
    pdfCanvas.addEventListener('mousedown', startSelection);
    document.addEventListener('mousemove', updateSelection);
    document.addEventListener('mouseup', endSelection);
    pdfCanvas.addEventListener('load', onImageLoad);
    pdfCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Coordinate inputs
    document.getElementById('coord-input').addEventListener('input', updateCoordinatesFromInput);
    ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2'].forEach(id => {
        document.getElementById(id).addEventListener('input', validateAndUpdateCoordinates);
    });

    // Action buttons
    document.getElementById('extract-btn').addEventListener('click', extractText);
    document.getElementById('show-area-btn').addEventListener('click', showArea);
    document.getElementById('clear-selection-btn').addEventListener('click', clearSelection);
    document.getElementById('search-btn').addEventListener('click', searchText);
    document.getElementById('export-btn').addEventListener('click', exportResults);
    document.getElementById('analyze-layout-btn').addEventListener('click', analyzeLayout);

    // Search input
    document.getElementById('search-text').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchText();
        }
    });

    // Config maker controls
    document.getElementById('target-page').addEventListener('change', handlePageSelection);
    document.getElementById('add-field-btn').addEventListener('click', addField);
    document.getElementById('preview-field-btn').addEventListener('click', previewField);
    document.getElementById('clear-fields-btn').addEventListener('click', clearAllFields);
    document.getElementById('generate-config-btn').addEventListener('click', generateConfig);
    document.getElementById('field-name').addEventListener('input', validateField);
}

// Right-click drag navigation
function setupRightClickNavigation() {
    let isRightDragging = false;
    let rightDragStart = { x: 0, y: 0 };
    let scrollStart = { x: 0, y: 0 };

    const container = document.getElementById('canvas-container');
    if (!container) return;

    container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    container.addEventListener('mousedown', (e) => {
        if (e.button === 2) {
            isRightDragging = true;
            rightDragStart.x = e.clientX;
            rightDragStart.y = e.clientY;
            scrollStart.x = container.scrollLeft;
            scrollStart.y = container.scrollTop;
            container.style.cursor = 'grabbing';
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });

    container.addEventListener('mousemove', (e) => {
        if (isRightDragging) {
            const deltaX = rightDragStart.x - e.clientX;
            const deltaY = rightDragStart.y - e.clientY;
            container.scrollLeft = scrollStart.x + deltaX;
            container.scrollTop = scrollStart.y + deltaY;
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isRightDragging && e.button === 2) {
            isRightDragging = false;
            container.style.cursor = 'crosshair';
        }
    });

    container.addEventListener('mouseleave', () => {
        if (isRightDragging) {
            isRightDragging = false;
            container.style.cursor = 'crosshair';
        }
    });
}

// ================================
// UTILITY FUNCTIONS
// ================================

function showLoading(message = 'Processing...') {
    loadingText.textContent = message;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function updateStepIndicator(currentStep) {
    [stepUpload, stepNavigate, stepSelect, stepExtract].forEach(step => {
        step.classList.remove('active', 'completed');
    });

    switch(currentStep) {
        case 'upload':
            stepUpload.classList.add('active');
            break;
        case 'navigate':
            stepUpload.classList.add('completed');
            stepNavigate.classList.add('active');
            break;
        case 'select':
            stepUpload.classList.add('completed');
            stepNavigate.classList.add('completed');
            stepSelect.classList.add('active');
            break;
        case 'extract':
            stepUpload.classList.add('completed');
            stepNavigate.classList.add('completed');
            stepSelect.classList.add('completed');
            stepExtract.classList.add('active');
            break;
    }
}

function enableControls(enable = true) {
    const controls = [
        'search-text', 'search-btn', 'coord-input',
        'pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2',
        'show-area-btn', 'clear-selection-btn', 'analyze-layout-btn'
    ];

    controls.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = !enable;
        }
    });

    if (enable) {
        document.getElementById('config-section').style.display = 'block';
        document.getElementById('config-controls').classList.remove('hidden');
        document.getElementById('target-page').disabled = false;
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
    zoomInfo.textContent = Math.round(currentScale * 100) + '%';
}

function updatePageInfo() {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

function updateDebugInfo(info) {
    debugInfo.innerHTML = info;
}

function getCoordinateConversionFactor() {
    return {
        x: pdfDimensions.width / currentImageDimensions.width,
        y: pdfDimensions.height / currentImageDimensions.height
    };
}

function showStatus(message, type) {
    statusArea.innerHTML = `<div class="status ${type}">${message}</div>`;
    setTimeout(() => {
        if (statusArea.innerHTML.includes(message)) {
            statusArea.innerHTML = '';
        }
    }, 6000);
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
    uploadArea.classList.add('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');

    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        fileInput.files = event.dataTransfer.files;
        uploadPdf(file);
    } else {
        showStatus('Please drop a valid PDF file', 'error');
    }
}

function handleDragLeave(event) {
    uploadArea.classList.remove('dragover');
}

async function uploadPdf(file) {
    const formData = new FormData();
    formData.append('pdf_file', file);

    showLoading('Processing PDF with OkayDocay...');

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

            uploadArea.classList.add('hidden');
            pdfControls.classList.remove('hidden');
            coordinateDebug.classList.remove('hidden');

            currentScale = 1.0;
            hideLoading();
            loadPage(1);
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
            pdfCanvas.src = result.image;
            currentImageDimensions.width = result.display_width;
            currentImageDimensions.height = result.display_height;

            updateZoomInfo();
            updatePageInfo();
            updatePageControls();

            const targetPageDropdown = document.getElementById('target-page');
            if (targetPageDropdown && targetPageDropdown.value !== pageNum.toString()) {
                targetPageDropdown.value = pageNum;
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
    }
}

function onImageLoad() {
    pdfCanvas.style.width = currentImageDimensions.width + 'px';
    pdfCanvas.style.height = currentImageDimensions.height + 'px';
    updateDebugInfo(`Image set to: ${currentImageDimensions.width}×${currentImageDimensions.height}px`);
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
    if (!currentPdf) return;
    if (event.button !== 0) return;

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
    if (!isSelecting || !selectionStart) return;

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
    if (!isSelecting || !selectionStart) return;

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
        const extractedTextArea = document.getElementById('extracted-text');
        extractedTextArea.textContent = 'Text will appear here after selection...';
        extractedTextArea.classList.remove('has-text');
    }

    clearSelectionBox();
}

function updateCoordinateFields(x1, y1, x2, y2) {
    document.getElementById('pdf_x1').value = Math.round(x1 * 10) / 10;
    document.getElementById('pdf_y1').value = Math.round(y1 * 10) / 10;
    document.getElementById('pdf_x2').value = Math.round(x2 * 10) / 10;
    document.getElementById('pdf_y2').value = Math.round(y2 * 10) / 10;
    document.getElementById('coord-input').value = `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`;
    document.getElementById('current-coords').value = `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`;

    hasValidSelection = true;
    enableExtractionControls(true);
    updateStepIndicator('select');
    validateField();
}

function validateAndUpdateCoordinates() {
    const x1 = parseFloat(document.getElementById('pdf_x1').value) || 0;
    const y1 = parseFloat(document.getElementById('pdf_y1').value) || 0;
    const x2 = parseFloat(document.getElementById('pdf_x2').value) || 0;
    const y2 = parseFloat(document.getElementById('pdf_y2').value) || 0;

    document.getElementById('coord-input').value = `${x1},${y1},${x2},${y2}`;
    updateDebugInfo(`Manual PDF coords: (${x1}, ${y1}, ${x2}, ${y2})`);
    showArea();
}

function updateCoordinatesFromInput() {
    const input = document.getElementById('coord-input').value;
    const coords = input.split(',').map(x => parseFloat(x.trim()));

    if (coords.length === 4 && coords.every(x => !isNaN(x))) {
        document.getElementById('pdf_x1').value = coords[0];
        document.getElementById('pdf_y1').value = coords[1];
        document.getElementById('pdf_x2').value = coords[2];
        document.getElementById('pdf_y2').value = coords[3];
        showArea();
    }
}

function clearSelectionOnly() {
    clearHighlights();
    clearSelectionBox();
    ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('coord-input').value = '';
    document.getElementById('current-coords').value = '';

    const extractedTextArea = document.getElementById('extracted-text');
    extractedTextArea.textContent = 'Text will appear here after selection...';
    extractedTextArea.classList.remove('has-text');

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

        const extractedTextArea = document.getElementById('extracted-text');

        if (result.success) {
            const extractedText = result.text || 'No text found in selected area';
            extractedTextArea.textContent = extractedText;
            extractedTextArea.classList.add('has-text');

            const conversionFactor = getCoordinateConversionFactor();
            const imageX1 = x1 / conversionFactor.x;
            const imageY1 = y1 / conversionFactor.y;
            const imageX2 = x2 / conversionFactor.x;
            const imageY2 = y2 / conversionFactor.y;

            showHighlight(imageX1, imageY1, imageX2, imageY2);

            const wordCount = result.word_count || 0;
            showStatus(`Extracted ${wordCount} words: "${extractedText.substring(0, 50)}${extractedText.length > 50 ? '...' : ''}"`, 'success');
        } else {
            const errorMsg = `Extraction failed: ${result.error || 'Unknown error'}`;
            extractedTextArea.textContent = errorMsg;
            extractedTextArea.classList.remove('has-text');
            showStatus(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Text extraction error:', error);
        const errorMsg = `Error: ${error.message}`;
        document.getElementById('extracted-text').textContent = errorMsg;
        document.getElementById('extracted-text').classList.remove('has-text');
        showStatus(`Text extraction error: ${error.message}`, 'error');
    }
}

async function extractText() {
    if (!currentPdf) {
        showStatus('Please upload a PDF first', 'error');
        return;
    }

    const pdfX1 = parseFloat(document.getElementById('pdf_x1').value);
    const pdfY1 = parseFloat(document.getElementById('pdf_y1').value);
    const pdfX2 = parseFloat(document.getElementById('pdf_x2').value);
    const pdfY2 = parseFloat(document.getElementById('pdf_y2').value);

    if (isNaN(pdfX1) || isNaN(pdfY1) || isNaN(pdfX2) || isNaN(pdfY2)) {
        showStatus('Please enter valid coordinates', 'error');
        return;
    }

    try {
        const response = await fetch('/extract_text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page_num: currentPage,
                x1: pdfX1,
                y1: pdfY1,
                x2: pdfX2,
                y2: pdfY2
            })
        });

        const result = await response.json();

        if (result.success) {
            extractedText.textContent = result.text || 'No text found in selected area';
            extractedText.classList.add('has-text');
            showStatus(`Extracted ${result.word_count} words successfully`, 'success');

            const conversionFactor = getCoordinateConversionFactor();
            const imageX1 = pdfX1 / conversionFactor.x;
            const imageY1 = pdfY1 / conversionFactor.y;
            const imageX2 = pdfX2 / conversionFactor.x;
            const imageY2 = pdfY2 / conversionFactor.y;

            showHighlight(imageX1, imageY1, imageX2, imageY2);
            updateDebugInfo(`Extracted from PDF: (${pdfX1}, ${pdfY1}, ${pdfX2}, ${pdfY2})<br>Highlighted at image: (${imageX1.toFixed(1)}, ${imageY1.toFixed(1)}, ${imageX2.toFixed(1)}, ${imageY2.toFixed(1)})`);
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
    const highlight = document.createElement('div');
    highlight.className = 'highlight-box';
    highlight.style.left = `${x1}px`;
    highlight.style.top = `${y1}px`;
    highlight.style.width = `${x2 - x1}px`;
    highlight.style.height = `${y2 - y1}px`;
    highlight.style.borderColor = color;
    highlight.style.backgroundColor = color + '33';

    canvasContainer.appendChild(highlight);
}

function showSelectionBox(start, end) {
    clearSelectionBox();
    const box = document.createElement('div');
    box.className = 'selection-box';
    box.id = 'selection-box';

    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

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
    const pdfX1 = parseFloat(document.getElementById('pdf_x1').value);
    const pdfY1 = parseFloat(document.getElementById('pdf_y1').value);
    const pdfX2 = parseFloat(document.getElementById('pdf_x2').value);
    const pdfY2 = parseFloat(document.getElementById('pdf_y2').value);

    if (!isNaN(pdfX1) && !isNaN(pdfY1) && !isNaN(pdfX2) && !isNaN(pdfY2)) {
        const conversionFactor = getCoordinateConversionFactor();
        const imageX1 = pdfX1 / conversionFactor.x;
        const imageY1 = pdfY1 / conversionFactor.y;
        const imageX2 = pdfX2 / conversionFactor.x;
        const imageY2 = pdfY2 / conversionFactor.y;

        showHighlight(imageX1, imageY1, imageX2, imageY2, '#f59e0b');
        updateDebugInfo(`Showing area: PDF(${pdfX1}, ${pdfY1}, ${pdfX2}, ${pdfY2}) -> Image(${imageX1.toFixed(1)}, ${imageY1.toFixed(1)}, ${imageX2.toFixed(1)}, ${imageY2.toFixed(1)})`);
    }
}

// ================================
// SEARCH FUNCTIONS
// ================================

async function searchText() {
    const searchTerm = document.getElementById('search-text').value.trim();
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
                const imageX1 = item.x1 / conversionFactor.x;
                const imageY1 = item.y1 / conversionFactor.y;
                const imageX2 = item.x2 / conversionFactor.x;
                const imageY2 = item.y2 / conversionFactor.y;
                showHighlight(imageX1, imageY1, imageX2, imageY2, '#10b981');
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

            extractedText.textContent = layoutText;
            extractedText.classList.add('has-text');
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

    const coordinates = [{
        page: currentPage,
        pdf_x1: parseFloat(document.getElementById('pdf_x1').value) || 0,
        pdf_y1: parseFloat(document.getElementById('pdf_y1').value) || 0,
        pdf_x2: parseFloat(document.getElementById('pdf_x2').value) || 0,
        pdf_y2: parseFloat(document.getElementById('pdf_y2').value) || 0,
        text: extractedText.textContent,
        zoom_level: currentScale,
        image_dimensions: currentImageDimensions,
        pdf_dimensions: pdfDimensions,
        app: 'OkayDocay'
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
    dropdown.innerHTML = '<option value="">Select page...</option>';

    for (let i = 1; i <= totalPages; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Page ${i}`;
        dropdown.appendChild(option);
    }
}

function handlePageSelection() {
    const selectedPage = parseInt(document.getElementById('target-page').value);

    if (selectedPage && selectedPage !== currentPage) {
        showStatus(`Navigating to page ${selectedPage}...`, 'info');
        currentPage = selectedPage;
        loadPage(currentPage);
    }

    validateField();
}

function validateField() {
    const fieldName = document.getElementById('field-name').value.trim();
    const targetPage = document.getElementById('target-page').value;
    const fieldType = document.getElementById('field-type').value;
    const validation = document.getElementById('field-validation');
    const addBtn = document.getElementById('add-field-btn');
    const previewBtn = document.getElementById('preview-field-btn');
    const addOptionBtn = document.getElementById('add-checkbox-option-btn');

    let isValid = false;

    if (!fieldName) {
        validation.textContent = 'Please enter a field name';
        validation.classList.remove('hidden');
    } else if (!targetPage) {
        validation.textContent = 'Please select a target page';
        validation.classList.remove('hidden');
    } else if (fieldType === FIELD_TYPES.CHECKBOX) {
        validation.classList.add('hidden');
        isValid = true; // For checkbox, we handle validation differently
    } else {
        const currentCoords = document.getElementById('current-coords').value;
        if (!currentCoords || !hasValidSelection) {
            validation.textContent = 'Please select an area on the PDF first';
            validation.classList.remove('hidden');
        } else {
            validation.classList.add('hidden');
            isValid = true;
        }
    }

    // Update button states based on field type
    if (fieldType === FIELD_TYPES.CHECKBOX) {
        addBtn.disabled = true; // Disabled for checkbox mode
        previewBtn.disabled = !hasValidSelection;
        if (addOptionBtn) {
            addOptionBtn.disabled = !hasValidSelection || !document.getElementById('checkbox-option-name').value.trim();
        }
    } else {
        addBtn.disabled = !isValid;
        previewBtn.disabled = !isValid;
        if (addOptionBtn) {
            addOptionBtn.disabled = true;
        }
    }
}

function previewField() {
    const targetPage = parseInt(document.getElementById('target-page').value);
    const coords = document.getElementById('current-coords').value.split(',');

    if (coords.length !== 4) {
        showStatus('Invalid coordinates for preview', 'error');
        return;
    }

    const x1 = parseFloat(coords[0]);
    const y1 = parseFloat(coords[1]);
    const x2 = parseFloat(coords[2]);
    const y2 = parseFloat(coords[3]);

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
    const imageX1 = x1 / conversionFactor.x;
    const imageY1 = y1 / conversionFactor.y;
    const imageX2 = x2 / conversionFactor.x;
    const imageY2 = y2 / conversionFactor.y;

    showHighlight(imageX1, imageY1, imageX2, imageY2, color);
    showStatus('Field preview highlighted', 'success');

    extractTextFromSelection(x1, y1, x2, y2);
}

function addField() {
    const fieldType = document.getElementById('field-type').value;

    if (fieldType === FIELD_TYPES.CHECKBOX) {
        showStatus('For checkbox fields, use "Add Option" to add individual options, then "Finish Checkbox Field"', 'info');
        return;
    }

    const fieldName = document.getElementById('field-name').value.trim();
    const targetPage = parseInt(document.getElementById('target-page').value);
    const coordinates = document.getElementById('current-coords').value;

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

    // Clear inputs but preserve page state
    document.getElementById('field-name').value = '';
    document.getElementById('current-coords').value = '';

    hasValidSelection = false;
    enableExtractionControls(false);
    clearSelectionOnly();

    const fieldTypeText = field.type === FIELD_TYPES.CHECKBOX ? `checkbox with ${field.options.length} options` : field.type;
    showStatus(`${fieldTypeText} field "${field.name}" added successfully`, 'success');

    document.getElementById('clear-fields-btn').disabled = false;
    document.getElementById('generate-config-btn').disabled = false;
}

function updateFieldsList() {
    const fieldsList = document.getElementById('fields-list');

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

        fields.forEach((field, index) => {
            const typeIcon = getFieldTypeIcon(field.type);
            html += `<div class="fields-list-item">`;
            html += `${typeIcon} <strong>${field.name}</strong> (${field.type})<br>`;
            
            if (field.type === FIELD_TYPES.CHECKBOX) {
                html += `📋 ${field.options.length} options:<br>`;
                field.options.forEach(option => {
                    html += `&nbsp;&nbsp;☑️ ${option.name} (Page ${option.page})<br>`;
                });
            } else {
                html += `📍 Coordinates: ${field.coordinates}`;
            }
            
            html += `<button onclick="editField('${field.name}')" class="edit-field-btn" style="float: right; margin-left: 5px;">Edit</button>`;
            html += `<button onclick="removeField('${field.name}')" class="remove-field-btn" style="float: right;">Remove</button>`;
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

    document.getElementById('field-name').value = field.name;
    document.getElementById('field-type').value = field.type;

    if (field.type === FIELD_TYPES.CHECKBOX) {
        currentCheckboxOptions = [...field.options];
        handleFieldTypeChange();
        updateCheckboxOptionsList();
    } else {
        document.getElementById('target-page').value = field.page;
        document.getElementById('current-coords').value = field.coordinates;

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
            document.getElementById('clear-fields-btn').disabled = true;
            document.getElementById('generate-config-btn').disabled = true;
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
            document.getElementById('clear-fields-btn').disabled = true;
            document.getElementById('generate-config-btn').disabled = true;
            showStatus('All fields cleared', 'info');
        } catch (error) {
            showStatus(`Error clearing fields: ${error.message}`, 'error');
        }
    }
}

async function generateConfig() {
    if (fieldDefinitions.length === 0) {
        showStatus('No field data to export', 'warning');
        return;
    }

    showLoading('Generating enhanced configuration...');

    try {
        // Create enhanced config structure
        const config = {
            pdf_name: currentPdf,
            total_pages: totalPages,
            created_on: new Date().toISOString(),
            fields: fieldDefinitions.map(field => ({
                name: field.name,
                type: field.type,
                ...(field.type === FIELD_TYPES.CHECKBOX ? {
                    options: field.options
                } : {
                    coordinates: field.coordinates,
                    page: field.page
                })
            }))
        };

        // Generate and download file
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentPdf.replace('.pdf', '')}_enhanced_config_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        hideLoading();
        updateStepIndicator('extract');
        showStatus('Enhanced configuration JSON generated and downloaded!', 'success');

        // Show summary
        const totalFields = fieldDefinitions.length;
        const checkboxFields = fieldDefinitions.filter(f => f.type === FIELD_TYPES.CHECKBOX).length;
        const textFields = fieldDefinitions.filter(f => f.type === FIELD_TYPES.TEXT).length;
        const signatureFields = fieldDefinitions.filter(f => f.type === FIELD_TYPES.SIGNATURE).length;

        const extractedTextArea = document.getElementById('extracted-text');
        extractedTextArea.textContent = `Enhanced Configuration Generated!\n\nPDF: ${currentPdf}\nTotal Pages: ${totalPages}\nTotal Fields: ${totalFields}\n\nField Types:\n- Text Fields: ${textFields}\n- Signature Fields: ${signatureFields}\n- Checkbox Fields: ${checkboxFields}\n\nCreated: ${config.created_on}\n\nJSON Preview:\n${JSON.stringify(config, null, 2)}`;
        extractedTextArea.classList.add('has-text');

    } catch (error) {
        hideLoading();
        showStatus(`Configuration generation failed: ${error.message}`, 'error');
    }
}

// Make functions globally accessible
window.removeField = removeField;
window.editField = editField;
window.removeCheckboxOption = removeCheckboxOption;
window.previewCheckboxOption = previewCheckboxOption;