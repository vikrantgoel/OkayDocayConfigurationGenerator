from flask import Flask, render_template, request, jsonify, send_file
import io
import os
from werkzeug.utils import secure_filename
import tempfile
import json
import logging
import base64
from PIL import Image, ImageDraw, ImageFont
import pdfplumber

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = '/tmp/uploads'
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Global variables
current_pdf = None
current_filename = None
current_filepath = None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/health')
def health_check():
    """Health check endpoint for Render"""
    return jsonify({'status': 'healthy', 'message': 'PDF Coordinates Finder with pdfplumber is running'})


@app.route('/upload_pdf', methods=['POST'])
def upload_pdf():
    global current_pdf, current_filename, current_filepath

    try:
        logger.info("Received PDF upload request")

        if 'pdf_file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        file = request.files['pdf_file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        if file and file.filename.lower().endswith('.pdf'):
            # Save file temporarily
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)

            logger.info(f"Saved PDF file: {filepath}")

            # Open PDF with pdfplumber
            current_pdf = pdfplumber.open(filepath)
            current_filename = filename
            current_filepath = filepath
            page_count = len(current_pdf.pages)

            logger.info(f"Successfully opened PDF with {page_count} pages using pdfplumber")

            return jsonify({
                'success': True,
                'filename': filename,
                'page_count': page_count,
                'library': 'pdfplumber'
            })
        else:
            return jsonify({'error': 'Please upload a valid PDF file'}), 400

    except Exception as e:
        logger.error(f"Error uploading PDF: {str(e)}")
        return jsonify({'error': f'Failed to upload PDF: {str(e)}'}), 500


@app.route('/get_page/<int:page_num>')
def get_page(page_num):
    try:
        if not current_pdf:
            return jsonify({'error': 'No PDF loaded'}), 400

        if page_num < 1 or page_num > len(current_pdf.pages):
            return jsonify({'error': 'Invalid page number'}), 400

        # Get page (pdfplumber uses 0-based indexing)
        page = current_pdf.pages[page_num - 1]

        # Get page dimensions
        width = float(page.width)
        height = float(page.height)

        # Create a visual representation of the page
        scale = request.args.get('scale', 0.8, type=float)
        img_width = int(width * scale)
        img_height = int(height * scale)

        # Create an image with page outline and content indication
        img = Image.new('RGB', (img_width, img_height), 'white')
        draw = ImageDraw.Draw(img)

        # Page border
        draw.rectangle([0, 0, img_width - 1, img_height - 1], outline='black', width=2)

        # Extract and display text content with positioning
        try:
            # Get text with bounding boxes
            chars = page.chars
            words = page.extract_words()

            # Draw words on the image to show text layout
            for word in words[:100]:  # Limit to first 100 words for performance
                x0 = word['x0'] * scale
                y0 = word['top'] * scale
                x1 = word['x1'] * scale
                y1 = word['bottom'] * scale

                # Draw word bounding box
                draw.rectangle([x0, y0, x1, y1], outline='lightblue', width=1)

                # Draw text if it fits
                if y1 - y0 > 8:  # Only draw if rectangle is big enough
                    try:
                        # Truncate long words
                        display_text = word['text'][:20] + "..." if len(word['text']) > 20 else word['text']
                        draw.text((x0 + 2, y0 + 2), display_text, fill='darkblue',
                                  font=None)  # Use default font
                    except:
                        pass  # Skip if text drawing fails

        except Exception as e:
            logger.warning(f"Error drawing text layout: {str(e)}")
            draw.text((50, 50), f"PDF Page {page_num}", fill='black')
            draw.text((50, 80), "pdfplumber - precise coordinate extraction", fill='blue')

        # Add coordinate indicators and info
        draw.text((10, img_height - 100), "Click and drag to select text area", fill='blue')
        draw.text((10, img_height - 80), f"Page size: {int(width)} x {int(height)} pts", fill='gray')
        draw.text((10, img_height - 60), f"File: {current_filename}", fill='gray')
        draw.text((10, img_height - 40), "Using pdfplumber for precise coordinates", fill='green')
        draw.text((10, img_height - 20), f"Words detected: {len(words) if 'words' in locals() else 0}", fill='gray')

        # Convert to base64
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_data = img_buffer.getvalue()
        img_base64 = base64.b64encode(img_data).decode()

        return jsonify({
            'success': True,
            'image': f'data:image/png;base64,{img_base64}',
            'width': width,
            'height': height,
            'scaled_width': width * scale,
            'scaled_height': height * scale,
            'word_count': len(words) if 'words' in locals() else 0
        })

    except Exception as e:
        logger.error(f"Error getting page: {str(e)}")
        return jsonify({'error': f'Failed to get page: {str(e)}'}), 500


