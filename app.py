from flask import Flask, request, jsonify, render_template, send_file, session
import pdfplumber
import io
import base64
import tempfile
import uuid
import threading
import time
import os
import json
from datetime import datetime, timedelta
import atexit

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
app.config['SECRET_KEY'] = 'your-secret-key-change-this-in-production'

# Session-based storage with field management
user_sessions = {}
sessions_lock = threading.Lock()

# Configuration
MAX_SESSION_AGE = 3600  # 1 hour
CLEANUP_INTERVAL = 300  # 5 minutes


class UserSession:
    """Isolated storage for each user session with field management"""

    def __init__(self, session_id):
        self.session_id = session_id
        self.created_at = datetime.now()
        self.last_accessed = datetime.now()
        self.pdfs = {}  # {filename: pdf_data}
        self.image_cache = {}  # {cache_key: image_data}
        self.text_cache = {}  # {cache_key: text_data}
        self.temp_files = []  # Track temp files for cleanup

        # Field management storage
        self.page_fields = {}  # {page_num: [{name, coordinates, text, page}, ...]}

    def update_access_time(self):
        self.last_accessed = datetime.now()

    def is_expired(self):
        return (datetime.now() - self.last_accessed).seconds > MAX_SESSION_AGE

    def cleanup(self):
        """Clean up resources when session expires"""
        # Close PDF objects
        for pdf_data in self.pdfs.values():
            if 'pdf' in pdf_data:
                pdf_data['pdf'].close()

        # Remove temp files
        for temp_file in self.temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except:
                pass

        # Clear all data
        self.pdfs.clear()
        self.image_cache.clear()
        self.text_cache.clear()
        self.page_fields.clear()
        self.temp_files.clear()


def get_session_id():
    """Get or create unique session ID for current user"""
    if 'user_session_id' not in session:
        session['user_session_id'] = str(uuid.uuid4())
        session.permanent = True
        app.permanent_session_lifetime = timedelta(seconds=MAX_SESSION_AGE)
    return session['user_session_id']


def get_user_session():
    """Get isolated user session storage"""
    session_id = get_session_id()

    with sessions_lock:
        if session_id not in user_sessions:
            user_sessions[session_id] = UserSession(session_id)

        user_session = user_sessions[session_id]
        user_session.update_access_time()
        return user_session


def cleanup_expired_sessions():
    """Remove expired user sessions and free resources"""
    with sessions_lock:
        expired_sessions = []
        for session_id, user_session in user_sessions.items():
            if user_session.is_expired():
                expired_sessions.append(session_id)

        for session_id in expired_sessions:
            user_session = user_sessions[session_id]
            user_session.cleanup()
            del user_sessions[session_id]
            print(f"Cleaned up expired session: {session_id}")

        return len(expired_sessions)


# Background cleanup thread
def background_cleanup():
    """Periodic cleanup of expired sessions"""
    while True:
        try:
            time.sleep(CLEANUP_INTERVAL)
            cleaned = cleanup_expired_sessions()
            if cleaned > 0:
                print(f"Background cleanup: removed {cleaned} expired sessions")
        except Exception as e:
            print(f"Background cleanup error: {e}")


# Start background cleanup thread
cleanup_thread = threading.Thread(target=background_cleanup, daemon=True)
cleanup_thread.start()


# Cleanup on app shutdown
@atexit.register
def cleanup_on_exit():
    with sessions_lock:
        for user_session in user_sessions.values():
            user_session.cleanup()
    print("Cleaned up all sessions on exit")


# Create templates directory if it doesn't exist
os.makedirs('templates', exist_ok=True)


@app.route('/')
def index():
    session_id = get_session_id()
    return render_template('index.html')


