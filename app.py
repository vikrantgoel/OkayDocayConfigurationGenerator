from flask import Flask, request, jsonify, render_template, send_file
import pdfplumber
from PIL import Image, ImageDraw
import io
import base64
import tempfile
from werkzeug.utils import secure_filename
import uuid

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Store PDF objects in memory
pdf_storage = {}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload_pdf', methods=['POST'])
def upload_pdf():
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

        # Open with pdfplumber
        pdf = pdfplumber.open(file_path)
        page_count = len(pdf.pages)

        # Store PDF object
        pdf_storage[filename] = {
            'pdf': pdf,
            'file_path': file_path,
            'page_count': page_count
        }

        return jsonify({
            'success': True,
            'filename': filename,
            'page_count': page_count,
            'library': 'pdfplumber'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/get_page/<int:page_num>')
def get_page(page_num):
    try:
        # Get PDF filename from request args or use the most recent one
        filename = request.args.get('filename')
        if not filename:
            # Use the most recent PDF if no filename specified
            if not pdf_storage:
                return jsonify({'success': False, 'error': 'No PDF loaded'})
            filename = list(pdf_storage.keys())[-1]

        if filename not in pdf_storage:
            return jsonify({'success': False, 'error': 'PDF not found'})

        pdf_data = pdf_storage[filename]
        pdf = pdf_data['pdf']

        if page_num < 1 or page_num > len(pdf.pages):
            return jsonify({'success': False, 'error': 'Invalid page number'})

        page = pdf.pages[page_num - 1]

        # Convert PDF page to image using pdfplumber's built-in method
        scale = float(request.args.get('scale', 1.0))

        # Create image from PDF page
        img = page.to_image(resolution=150 * scale)
        pil_img = img.original

        # Convert to base64
        img_buffer = io.BytesIO()
        pil_img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode()

        # Get word count for this page
        words = page.extract_words()
        word_count = len(words)

        return jsonify({
            'success': True,
            'image': f'data:image/png;base64,{img_base64}',
            'width': pil_img.width,
            'height': pil_img.height,
            'scaled_width': pil_img.width,
            'scaled_height': pil_img.height,
            'word_count': word_count
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/extract_text', methods=['POST'])
def extract_text():
    try:
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

        # Extract text from the specified coordinates
        # pdfplumber uses (x1, y1, x2, y2) where y increases downward
        cropped_page = page.crop((x1, y1, x2, y2))
        text = cropped_page.extract_text()

        # Count words
        words = cropped_page.extract_words()
        word_count = len(words)

        return jsonify({
            'success': True,
            'text': text or '',
            'word_count': word_count,
            'library': 'pdfplumber',
            'coordinates': f'({x1}, {y1}, {x2}, {y2})'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/search_text', methods=['POST'])
def search_text():
    try:
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
                results.append({
                    'text': word['text'],
                    'x1': word['x0'],
                    'y1': word['top'],
                    'x2': word['x1'],
                    'y2': word['bottom']
                })

        return jsonify({
            'success': True,
            'results': results,
            'count': len(results)
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/analyze_layout', methods=['POST'])
def analyze_layout():
    try:
        data = request.get_json()
        page_num = data.get('page_num', 1)

        if not pdf_storage:
            return jsonify({'success': False, 'error': 'No PDF loaded'})

        filename = list(pdf_storage.keys())[-1]
        pdf_data = pdf_storage[filename]
        pdf = pdf_data['pdf']

        page = pdf.pages[page_num - 1]

        # Extract different elements
        words = page.extract_words()
        text_lines = page.extract_text_lines()
        tables = page.find_tables()

        # Create summary
        lines_info = []
        for line in text_lines[:10]:  # First 10 lines
            lines_info.append({
                'text': line['text'][:100],  # First 100 chars
                'x': round(line['x0'], 1),
                'y': round(line['top'], 1)
            })

        return jsonify({
            'success': True,
            'page_number': page_num,
            'total_words': len(words),
            'total_lines': len(text_lines),
            'total_tables': len(tables),
            'lines': lines_info,
            'page_width': page.width,
            'page_height': page.height
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/export_coordinates', methods=['POST'])
def export_coordinates():
    try:
        data = request.get_json()
        coordinates = data.get('coordinates', [])

        # Create export text
        export_text = "PDF Coordinates Export\n"
        export_text += "=" * 50 + "\n\n"

        for coord in coordinates:
            export_text += f"Page: {coord.get('page', 1)}\n"
            export_text += f"Coordinates: ({coord.get('x1', 0)}, {coord.get('y1', 0)}, {coord.get('x2', 0)}, {coord.get('y2', 0)})\n"
            export_text += f"Text: {coord.get('text', 'No text')}\n"
            export_text += "-" * 30 + "\n\n"

        # Create temporary file
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
            f.write(export_text)
            temp_path = f.name

        return send_file(temp_path, as_attachment=True, download_name='coordinates_export.txt')

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    app.run(debug=True)