@app.route('/extract_text', methods=['POST'])
def extract_text():
    try:
        if not current_pdf:
            return jsonify({'error': 'No PDF loaded'}), 400

        data = request.get_json()
        page_num = data.get('page_num', 1)
        x1 = float(data.get('x1'))
        y1 = float(data.get('y1'))
        x2 = float(data.get('x2'))
        y2 = float(data.get('y2'))

        if page_num < 1 or page_num > len(current_pdf.pages):
            return jsonify({'error': 'Invalid page number'}), 400

        # Get page (pdfplumber uses 0-based indexing)
        page = current_pdf.pages[page_num - 1]

        # Ensure coordinates are in correct order (top-left to bottom-right)
        x0 = min(x1, x2)
        y0 = min(y1, y2)
        x1_crop = max(x1, x2)
        y1_crop = max(y1, y2)

        # Crop the page to the specified coordinates
        bbox = (x0, y0, x1_crop, y1_crop)
        cropped_page = page.crop(bbox)

        # Extract text from the cropped area
        extracted_text = cropped_page.extract_text()

        # Get words with their precise coordinates within the crop area
        words = cropped_page.extract_words()
        word_list = []

        for word in words:
            word_info = {
                'text': word['text'],
                'x0': word['x0'] + x0,  # Adjust coordinates back to full page
                'y0': word['top'] + y0,
                'x1': word['x1'] + x0,
                'y1': word['bottom'] + y0,
                'font': word.get('fontname', 'Unknown'),
                'size': word.get('size', 0)
            }
            word_list.append(word_info)

        # Get characters for even more precise analysis
        chars = cropped_page.chars
        char_list = []

        for char in chars[:100]:  # Limit to first 100 chars for performance
            char_info = {
                'text': char['text'],
                'x0': char['x0'] + x0,
                'y0': char['top'] + y0,
                'x1': char['x1'] + x0,
                'y1': char['bottom'] + y0,
                'font': char.get('fontname', 'Unknown'),
                'size': char.get('size', 0)
            }
            char_list.append(char_info)

        # If no text found, provide helpful message
        if not extracted_text or not extracted_text.strip():
            extracted_text = f"No text found in selected area ({x0:.1f}, {y0:.1f}, {x1_crop:.1f}, {y1_crop:.1f})"

        return jsonify({
            'success': True,
            'text': extracted_text,
            'coordinates': {
                'x1': x0,
                'y1': y0,
                'x2': x1_crop,
                'y2': y1_crop
            },
            'words': word_list,
            'characters': char_list,
            'word_count': len(word_list),
            'char_count': len(char_list),
            'bbox_used': bbox,
            'library': 'pdfplumber'
        })

    except Exception as e:
        logger.error(f"Error extracting text: {str(e)}")
        return jsonify({'error': f'Failed to extract text: {str(e)}'}), 500