@app.route('/upload_pdf', methods=['POST'])
def upload_pdf():
    """Handle PDF file upload with user isolation"""
    try:
        if 'pdf_file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'})

        file = request.files['pdf_file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'})

        if not file.filename.lower().endswith('.pdf'):
            return jsonify({'success': False, 'error': 'File must be a PDF'})

        user_session = get_user_session()

        # Save file temporarily with session isolation
        filename = f"{user_session.session_id}_{str(uuid.uuid4())}.pdf"
        file_path = f"/tmp/{filename}"
        file.save(file_path)
        user_session.temp_files.append(file_path)

        start_time = time.time()

        # Open with pdfplumber
        pdf = pdfplumber.open(file_path)
        page_count = len(pdf.pages)

        # Pre-analyze first page
        first_page = pdf.pages[0]
        sample_words = first_page.extract_words()

        # Store PDF object in user's isolated storage
        user_session.pdfs[filename] = {
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

        # Clear existing fields when new PDF is uploaded
        user_session.page_fields.clear()

        load_time = round((time.time() - start_time) * 1000, 2)

        return jsonify({
            'success': True,
            'filename': filename,
            'page_count': page_count,
            'library': 'pdfplumber',
            'load_time_ms': load_time,
            'sample_words': len(sample_words),
            'page_width': first_page.width,
            'page_height': first_page.height,
            'session_info': {
                'pdfs_loaded': len(user_session.pdfs),
                'cache_items': len(user_session.image_cache)
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/get_page/<int:page_num>')
def get_page(page_num):
    """Render PDF page with user isolation"""
    try:
        start_time = time.time()
        user_session = get_user_session()

        filename = request.args.get('filename')
        if not filename:
            if not user_session.pdfs:
                return jsonify({'success': False, 'error': 'No PDF loaded for your session'})
            filename = list(user_session.pdfs.keys())[-1]

        if filename not in user_session.pdfs:
            return jsonify({'success': False, 'error': 'PDF not found in your session'})

        scale = float(request.args.get('scale', 1.0))
        cache_key = f"{filename}_{page_num}_{scale}"

        # Check user's cache first
        if cache_key in user_session.image_cache:
            cached_result = user_session.image_cache[cache_key].copy()
            cached_result['cached'] = True
            cached_result['load_time_ms'] = round((time.time() - start_time) * 1000, 2)
            return jsonify(cached_result)

        pdf_data = user_session.pdfs[filename]
        pdf = pdf_data['pdf']

        if page_num < 1 or page_num > len(pdf.pages):
            return jsonify({'success': False, 'error': 'Invalid page number'})

        page = pdf.pages[page_num - 1]

        # Consistent resolution calculation
        base_resolution = 150
        resolution = max(100, int(base_resolution * scale))

        # Create high-quality image from PDF page
        img = page.to_image(resolution=resolution, antialias=True)
        pil_img = img.original

        # Use PNG for better quality
        img_buffer = io.BytesIO()
        pil_img.save(img_buffer, format='PNG', optimize=True, compress_level=6)
        img_buffer.seek(0)
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode()

        # Get word count for this page
        text_cache_key = f"{filename}_{page_num}_words"
        if text_cache_key in user_session.text_cache:
            word_count = user_session.text_cache[text_cache_key]
        else:
            words = page.extract_words()
            word_count = len(words)
            user_session.text_cache[text_cache_key] = word_count

        load_time = round((time.time() - start_time) * 1000, 2)

        result = {
            'success': True,
            'image': f'data:image/png;base64,{img_base64}',
            'display_width': pil_img.width,
            'display_height': pil_img.height,
            'pdf_width': page.width,
            'pdf_height': page.height,
            'word_count': word_count,
            'format': 'PNG',
            'resolution': resolution,
            'load_time_ms': load_time,
            'cached': False,
            'timestamp': time.time()
        }

        # Cache the result in user's isolated cache
        user_session.image_cache[cache_key] = result.copy()

        return jsonify(result)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/extract_text', methods=['POST'])
def extract_text():
    """Extract text from specific PDF coordinates with user isolation"""
    try:
        start_time = time.time()
        user_session = get_user_session()

        data = request.get_json()
        page_num = data.get('page_num', 1)
        x1 = float(data.get('x1', 0))
        y1 = float(data.get('y1', 0))
        x2 = float(data.get('x2', 100))
        y2 = float(data.get('y2', 100))

        if not user_session.pdfs:
            return jsonify({'success': False, 'error': 'No PDF loaded for your session'})

        filename = list(user_session.pdfs.keys())[-1]
        pdf_data = user_session.pdfs[filename]
        pdf = pdf_data['pdf']

        if page_num < 1 or page_num > len(pdf.pages):
            return jsonify({'success': False, 'error': 'Invalid page number'})

        page = pdf.pages[page_num - 1]

        # Extract text from the specified PDF coordinates
        cropped_page = page.crop((x1, y1, x2, y2))
        text = cropped_page.extract_text()

        # Get detailed word information
        words = cropped_page.extract_words()
        word_details = []

        for word in words[:50]:
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
        user_session = get_user_session()

        data = request.get_json()
        page_num = data.get('page_num', 1)
        search_term = data.get('search_term', '').lower()

        if not user_session.pdfs:
            return jsonify({'success': False, 'error': 'No PDF loaded'})

        filename = list(user_session.pdfs.keys())[-1]
        pdf_data = user_session.pdfs[filename]
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


# ================================
# FIELD MANAGEMENT ENDPOINTS
# ================================

@app.route('/add_field', methods=['POST'])
def add_field():
    """Add a new field for the current user session"""
    try:
        user_session = get_user_session()
        data = request.get_json()

        page_num = int(data.get('page_num', 1))
        field_name = data.get('field_name', '').strip()
        coordinates = data.get('coordinates', '').strip()
        text = data.get('text', '').strip()

        # Validation
        if not field_name:
            return jsonify({'success': False, 'error': 'Field name is required'})

        if not coordinates:
            return jsonify({'success': False, 'error': 'Coordinates are required'})

        if not text:
            return jsonify({'success': False, 'error': 'Text is required'})

        # Initialize page fields if not exists
        if page_num not in user_session.page_fields:
            user_session.page_fields[page_num] = []

        # Check for duplicate field names on this page
        existing_field = next((f for f in user_session.page_fields[page_num] if f['name'] == field_name), None)
        if existing_field:
            return jsonify({'success': False, 'error': f'Field "{field_name}" already exists on page {page_num}'})

        # Add the field
        field_data = {
            'name': field_name,
            'coordinates': coordinates,
            'text': text,
            'page': page_num,
            'created_at': datetime.now().isoformat()
        }

        user_session.page_fields[page_num].append(field_data)

        return jsonify({
            'success': True,
            'message': f'Field "{field_name}" added successfully',
            'field': field_data,
            'total_fields_on_page': len(user_session.page_fields[page_num])
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/get_fields/<int:page_num>')
def get_fields(page_num):
    """Get all fields for a specific page"""
    try:
        user_session = get_user_session()

        fields = user_session.page_fields.get(page_num, [])

        return jsonify({
            'success': True,
            'page_num': page_num,
            'fields': fields,
            'count': len(fields)
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/get_all_fields')
def get_all_fields():
    """Get all fields across all pages for the current user"""
    try:
        user_session = get_user_session()

        total_fields = sum(len(fields) for fields in user_session.page_fields.values())
        pages_with_fields = len(user_session.page_fields)

        # Convert integer keys to strings for JSON serialization
        page_fields_str_keys = {}
        for page_num, fields in user_session.page_fields.items():
            page_fields_str_keys[str(page_num)] = fields

        return jsonify({
            'success': True,
            'page_fields': page_fields_str_keys,
            'summary': {
                'total_fields': total_fields,
                'pages_with_fields': pages_with_fields,
                'fields_per_page': {str(page): len(fields) for page, fields in user_session.page_fields.items()}
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/delete_field', methods=['POST'])
def delete_field():
    """Delete a specific field"""
    try:
        user_session = get_user_session()
        data = request.get_json()

        page_num = int(data.get('page_num'))
        field_index = int(data.get('field_index'))

        if page_num not in user_session.page_fields:
            return jsonify({'success': False, 'error': f'No fields found for page {page_num}'})

        fields = user_session.page_fields[page_num]

        if field_index < 0 or field_index >= len(fields):
            return jsonify({'success': False, 'error': 'Invalid field index'})

        deleted_field = fields.pop(field_index)

        # Remove page entry if no fields left
        if len(fields) == 0:
            del user_session.page_fields[page_num]

        return jsonify({
            'success': True,
            'message': f'Field "{deleted_field["name"]}" deleted successfully',
            'deleted_field': deleted_field
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/clear_all_fields', methods=['POST'])
def clear_all_fields():
    """Clear all fields for the current user"""
    try:
        user_session = get_user_session()

        total_fields = sum(len(fields) for fields in user_session.page_fields.values())
        user_session.page_fields.clear()

        return jsonify({
            'success': True,
            'message': f'Cleared {total_fields} fields from all pages'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/export_fields_json', methods=['POST'])
def export_fields_json():
    """Export all fields as JSON file"""
    try:
        user_session = get_user_session()

        if not user_session.page_fields:
            return jsonify({'success': False, 'error': 'No fields to export'})

        # Get current PDF info
        current_pdf = list(user_session.pdfs.keys())[-1] if user_session.pdfs else 'unknown.pdf'
        pdf_data = user_session.pdfs.get(current_pdf, {})

        # Create export data
        export_data = {
            'pdf_name': current_pdf,
            'total_pages': pdf_data.get('page_count', 0),
            'export_date': datetime.now().isoformat(),
            'session_id': user_session.session_id[:8] + '...',  # Partial for privacy
            'fields_by_page': {}
        }

        # Add fields organized by page
        for page_num, fields in user_session.page_fields.items():
            export_data['fields_by_page'][str(page_num)] = fields

        # Create summary
        total_fields = sum(len(fields) for fields in user_session.page_fields.values())
        export_data['summary'] = {
            'total_fields': total_fields,
            'pages_with_fields': len(user_session.page_fields),
            'fields_per_page': {str(page): len(fields) for page, fields in user_session.page_fields.items()}
        }

        # Create temporary file for download
        export_filename = f"{current_pdf.replace('.pdf', '')}_fields_export.json"
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
            temp_path = f.name

        user_session.temp_files.append(temp_path)

        return send_file(temp_path, as_attachment=True, download_name=export_filename)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/get_session_info')
def get_session_info():
    """Get information about current user session including field stats"""
    try:
        user_session = get_user_session()

        total_fields = sum(len(fields) for fields in user_session.page_fields.values())

        return jsonify({
            'success': True,
            'session_id': user_session.session_id[:8] + '...',
            'created_at': user_session.created_at.isoformat(),
            'last_accessed': user_session.last_accessed.isoformat(),
            'pdfs_loaded': len(user_session.pdfs),
            'images_cached': len(user_session.image_cache),
            'text_cached': len(user_session.text_cache),
            'temp_files': len(user_session.temp_files),
            'fields_stats': {
                'total_fields': total_fields,
                'pages_with_fields': len(user_session.page_fields),
                'fields_per_page': {str(page): len(fields) for page, fields in user_session.page_fields.items()}
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/clear_session', methods=['POST'])
def clear_session():
    """Clear current user's session data including fields"""
    try:
        user_session = get_user_session()

        # Count items before clearing
        pdfs_cleared = len(user_session.pdfs)
        cache_cleared = len(user_session.image_cache) + len(user_session.text_cache)
        fields_cleared = sum(len(fields) for fields in user_session.page_fields.values())

        # Clean up resources
        user_session.cleanup()

        return jsonify({
            'success': True,
            'message': f'Cleared {pdfs_cleared} PDFs, {cache_cleared} cached items, and {fields_cleared} fields from your session'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/admin/stats')
def admin_stats():
    """Admin endpoint to view system statistics including field usage"""
    with sessions_lock:
        total_sessions = len(user_sessions)
        active_sessions = sum(1 for s in user_sessions.values() if not s.is_expired())
        total_pdfs = sum(len(s.pdfs) for s in user_sessions.values())
        total_cache_items = sum(len(s.image_cache) + len(s.text_cache) for s in user_sessions.values())
        total_fields = sum(sum(len(fields) for fields in s.page_fields.values()) for s in user_sessions.values())

        return jsonify({
            'total_sessions': total_sessions,
            'active_sessions': active_sessions,
            'expired_sessions': total_sessions - active_sessions,
            'total_pdfs_loaded': total_pdfs,
            'total_cache_items': total_cache_items,
            'total_fields_created': total_fields,
            'cleanup_interval_seconds': CLEANUP_INTERVAL,
            'max_session_age_seconds': MAX_SESSION_AGE
        })


if __name__ == '__main__':
    print("Multi-user PDF processor with Field Management starting...")
    print("Features: Session isolation, Field management, JSON export")
    print("http://localhost:5000")

    app.run(debug=True, host='0.0.0.0', port=5000)