# app.py (Updated for Render deployment)
from flask import Flask, render_template, request, jsonify, send_file
import fitz  # PyMuPDF
import base64
import io
import os
from werkzeug.utils import secure_filename
import tempfile
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Use /tmp for uploads on Render (since filesystem is read-only except /tmp)
app.config['UPLOAD_FOLDER'] = '/tmp/uploads'
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-change-this-in-production')

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Global variable to store current PDF document
current_pdf = None
current_filename = None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/health')
def health_check():
    """Health check endpoint for Render"""
    return jsonify({'status': 'healthy', 'message': 'PDF Coordinates Finder is running'})


@app.route('/upload_pdf', methods=['POST'])
def upload_pdf():
    global current_pdf, current_filename

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

            # Open PDF with PyMuPDF
            current_pdf = fitz.open(filepath)
            current_filename = filename

            # Get PDF info
            page_count = len(current_pdf)

            logger.info(f"Successfully opened PDF with {page_count} pages")

            return jsonify({
                'success': True,
                'filename': filename,
                'page_count': page_count
            })
        else:
            return jsonify({'error': 'Please upload a valid PDF file'}), 400

    except Exception as e:
        logger.error(f"Error uploading PDF: {str(e)}")
        return jsonify({'error': f'Failed to upload PDF: {str(e)}'}), 500


@app.route('/get_page/<int:page_num>')
def get_page(page_num):
    global current_pdf

    try:
        if current_pdf is None:
            return jsonify({'error': 'No PDF loaded'}), 400

        if page_num < 1 or page_num > len(current_pdf):
            return jsonify({'error': 'Invalid page number'}), 400

        # Get page (PyMuPDF uses 0-based indexing)
        page = current_pdf[page_num - 1]

        # Get page dimensions
        rect = page.rect

        # Render page as image
        scale = request.args.get('scale', 1.0, type=float)
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat)

        # Convert to base64
        img_data = pix.tobytes("png")
        img_base64 = base64.b64encode(img_data).decode()

        return jsonify({
            'success': True,
            'image': f'data:image/png;base64,{img_base64}',
            'width': rect.width,
            'height': rect.height,
            'scaled_width': rect.width * scale,
            'scaled_height': rect.height * scale
        })

    except Exception as e:
        logger.error(f"Error getting page: {str(e)}")
        return jsonify({'error': f'Failed to get page: {str(e)}'}), 500


@app.route('/extract_text', methods=['POST'])
def extract_text():
    global current_pdf

    try:
        if current_pdf is None:
            return jsonify({'error': 'No PDF loaded'}), 400

        data = request.get_json()
        page_num = data.get('page_num', 1)
        x1 = float(data.get('x1'))
        y1 = float(data.get('y1'))
        x2 = float(data.get('x2'))
        y2 = float(data.get('y2'))

        if page_num < 1 or page_num > len(current_pdf):
            return jsonify({'error': 'Invalid page number'}), 400

        # Get page (PyMuPDF uses 0-based indexing)
        page = current_pdf[page_num - 1]

        # Create rectangle for text extraction
        rect = fitz.Rect(x1, y1, x2, y2)

        # Extract text from the rectangle
        text = page.get_text("text", clip=rect)

        # Extract words with positions for better accuracy
        words = page.get_text("words", clip=rect)
        word_list = []
        for word in words:
            word_list.append({
                'text': word[4],
                'x0': word[0],
                'y0': word[1],
                'x1': word[2],
                'y1': word[3]
            })

        return jsonify({
            'success': True,
            'text': text.strip(),
            'coordinates': {
                'x1': x1,
                'y1': y1,
                'x2': x2,
                'y2': y2
            },
            'words': word_list,
            'word_count': len(word_list)
        })

    except Exception as e:
        logger.error(f"Error extracting text: {str(e)}")
        return jsonify({'error': f'Failed to extract text: {str(e)}'}), 500


@app.route('/search_text', methods=['POST'])
def search_text():
    global current_pdf

    try:
        if current_pdf is None:
            return jsonify({'error': 'No PDF loaded'}), 400

        data = request.get_json()
        search_term = data.get('search_term', '').strip()
        page_num = data.get('page_num', 1)

        if not search_term:
            return jsonify({'error': 'Please provide a search term'}), 400

        if page_num < 1 or page_num > len(current_pdf):
            return jsonify({'error': 'Invalid page number'}), 400

        # Get page (PyMuPDF uses 0-based indexing)
        page = current_pdf[page_num - 1]

        # Search for text
        text_instances = page.search_for(search_term)

        results = []
        for rect in text_instances:
            results.append({
                'x1': rect.x0,
                'y1': rect.y0,
                'x2': rect.x1,
                'y2': rect.y1,
                'text': search_term
            })

        return jsonify({
            'success': True,
            'results': results,
            'count': len(results)
        })

    except Exception as e:
        logger.error(f"Error searching text: {str(e)}")
        return jsonify({'error': f'Failed to search text: {str(e)}'}), 500


@app.route('/get_pdf_info')
def get_pdf_info():
    global current_pdf, current_filename

    try:
        if current_pdf is None:
            return jsonify({'error': 'No PDF loaded'}), 400

        # Get PDF metadata
        metadata = current_pdf.metadata

        return jsonify({
            'success': True,
            'filename': current_filename,
            'page_count': len(current_pdf),
            'metadata': {
                'title': metadata.get('title', 'Unknown'),
                'author': metadata.get('author', 'Unknown'),
                'subject': metadata.get('subject', 'Unknown'),
                'creator': metadata.get('creator', 'Unknown'),
                'producer': metadata.get('producer', 'Unknown'),
                'creationDate': metadata.get('creationDate', 'Unknown'),
                'modDate': metadata.get('modDate', 'Unknown')
            }
        })

    except Exception as e:
        logger.error(f"Error getting PDF info: {str(e)}")
        return jsonify({'error': f'Failed to get PDF info: {str(e)}'}), 500


@app.route('/export_coordinates', methods=['POST'])
def export_coordinates():
    try:
        data = request.get_json()
        coordinates = data.get('coordinates', [])

        # Create a text file with coordinates
        output = "PDF Coordinates Export\n"
        output += "=" * 50 + "\n\n"

        for i, coord in enumerate(coordinates, 1):
            output += f"Coordinate Set {i}:\n"
            output += f"  Page: {coord.get('page', 'Unknown')}\n"
            output += f"  Region: ({coord.get('x1', 0)}, {coord.get('y1', 0)}, {coord.get('x2', 0)}, {coord.get('y2', 0)})\n"
            output += f"  Text: {coord.get('text', 'No text extracted')}\n"
            output += "-" * 30 + "\n\n"

        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt')
        temp_file.write(output)
        temp_file.close()

        return send_file(temp_file.name, as_attachment=True, download_name='pdf_coordinates.txt')

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


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