@app.route('/search_text', methods=['POST'])
def search_text():
    try:
        if not current_pdf:
            return jsonify({'error': 'No PDF loaded'}), 400

        data = request.get_json()
        search_term = data.get('search_term', '').strip()
        page_num = data.get('page_num', 1)

        if not search_term:
            return jsonify({'error': 'Please provide a search term'}), 400

        if page_num < 1 or page_num > len(current_pdf.pages):
            return jsonify({'error': 'Invalid page number'}), 400

        # Get page
        page = current_pdf.pages[page_num - 1]

        # Get all words with their coordinates
        words = page.extract_words()

        # Search for term in words
        results = []
        search_lower = search_term.lower()

        for word in words:
            if search_lower in word['text'].lower():
                result = {
                    'x1': word['x0'],
                    'y1': word['top'],
                    'x2': word['x1'],
                    'y2': word['bottom'],
                    'text': word['text'],
                    'font': word.get('fontname', 'Unknown'),
                    'size': word.get('size', 0),
                    'exact_match': word['text'].lower() == search_lower,
                    'partial_match': search_lower in word['text'].lower()
                }
                results.append(result)

        # Also search for multi-word phrases
        full_text = page.extract_text()
        if search_term.lower() in full_text.lower():
            # Find approximate positions for multi-word matches
            text_lines = full_text.split('\n')
            for i, line in enumerate(text_lines):
                if search_lower in line.lower():
                    # Estimate position based on line number
                    y_estimate = (i / len(text_lines)) * page.height
                    x_estimate = line.lower().find(search_lower) * 6  # Rough character width

                    # Only add if we don't already have exact word matches
                    exact_matches = [r for r in results if r['exact_match']]
                    if not exact_matches:
                        results.append({
                            'x1': x_estimate,
                            'y1': y_estimate,
                            'x2': x_estimate + len(search_term) * 8,
                            'y2': y_estimate + 15,
                            'text': search_term,
                            'context': line.strip(),
                            'estimated': True
                        })

        return jsonify({
            'success': True,
            'results': results,
            'count': len(results),
            'search_term': search_term,
            'library': 'pdfplumber',
            'note': 'Results include precise word-level coordinates from pdfplumber'
        })

    except Exception as e:
        logger.error(f"Error searching text: {str(e)}")
        return jsonify({'error': f'Failed to search text: {str(e)}'}), 500


@app.route('/get_pdf_info')
def get_pdf_info():
    try:
        if not current_pdf:
            return jsonify({'error': 'No PDF loaded'}), 400

        # Get PDF metadata
        metadata = current_pdf.metadata

        # Get detailed page information
        page_info = []
        for i, page in enumerate(current_pdf.pages):
            page_data = {
                'page_number': i + 1,
                'width': page.width,
                'height': page.height,
                'rotation': getattr(page, 'rotation', 0),
                'word_count': len(page.extract_words()),
                'char_count': len(page.chars) if hasattr(page, 'chars') else 0
            }
            page_info.append(page_data)

        return jsonify({
            'success': True,
            'filename': current_filename,
            'page_count': len(current_pdf.pages),
            'pages': page_info,
            'metadata': {
                'title': metadata.get('Title', 'Unknown'),
                'author': metadata.get('Author', 'Unknown'),
                'subject': metadata.get('Subject', 'Unknown'),
                'creator': metadata.get('Creator', 'Unknown'),
                'producer': metadata.get('Producer', 'Unknown'),
                'creation_date': str(metadata.get('CreationDate', 'Unknown')),
                'modification_date': str(metadata.get('ModDate', 'Unknown'))
            },
            'library': 'pdfplumber',
            'features': [
                'Precise coordinate extraction',
                'Word-level positioning',
                'Character-level analysis',
                'Font information',
                'Exact bounding boxes'
            ]
        })

    except Exception as e:
        logger.error(f"Error getting PDF info: {str(e)}")
        return jsonify({'error': f'Failed to get PDF info: {str(e)}'}), 500


