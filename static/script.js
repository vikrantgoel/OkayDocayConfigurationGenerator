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
        let configMode = false;
        let fieldDefinitions = [];
        let extractedData = {
            pdf_name: '',
            total_pages: 0,
            export_date: '',
            session_id: '',
            fields_by_page: {},
            summary: {
                total_fields: 0,
                pages_with_fields: 0,
                fields_per_page: {}
            }
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
        });

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
            pdfCanvas.addEventListener('mousemove', updateSelection);
            pdfCanvas.addEventListener('mouseup', endSelection);
            pdfCanvas.addEventListener('load', onImageLoad);

            // Coordinate inputs with validation
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
            document.getElementById('extract-all-btn').addEventListener('click', extractAllFields);
            document.getElementById('generate-config-btn').addEventListener('click', generateConfig);
            document.getElementById('field-name').addEventListener('input', validateField);
        }

        function showLoading(message = 'Processing...') {
            loadingText.textContent = message;
            loadingOverlay.classList.remove('hidden');
        }

        function hideLoading() {
            loadingOverlay.classList.add('hidden');
        }

        function updateStepIndicator(currentStep) {
            // Reset all steps
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

            // Show config section and populate page dropdown when PDF is loaded
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

                    // Initialize config data
                    extractedData.pdf_name = result.filename;
                    extractedData.total_pages = result.page_count;
                    extractedData.session_id = generateSessionId();

                    // Initialize fields_by_page for all pages
                    for (let i = 1; i <= result.page_count; i++) {
                        extractedData.fields_by_page[i] = [];
                        extractedData.summary.fields_per_page[i] = 0;
                    }

                    currentScale = 1.0;
                    hideLoading();
                    loadPage(1);
                    enableControls(true);
                    updateStepIndicator('navigate');
                    showStatus(`PDF loaded successfully! ${totalPages} pages (${result.page_width}×${result.page_height} pts)`, 'success');
                } else {
                    hideLoading();
                    showStatus(`Upload failed: ${result.error}`, 'error');
                }
            } catch (error) {
                hideLoading();
                showStatus(`Upload error: ${error.message}`, 'error');
            }
        }

        async function loadPage(pageNum) {
            if (!currentPdf) return;

            showStatus(`Loading page ${pageNum} at ${Math.round(currentScale * 100)}% zoom...`, 'info');

            try {
                const response = await fetch(`/get_page/${pageNum}?scale=${currentScale}&filename=${currentPdf}`);
                const result = await response.json();

                if (result.success) {
                    pdfCanvas.src = result.image;

                    // Store actual image dimensions from the response
                    currentImageDimensions.width = result.display_width;
                    currentImageDimensions.height = result.display_height;

                    updateZoomInfo();
                    updatePageInfo();
                    updatePageControls();
                    clearSelection();

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
            // Set the actual size of the image element to match the generated image
            pdfCanvas.style.width = currentImageDimensions.width + 'px';
            pdfCanvas.style.height = currentImageDimensions.height + 'px';
            updateDebugInfo(`Image set to: ${currentImageDimensions.width}×${currentImageDimensions.height}px`);
        }

        function changePage(delta) {
            const newPage = currentPage + delta;
            if (newPage >= 1 && newPage <= totalPages) {
                currentPage = newPage;
                loadPage(currentPage);
                // Update the target page dropdown to reflect current page
                document.getElementById('target-page').value = currentPage;
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
            // Calculate the conversion factor from image pixels to PDF points
            return {
                x: pdfDimensions.width / currentImageDimensions.width,
                y: pdfDimensions.height / currentImageDimensions.height
            };
        }

        function startSelection(event) {
            if (!currentPdf) return;

            isSelecting = true;
            const rect = pdfCanvas.getBoundingClientRect();

            // Get coordinates relative to the actual image
            selectionStart = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };

            clearHighlights();
            updateDebugInfo(`Starting selection at image pixel: (${selectionStart.x.toFixed(1)}, ${selectionStart.y.toFixed(1)})`);
        }

        function updateSelection(event) {
            if (!isSelecting || !selectionStart) return;

            const rect = pdfCanvas.getBoundingClientRect();
            const currentPos = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };

            // Calculate image pixel coordinates
            const imageCoords = {
                x1: Math.min(selectionStart.x, currentPos.x),
                y1: Math.min(selectionStart.y, currentPos.y),
                x2: Math.max(selectionStart.x, currentPos.x),
                y2: Math.max(selectionStart.y, currentPos.y)
            };

            // Convert to PDF coordinates
            const conversionFactor = getCoordinateConversionFactor();
            const pdfCoords = {
                x1: imageCoords.x1 * conversionFactor.x,
                y1: imageCoords.y1 * conversionFactor.y,
                x2: imageCoords.x2 * conversionFactor.x,
                y2: imageCoords.y2 * conversionFactor.y
            };

            updateCoordinateFields(pdfCoords.x1, pdfCoords.y1, pdfCoords.x2, pdfCoords.y2);
            updateDebugInfo(`Selecting:<br>Image: (${imageCoords.x1.toFixed(1)}, ${imageCoords.y1.toFixed(1)}, ${imageCoords.x2.toFixed(1)}, ${imageCoords.y2.toFixed(1)})<br>PDF: (${pdfCoords.x1.toFixed(1)}, ${pdfCoords.y1.toFixed(1)}, ${pdfCoords.x2.toFixed(1)}, ${pdfCoords.y2.toFixed(1)})<br>Factor: ${conversionFactor.x.toFixed(3)}, ${conversionFactor.y.toFixed(3)}`);

            showSelectionBox(selectionStart, currentPos);
        }

        function endSelection(event) {
            if (!isSelecting) return;

            isSelecting = false;
            const rect = pdfCanvas.getBoundingClientRect();
            const endPos = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };

            if (selectionStart &&
                Math.abs(endPos.x - selectionStart.x) > 5 &&
                Math.abs(endPos.y - selectionStart.y) > 5) {

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

                updateCoordinateFields(pdfCoords.x1, pdfCoords.y1, pdfCoords.x2, pdfCoords.y2);
                extractText();
            }

            clearSelectionBox();
        }

        function updateCoordinateFields(x1, y1, x2, y2) {
            document.getElementById('pdf_x1').value = Math.round(x1 * 10) / 10;
            document.getElementById('pdf_y1').value = Math.round(y1 * 10) / 10;
            document.getElementById('pdf_x2').value = Math.round(x2 * 10) / 10;
            document.getElementById('pdf_y2').value = Math.round(y2 * 10) / 10;
            document.getElementById('coord-input').value = `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`;

            // Update current coords for config maker
            document.getElementById('current-coords').value = `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`;

            hasValidSelection = true;
            enableExtractionControls(true);
            updateStepIndicator('select');
            validateField(); // Re-validate when coordinates change
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

                    // Show highlight by converting PDF coordinates back to image coordinates
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
                        // Convert PDF coordinates to image coordinates for highlighting
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

        function showArea() {
            const pdfX1 = parseFloat(document.getElementById('pdf_x1').value);
            const pdfY1 = parseFloat(document.getElementById('pdf_y1').value);
            const pdfX2 = parseFloat(document.getElementById('pdf_x2').value);
            const pdfY2 = parseFloat(document.getElementById('pdf_y2').value);

            if (!isNaN(pdfX1) && !isNaN(pdfY1) && !isNaN(pdfX2) && !isNaN(pdfY2)) {
                // Convert PDF coordinates to image coordinates for highlighting
                const conversionFactor = getCoordinateConversionFactor();
                const imageX1 = pdfX1 / conversionFactor.x;
                const imageY1 = pdfY1 / conversionFactor.y;
                const imageX2 = pdfX2 / conversionFactor.x;
                const imageY2 = pdfY2 / conversionFactor.y;

                showHighlight(imageX1, imageY1, imageX2, imageY2, '#f59e0b');
                updateDebugInfo(`Showing area: PDF(${pdfX1}, ${pdfY1}, ${pdfX2}, ${pdfY2}) -> Image(${imageX1.toFixed(1)}, ${imageY1.toFixed(1)}, ${imageX2.toFixed(1)}, ${imageY2.toFixed(1)})`);
            }
        }

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

        function clearSelection() {
            clearHighlights();
            clearSelectionBox();
            ['pdf_x1', 'pdf_y1', 'pdf_x2', 'pdf_y2'].forEach(id => {
                document.getElementById(id).value = '';
            });
            document.getElementById('coord-input').value = '';
            document.getElementById('current-coords').value = '';
            hasValidSelection = false;
            updateDebugInfo('No coordinates selected');
            validateField(); // Re-validate when selection is cleared
        }

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

        function showStatus(message, type) {
            statusArea.innerHTML = `<div class="status ${type}">${message}</div>`;
            setTimeout(() => {
                if (statusArea.innerHTML.includes(message)) {
                    statusArea.innerHTML = '';
                }
            }, 6000);
        }

        // Config Maker Functions
        function generateSessionId() {
            return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

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

        // Handle page selection from dropdown - automatically navigate to selected page
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
            const validation = document.getElementById('field-validation');
            const addBtn = document.getElementById('add-field-btn');
            const previewBtn = document.getElementById('preview-field-btn');

            let isValid = false;

            if (!fieldName) {
                validation.textContent = 'Please enter a field name';
                validation.classList.remove('hidden');
            } else if (!targetPage) {
                validation.textContent = 'Please select a target page';
                validation.classList.remove('hidden');
            } else {
                // Check if coordinates are available
                const currentCoords = document.getElementById('current-coords').value;
                if (!currentCoords || !hasValidSelection) {
                    validation.textContent = 'Please select an area on the PDF first';
                    validation.classList.remove('hidden');
                } else {
                    validation.classList.add('hidden');
                    isValid = true;
                }
            }

            addBtn.disabled = !isValid;
            previewBtn.disabled = !isValid;
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

        function showFieldPreview(x1, y1, x2, y2) {
            clearHighlights();

            // Convert PDF coordinates to image coordinates for highlighting
            const conversionFactor = getCoordinateConversionFactor();
            const imageX1 = x1 / conversionFactor.x;
            const imageY1 = y1 / conversionFactor.y;
            const imageX2 = x2 / conversionFactor.x;
            const imageY2 = y2 / conversionFactor.y;

            showHighlight(imageX1, imageY1, imageX2, imageY2, '#10b981');
            showStatus('Field preview highlighted in green', 'success');
        }

        function addField() {
            const fieldName = document.getElementById('field-name').value.trim();
            const targetPage = parseInt(document.getElementById('target-page').value);
            const coordinates = document.getElementById('current-coords').value;

            if (!fieldName || !coordinates || !targetPage) {
                showStatus('Please fill all required fields', 'error');
                return;
            }

            // Check for duplicate field names on the target page
            const existingField = fieldDefinitions.find(f => f.name === fieldName && f.page === targetPage);
            if (existingField) {
                showStatus(`Field "${fieldName}" already exists on page ${targetPage}`, 'warning');
                return;
            }

            const field = {
                name: fieldName,
                coordinates: coordinates,
                page: targetPage,
                created_at: new Date().toISOString(),
                text: '',
                entry_mode: 'selection'
            };

            fieldDefinitions.push(field);
            updateFieldsList();

            // Clear inputs
            document.getElementById('field-name').value = '';
            document.getElementById('target-page').value = '';
            document.getElementById('current-coords').value = '';
            hasValidSelection = false;
            enableExtractionControls(false);
            clearSelection();

            showStatus(`Field "${fieldName}" added for page ${targetPage}`, 'success');

            // Enable bulk operations
            document.getElementById('clear-fields-btn').disabled = false;
            document.getElementById('extract-all-btn').disabled = false;
            document.getElementById('generate-config-btn').disabled = false;
        }

        function updateFieldsList() {
            const fieldsList = document.getElementById('fields-list');

            if (fieldDefinitions.length === 0) {
                fieldsList.innerHTML = '<div style="text-align: center; opacity: 0.7; font-style: italic;">No fields defined yet. Add fields using the button above.</div>';
                return;
            }

            // Group fields by page
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

                fields.forEach((field, index) => {
                    const statusIcon = field.text ? '✅' : '⏳';
                    const textPreview = field.text ? field.text.substring(0, 30) + (field.text.length > 30 ? '...' : '') : 'Not extracted';

                    html += `<div style="margin: 5px 0; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 5px; font-size: 12px;">`;
                    html += `${statusIcon} 🎯 <strong>${field.name}</strong><br>`;
                    html += `📍 ${field.coordinates}<br>`;
                    html += `📝 ${textPreview}`;
                    html += `<button onclick="editField('${field.name}', ${field.page})" class="edit-field-btn" style="float: right; margin-left: 5px;">Edit</button>`;
                    html += `<button onclick="removeField('${field.name}', ${field.page})" class="remove-field-btn" style="float: right;">Remove</button>`;
                    html += `</div>`;
                });

                html += `</div>`;
            }

            fieldsList.innerHTML = html;
        }

        function editField(fieldName, page) {
            const field = fieldDefinitions.find(f => f.name === fieldName && f.page === page);
            if (!field) return;

            // Populate form with field data
            document.getElementById('field-name').value = field.name;
            document.getElementById('target-page').value = field.page;
            document.getElementById('current-coords').value = field.coordinates;

            // Navigate to the field's page if different from current
            if (field.page !== currentPage) {
                currentPage = field.page;
                loadPage(currentPage);
            }

            // Remove the field so it can be re-added
            removeField(fieldName, page);
            showStatus(`Field "${fieldName}" loaded for editing`, 'info');
        }

        function removeField(fieldName, page) {
            fieldDefinitions = fieldDefinitions.filter(f => !(f.name === fieldName && f.page === page));
            updateFieldsList();
            showStatus(`Field "${fieldName}" removed from page ${page}`, 'info');

            if (fieldDefinitions.length === 0) {
                document.getElementById('clear-fields-btn').disabled = true;
                document.getElementById('extract-all-btn').disabled = true;
                document.getElementById('generate-config-btn').disabled = true;
            }
        }

        function clearAllFields() {
            if (fieldDefinitions.length === 0) return;

            if (confirm('Are you sure you want to clear all field definitions?')) {
                fieldDefinitions = [];
                updateFieldsList();
                document.getElementById('clear-fields-btn').disabled = true;
                document.getElementById('extract-all-btn').disabled = true;
                document.getElementById('generate-config-btn').disabled = true;
                showStatus('All fields cleared', 'info');
            }
        }

        async function extractAllFields() {
            if (fieldDefinitions.length === 0) {
                showStatus('No fields defined for extraction', 'warning');
                return;
            }

            showLoading('Extracting all fields across pages...');

            let successCount = 0;
            let errorCount = 0;

            try {
                // Reset extracted data
                extractedData.export_date = new Date().toISOString();
                for (let i = 1; i <= totalPages; i++) {
                    extractedData.fields_by_page[i] = [];
                }

                // Process each field
                for (const field of fieldDefinitions) {
                    try {
                        const coords = field.coordinates.split(',').map(x => parseFloat(x.trim()));

                        const response = await fetch('/extract_text', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                page_num: field.page,
                                x1: coords[0],
                                y1: coords[1],
                                x2: coords[2],
                                y2: coords[3]
                            })
                        });

                        const result = await response.json();

                        if (result.success) {
                            field.text = result.text || '';
                            field.word_count = result.word_count || 0;
                            field.extracted_at = new Date().toISOString();

                            // Add to extracted data structure
                            extractedData.fields_by_page[field.page].push({
                                name: field.name,
                                coordinates: field.coordinates,
                                text: field.text,
                                page: field.page,
                                created_at: field.created_at,
                                extracted_at: field.extracted_at,
                                word_count: field.word_count,
                                entry_mode: field.entry_mode
                            });

                            successCount++;
                        } else {
                            errorCount++;
                            field.text = `Error: ${result.error}`;
                        }
                    } catch (error) {
                        errorCount++;
                        field.text = `Error: ${error.message}`;
                    }
                }

                // Update summary
                extractedData.summary.total_fields = fieldDefinitions.length;
                extractedData.summary.pages_with_fields = Object.values(extractedData.fields_by_page)
                    .filter(pageFields => pageFields.length > 0).length;

                for (let i = 1; i <= totalPages; i++) {
                    extractedData.summary.fields_per_page[i] = extractedData.fields_by_page[i].length;
                }

                hideLoading();
                updateFieldsList();
                updateStepIndicator('extract');

                showStatus(`Extraction completed! ✅ ${successCount} successful, ❌ ${errorCount} errors`,
                    errorCount > 0 ? 'warning' : 'success');

                // Show summary in extracted text area
                const extractedTextArea = document.getElementById('extracted-text');
                let summaryText = `Bulk Extraction Complete!\n\n`;
                summaryText += `✅ Successfully extracted: ${successCount} fields\n`;
                if (errorCount > 0) summaryText += `❌ Errors: ${errorCount} fields\n`;
                summaryText += `📄 Pages processed: ${extractedData.summary.pages_with_fields} of ${totalPages}\n\n`;

                summaryText += `Extracted Data Summary:\n`;
                for (let i = 1; i <= totalPages; i++) {
                    if (extractedData.fields_by_page[i].length > 0) {
                        summaryText += `Page ${i}: ${extractedData.fields_by_page[i].length} fields\n`;
                        extractedData.fields_by_page[i].forEach(field => {
                            summaryText += `  • ${field.name}: "${field.text.substring(0, 50)}${field.text.length > 50 ? '...' : ''}"\n`;
                        });
                    }
                }

                extractedTextArea.textContent = summaryText;
                extractedTextArea.classList.add('has-text');

            } catch (error) {
                hideLoading();
                showStatus(`Extraction failed: ${error.message}`, 'error');
            }
        }

        async function generateConfig() {
            if (fieldDefinitions.length === 0) {
                showStatus('No field data to export', 'warning');
                return;
            }

            showLoading('Generating configuration...');

            try {
                // Create the configuration structure
                const configData = {
                    pdf_name: extractedData.pdf_name,
                    total_pages: extractedData.total_pages,
                    export_date: new Date().toISOString(),
                    session_id: extractedData.session_id,
                    config_version: "1.0",
                    fields_by_page: {},
                    summary: {
                        total_fields: fieldDefinitions.length,
                        pages_with_fields: 0,
                        fields_per_page: {}
                    }
                };

                // Initialize all pages
                for (let i = 1; i <= extractedData.total_pages; i++) {
                    configData.fields_by_page[i] = [];
                    configData.summary.fields_per_page[i] = 0;
                }

                // Add fields to the configuration
                fieldDefinitions.forEach(field => {
                    const fieldConfig = {
                        name: field.name,
                        coordinates: field.coordinates,
                        text: field.text || "",
                        page: field.page,
                        created_at: field.created_at,
                        entry_mode: field.entry_mode || "selection",
                        extracted_at: field.extracted_at || null,
                        word_count: field.word_count || 0
                    };

                    configData.fields_by_page[field.page].push(fieldConfig);
                });

                // Update summary
                configData.summary.pages_with_fields = Object.values(configData.fields_by_page)
                    .filter(pageFields => pageFields.length > 0).length;

                for (let i = 1; i <= extractedData.total_pages; i++) {
                    configData.summary.fields_per_page[i] = configData.fields_by_page[i].length;
                }

                // Create and download JSON file
                const dataStr = JSON.stringify(configData, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });

                const url = URL.createObjectURL(dataBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `pdf_config_${configData.pdf_name.replace('.pdf', '')}_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                hideLoading();
                showStatus('Configuration JSON generated and downloaded successfully!', 'success');

                // Also display the config in the extracted text area for review
                const extractedTextArea = document.getElementById('extracted-text');
                extractedTextArea.textContent = `Configuration Generated!\n\nTotal Fields: ${configData.summary.total_fields}\nPages with Fields: ${configData.summary.pages_with_fields}\n\nJSON file downloaded: pdf_config_${configData.pdf_name.replace('.pdf', '')}_${Date.now()}.json\n\nPreview:\n${JSON.stringify(configData, null, 2).substring(0, 500)}...`;
                extractedTextArea.classList.add('has-text');

            } catch (error) {
                hideLoading();
                showStatus(`Configuration generation failed: ${error.message}`, 'error');
            }
        }

        // Make functions globally accessible
        window.removeField = removeField;
        window.editField = editField;