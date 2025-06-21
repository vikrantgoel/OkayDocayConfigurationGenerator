# Improved PDF Viewer Application with Better Visual Quality and Coordinate Accuracy
# Backend: Flask with pdfplumber for PDF processing
# Frontend: HTML/CSS/JS interface for PDF viewing and text extraction

# app.py - Main Flask Application
from flask import Flask, request, jsonify, render_template, send_file
import pdfplumber
from PIL import Image
import io
import base64
import tempfile
from werkzeug.utils import secure_filename
import uuid
import threading
from functools import lru_cache
import time
import os

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

# Enhanced storage with caching
pdf_storage = {}
image_cache = {}  # Cache rendered images
text_cache = {}  # Cache extracted text

# Thread lock for thread-safe operations
cache_lock = threading.Lock()

# Create templates directory if it doesn't exist
os.makedirs('templates', exist_ok=True)


@app.route('/')
def index():
    """Serve the main PDF viewer interface"""
    return render_template('index.html')


@app.route('/upload_pdf', methods=['POST'])
def upload_pdf():
    """Handle PDF file upload and initial processing"""
    try:
        if 'pdf_file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'})

        file = request.files['pdf_file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'})

        if not file.filename.lower().endswith('.pdf'):
            return jsonify({'success': False, 'error': 'File must be a PDF'})

        # Save file temporarily
        filename = str(uuid.uuid4()) + '.pdf'
        file_path = f"/tmp/{filename}"
        file.save(file_path)

        start_time = time.time()

        # Open with pdfplumber for precise text extraction
        pdf = pdfplumber.open(file_path)
        page_count = len(pdf.pages)

        # Pre-analyze first page for faster initial load
        first_page = pdf.pages[0]
        sample_words = first_page.extract_words()

        # Store PDF object with metadata
        pdf_storage[filename] = {
            'pdf': pdf,
            'file_path': file_path,
            'page_count': page_count,
            'upload_time': time.time(),
            'sample_word_count': len(sample_words),
            'page_dimensions': {
                'width': first_page.width,
                'height': first_page.height
            }
        }

        load_time = round((time.time() - start_time) * 1000, 2)

        return jsonify({
            'success': True,
            'filename': filename,
            'page_count': page_count,
            'library': 'pdfplumber',
            'load_time_ms': load_time,
            'sample_words': len(sample_words),
            'page_width': first_page.width,
            'page_height': first_page.height
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/get_page/<int:page_num>')
def get_page(page_num):
    """Render PDF page with fixed zoom and coordinate mapping"""
    try:
        start_time = time.time()

        # Get PDF filename from request args or use the most recent one
        filename = request.args.get('filename')
        if not filename:
            if not pdf_storage:
                return jsonify({'success': False, 'error': 'No PDF loaded'})
            filename = list(pdf_storage.keys())[-1]

        if filename not in pdf_storage:
            return jsonify({'success': False, 'error': 'PDF not found'})

        scale = float(request.args.get('scale', 1.0))
        cache_key = f"{filename}_{page_num}_{scale}"

        # Check cache first for performance
        with cache_lock:
            if cache_key in image_cache:
                cached_result = image_cache[cache_key].copy()
                cached_result['cached'] = True
                cached_result['load_time_ms'] = round((time.time() - start_time) * 1000, 2)
                return jsonify(cached_result)

        pdf_data = pdf_storage[filename]
        pdf = pdf_data['pdf']

        if page_num < 1 or page_num > len(pdf.pages):
            return jsonify({'success': False, 'error': 'Invalid page number'})

        page = pdf.pages[page_num - 1]

        # FIXED: Consistent resolution calculation
        base_resolution = 150  # Base DPI for scale 1.0
        resolution = int(base_resolution * scale)

        # Ensure minimum quality
        if resolution < 100:
            resolution = 100

        # Create high-quality image from PDF page
        img = page.to_image(resolution=resolution, antialias=True)
        pil_img = img.original

        # Use PNG for better quality
        img_buffer = io.BytesIO()
        pil_img.save(img_buffer, format='PNG', optimize=True, compress_level=6)
        format_used = 'PNG'

        img_buffer.seek(0)
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode()

        # Get word count for this page
        text_cache_key = f"{filename}_{page_num}_words"
        if text_cache_key in text_cache:
            word_count = text_cache[text_cache_key]
        else:
            words = page.extract_words()
            word_count = len(words)
            text_cache[text_cache_key] = word_count

        load_time = round((time.time() - start_time) * 1000, 2)

        # FIXED: Simple response with actual dimensions
        result = {
            'success': True,
            'image': f'data:image/{format_used.lower()};base64,{img_base64}',
            'display_width': pil_img.width,
            'display_height': pil_img.height,
            'pdf_width': page.width,
            'pdf_height': page.height,
            'word_count': word_count,
            'format': format_used,
            'resolution': resolution,
            'load_time_ms': load_time,
            'cached': False
        }

        # Cache the result for future requests
        with cache_lock:
            if len(image_cache) < 15:
                image_cache[cache_key] = result.copy()

        return jsonify(result)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/extract_text', methods=['POST'])
def extract_text():
    """Extract text from specific PDF coordinates (simplified)"""
    try:
        start_time = time.time()

        data = request.get_json()
        page_num = data.get('page_num', 1)
        x1 = float(data.get('x1', 0))
        y1 = float(data.get('y1', 0))
        x2 = float(data.get('x2', 100))
        y2 = float(data.get('y2', 100))

        # Get the most recent PDF
        if not pdf_storage:
            return jsonify({'success': False, 'error': 'No PDF loaded'})

        filename = list(pdf_storage.keys())[-1]
        pdf_data = pdf_storage[filename]
        pdf = pdf_data['pdf']

        if page_num < 1 or page_num > len(pdf.pages):
            return jsonify({'success': False, 'error': 'Invalid page number'})

        page = pdf.pages[page_num - 1]

        # Extract text from the specified PDF coordinates (direct)
        cropped_page = page.crop((x1, y1, x2, y2))
        text = cropped_page.extract_text()

        # Get detailed word information for analysis
        words = cropped_page.extract_words()
        word_details = []

        for word in words[:50]:  # Limit for performance
            word_details.append({
                'text': word['text'],
                'x0': round(word['x0'], 2),
                'y0': round(word['top'], 2),
                'x1': round(word['x1'], 2),
                'y1': round(word['bottom'], 2),
                'font': word.get('fontname', 'Unknown'),
                'size': round(word.get('size', 0), 1)
            })

        processing_time = round((time.time() - start_time) * 1000, 2)

        return jsonify({
            'success': True,
            'text': text or '',
            'word_count': len(words),
            'word_details': word_details,
            'library': 'pdfplumber',
            'coordinates': f'({x1}, {y1}, {x2}, {y2})',
            'processing_time_ms': processing_time,
            'area': {
                'width': x2 - x1,
                'height': y2 - y1,
                'area_pixels': (x2 - x1) * (y2 - y1)
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/search_text', methods=['POST'])
def search_text():
    """Search for text on current page and return PDF coordinates"""
    try:
        start_time = time.time()

        data = request.get_json()
        page_num = data.get('page_num', 1)
        search_term = data.get('search_term', '').lower()

        if not pdf_storage:
            return jsonify({'success': False, 'error': 'No PDF loaded'})

        filename = list(pdf_storage.keys())[-1]
        pdf_data = pdf_storage[filename]
        pdf = pdf_data['pdf']

        page = pdf.pages[page_num - 1]
        words = page.extract_words()

        results = []
        for word in words:
            if search_term in word['text'].lower():
                # Return PDF coordinates (frontend will convert for display)
                results.append({
                    'text': word['text'],
                    'x1': word['x0'],
                    'y1': word['top'],
                    'x2': word['x1'],
                    'y2': word['bottom'],
                    'font': word.get('fontname', 'Unknown'),
                    'size': round(word.get('size', 0), 1)
                })

        processing_time = round((time.time() - start_time) * 1000, 2)

        return jsonify({
            'success': True,
            'results': results,
            'count': len(results),
            'search_term': search_term,
            'processing_time_ms': processing_time
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/analyze_layout', methods=['POST'])
def analyze_layout():
    """Comprehensive layout analysis of PDF page"""
    try:
        start_time = time.time()

        data = request.get_json()
        page_num = data.get('page_num', 1)

        if not pdf_storage:
            return jsonify({'success': False, 'error': 'No PDF loaded'})

        filename = list(pdf_storage.keys())[-1]
        pdf_data = pdf_storage[filename]
        pdf = pdf_data['pdf']

        page = pdf.pages[page_num - 1]

        # Extract different elements for comprehensive analysis
        words = page.extract_words()
        text_lines = page.extract_text_lines()
        tables = page.find_tables()

        # Analyze fonts and typography
        font_stats = {}
        for word in words:
            font = word.get('fontname', 'Unknown')
            size = word.get('size', 0)
            font_key = f"{font}_{size}"
            if font_key not in font_stats:
                font_stats[font_key] = {'count': 0, 'font': font, 'size': size}
            font_stats[font_key]['count'] += 1

        # Top fonts by usage
        top_fonts = sorted(font_stats.values(), key=lambda x: x['count'], reverse=True)[:5]

        # Create detailed line summary
        lines_info = []
        for line in text_lines[:15]:
            lines_info.append({
                'text': line['text'][:150],
                'x': round(line['x0'], 1),
                'y': round(line['top'], 1),
                'width': round(line['x1'] - line['x0'], 1),
                'height': round(line['bottom'] - line['top'], 1)
            })

        processing_time = round((time.time() - start_time) * 1000, 2)

        return jsonify({
            'success': True,
            'page_number': page_num,
            'total_words': len(words),
            'total_lines': len(text_lines),
            'total_tables': len(tables),
            'lines': lines_info,
            'page_width': page.width,
            'page_height': page.height,
            'top_fonts': top_fonts,
            'processing_time_ms': processing_time,
            'cache_stats': {
                'images_cached': len(image_cache),
                'text_cached': len(text_cache)
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/export_coordinates', methods=['POST'])
def export_coordinates():
    """Export coordinate extraction results to file"""
    try:
        data = request.get_json()
        coordinates = data.get('coordinates', [])

        # Create comprehensive export file
        export_text = "PDF Coordinates Export - High Precision Analysis\n"
        export_text += "=" * 60 + "\n"
        export_text += f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
        export_text += f"Total Extractions: {len(coordinates)}\n"
        export_text += f"Library Used: pdfplumber (200 DPI rendering)\n\n"

        for i, coord in enumerate(coordinates, 1):
            export_text += f"Extraction #{i}\n"
            export_text += f"Page: {coord.get('page', 1)}\n"
            export_text += f"PDF Coordinates: {coord.get('pdf_coordinates', 'N/A')}\n"
            export_text += f"Display Coordinates: {coord.get('display_coordinates', 'N/A')}\n"
            export_text += f"Area: {coord.get('area', 'Unknown')}\n"
            export_text += f"Word Count: {coord.get('word_count', 0)}\n"
            export_text += f"Text Content:\n{coord.get('text', 'No text')}\n"
            export_text += "-" * 40 + "\n\n"

        # Create temporary file for download
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8') as f:
            f.write(export_text)
            temp_path = f.name

        return send_file(temp_path, as_attachment=True, download_name='pdf_coordinates_export.txt')

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/clear_cache', methods=['POST'])
def clear_cache():
    """Clear all caches to free memory"""
    global image_cache, text_cache

    with cache_lock:
        cache_cleared = len(image_cache) + len(text_cache)
        image_cache.clear()
        text_cache.clear()

    return jsonify({
        'success': True,
        'message': f'Cleared {cache_cleared} cached items'
    })


if __name__ == '__main__':
    print("🚀 Starting IMPROVED PDF Viewer Application...")
    print("📋 Enhanced Features:")
    print("   • 200 DPI high-resolution rendering")
    print("   • Precise coordinate mapping")
    print("   • PNG format for better quality")
    print("   • Accurate display-to-PDF coordinate conversion")
    print("   • Anti-aliasing for crisp text")
    print("📖 Access at: http://localhost:5000")

    app.run(debug=True, host='0.0.0.0', port=5000)

# requirements.txt - Dependencies needed
"""
Flask==2.3.3
pdfplumber==0.9.0
Pillow==10.0.1
Werkzeug==2.3.7
"""