@app.route('/analyze_layout', methods=['POST'])
def analyze_layout():
    """Analyze page layout and return structural information"""
    try:
        if not current_pdf:
            return jsonify({'error': 'No PDF loaded'}), 400

        data = request.get_json()
        page_num = data.get('page_num', 1)

        if page_num < 1 or page_num > len(current_pdf.pages):
            return jsonify({'error': 'Invalid page number'}), 400

        page = current_pdf.pages[page_num - 1]

        # Get layout elements
        words = page.extract_words()
        tables = page.extract_tables()

        # Analyze text structure
        lines = []
        current_line = []
        current_y = None

        for word in words:
            word_y = word['top']

            # Group words into lines based on Y coordinate
            if current_y is None or abs(word_y - current_y) < 5:
                current_line.append(word)
                current_y = word_y
            else:
                if current_line:
                    lines.append(current_line)
                current_line = [word]
                current_y = word_y

        if current_line:
            lines.append(current_line)

        # Process lines
        line_info = []
        for i, line in enumerate(lines):
            line_text = ' '.join([w['text'] for w in line])
            line_bbox = {
                'x0': min([w['x0'] for w in line]),
                'y0': min([w['top'] for w in line]),
                'x1': max([w['x1'] for w in line]),
                'y1': max([w['bottom'] for w in line])
            }

            line_info.append({
                'line_number': i + 1,
                'text': line_text,
                'bbox': line_bbox,
                'word_count': len(line),
                'avg_font_size': sum([w.get('size', 0) for w in line]) / len(line) if line else 0
            })

        return jsonify({
            'success': True,
            'page_number': page_num,
            'total_words': len(words),
            'total_lines': len(lines),
            'total_tables': len(tables),
            'lines': line_info[:50],  # Limit to first 50 lines
            'tables_info': [{'row_count': len(table), 'col_count': len(table[0]) if table else 0}
                            for table in tables],
            'page_dimensions': {
                'width': page.width,
                'height': page.height
            },
            'library': 'pdfplumber'
        })

    except Exception as e:
        logger.error(f"Error analyzing layout: {str(e)}")
        return jsonify({'error': f'Failed to analyze layout: {str(e)}'}), 500


@app.route('/export_coordinates', methods=['POST'])
def export_coordinates():
    try:
        data = request.get_json()
        coordinates = data.get('coordinates', [])

        # Create a detailed text file with coordinates
        output = "PDF Coordinates Export - pdfplumber Analysis\n"
        output += "=" * 60 + "\n\n"
        output += f"Generated using pdfplumber library\n"
        output += f"PDF File: {current_filename or 'Unknown'}\n"
        output += f"Total Coordinate Sets: {len(coordinates)}\n"
        output += f"Library: pdfplumber (precise coordinate extraction)\n\n"

        for i, coord in enumerate(coordinates, 1):
            output += f"Coordinate Set {i}:\n"
            output += f"  Page: {coord.get('page', 'Unknown')}\n"
            output += f"  Bounding Box: ({coord.get('x1', 0):.2f}, {coord.get('y1', 0):.2f}, {coord.get('x2', 0):.2f}, {coord.get('y2', 0):.2f})\n"
            output += f"  Width: {abs(coord.get('x2', 0) - coord.get('x1', 0)):.2f} pts\n"
            output += f"  Height: {abs(coord.get('y2', 0) - coord.get('y1', 0)):.2f} pts\n"
            output += f"  Text: {coord.get('text', 'No text extracted')}\n"

            if coord.get('words'):
                output += f"  Word Count: {len(coord.get('words', []))}\n"
                output += f"  Words: {[w.get('text', '') for w in coord.get('words', [])]}\n"

            if coord.get('font_info'):
                output += f"  Font Info: {coord.get('font_info')}\n"

            if coord.get('note'):
                output += f"  Note: {coord.get('note')}\n"

            output += "-" * 50 + "\n\n"

        output += "\nExtraction Details:\n"
        output += "- Coordinates are precise pixel-level positions from pdfplumber\n"
        output += "- Bounding boxes represent exact text regions\n"
        output += "- Font information includes name and size when available\n"
        output += "- Word-level and character-level analysis supported\n"

        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', prefix='pdfplumber_coordinates_')
        temp_file.write(output)
        temp_file.close()

        return send_file(
            temp_file.name,
            as_attachment=True,
            download_name=f'pdfplumber_coordinates_{current_filename or "export"}.txt',
            mimetype='text/plain'
        )

    except Exception as e:
        logger.error(f"Error exporting coordinates: {str(e)}")
        return jsonify({'error': f'Failed to export coordinates: {str(e)}'}), 500


@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Maximum size is 16MB.'}), 413


@app.errorhandler(500)
def internal_server_error(e):
    logger.error(f"Internal server error: {str(e)}")
    return jsonify({'error': 'Internal server error'}), 500


# Clean up function
def cleanup_pdf():
    global current_pdf
    if current_pdf:
        try:
            current_pdf.close()
        except:
            pass
        current_pdf = None


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)