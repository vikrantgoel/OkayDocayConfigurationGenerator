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
import zipfile
import requests
from datetime import datetime, timedelta
import atexit

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024
app.config['SECRET_KEY'] = 'your-secret-key-change-this-in-production'

# GitHub Configuration
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN', '')
GITHUB_REPO_OWNER = os.getenv('GITHUB_REPO_OWNER', 'your-username')
GITHUB_REPO_NAME = os.getenv('GITHUB_REPO_NAME', 'pdf-configs')

user_sessions = {}
sessions_lock = threading.Lock()

# Configuration
MAX_SESSION_AGE = 3600
CLEANUP_INTERVAL = 3600


class UserSession:
    """Isolated storage for each user session with simplified field management"""

    def __init__(self, session_id):
        self.session_id = session_id
        self.created_at = datetime.now()
        self.last_accessed = datetime.now()
        self.pdfs = {}
        self.image_cache = {}
        self.text_cache = {}
        self.temp_files = []

        # Simplified field management storage
        self.page_fields = {}

        # Initialize server-side extracted data
        self.extracted_data = {}

    def update_access_time(self):
        self.last_accessed = datetime.now()

    def is_expired(self):
        return (datetime.now() - self.last_accessed).seconds > MAX_SESSION_AGE

    def cleanup(self):
        """Clean up resources when session expires"""
        for pdf_data in self.pdfs.values():
            if 'pdf' in pdf_data:
                pdf_data['pdf'].close()

        for temp_file in self.temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except:
                pass

        self.pdfs.clear()
        self.image_cache.clear()
        self.text_cache.clear()
        self.page_fields.clear()
        self.extracted_data.clear()
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


cleanup_thread = threading.Thread(target=background_cleanup, daemon=True)
cleanup_thread.start()


@atexit.register
def cleanup_on_exit():
    with sessions_lock:
        for user_session in user_sessions.values():
            user_session.cleanup()
    print("Cleaned up all sessions on exit")


os.makedirs('templates', exist_ok=True)


# ================================
# GITHUB INTEGRATION FUNCTIONS
# ================================

def create_github_repo_if_not_exists():
    """Create the GitHub repository if it doesn't exist"""
    if not GITHUB_TOKEN:
        return {'success': False, 'error': 'GitHub token not configured'}

    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    }

    check_url = f'https://api.github.com/repos/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}'
    response = requests.get(check_url, headers=headers)

    if response.status_code == 200:
        return {'success': True, 'message': 'Repository already exists'}
    elif response.status_code == 404:
        create_url = 'https://api.github.com/user/repos'
        repo_data = {
            'name': GITHUB_REPO_NAME,
            'description': 'PDF Configuration Files generated by OkayDocay Enhanced',
            'private': False,
            'auto_init': True
        }

        response = requests.post(create_url, headers=headers, json=repo_data)
        if response.status_code == 201:
            return {'success': True, 'message': 'Repository created successfully'}
        else:
            return {'success': False, 'error': f'Failed to create repository: {response.text}'}
    else:
        return {'success': False, 'error': f'Failed to check repository: {response.text}'}


def upload_to_github(file_path, github_path, commit_message):
    """Upload a file to GitHub repository"""
    if not GITHUB_TOKEN:
        return {'success': False, 'error': 'GitHub token not configured'}

    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    }

    try:
        with open(file_path, 'rb') as f:
            file_content = f.read()

        encoded_content = base64.b64encode(file_content).decode('utf-8')

        check_url = f'https://api.github.com/repos/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}/contents/{github_path}'
        check_response = requests.get(check_url, headers=headers)

        sha = None
        if check_response.status_code == 200:
            sha = check_response.json()['sha']

        upload_data = {
            'message': commit_message,
            'content': encoded_content
        }

        if sha:
            upload_data['sha'] = sha

        response = requests.put(check_url, headers=headers, json=upload_data)

        if response.status_code in [200, 201]:
            result = response.json()
            return {
                'success': True,
                'url': result['content']['html_url'],
                'download_url': result['content']['download_url']
            }
        else:
            return {'success': False, 'error': f'Upload failed: {response.text}'}

    except Exception as e:
        return {'success': False, 'error': f'Error reading file: {str(e)}'}


def upload_zip_to_github(zip_path, pdf_name, generation_type):
    """Upload ZIP file to GitHub with organized folder structure"""
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    clean_pdf_name = pdf_name.replace('.pdf', '').replace(' ', '_')
    github_path = f'configs/{clean_pdf_name}/{timestamp}_{generation_type}.zip'

    commit_message = f'Add {generation_type} configuration for {pdf_name} - {timestamp}'

    return upload_to_github(zip_path, github_path, commit_message)


# ================================
# ROUTES
# ================================

@app.route('/')
def index():
    session_id = get_session_id()
    return render_template('index.html')


@app.route('/github_config', methods=['GET', 'POST'])
def github_config():
    """Get or update GitHub configuration"""
    if request.method == 'GET':
        return jsonify({
            'success': True,
            'github_configured': bool(GITHUB_TOKEN),
            'repo_owner': GITHUB_REPO_OWNER,
            'repo_name': GITHUB_REPO_NAME,
            'repo_url': f'https://github.com/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}' if GITHUB_TOKEN else None
        })

    elif request.method == 'POST':
        data = request.get_json()
        return jsonify({
            'success': True,
            'message': 'GitHub configuration is managed via environment variables'
        })


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

        filename = f"{user_session.session_id}_{str(uuid.uuid4())}.pdf"
        file_path = f"/tmp/{filename}"
        file.save(file_path)
        user_session.temp_files.append(file_path)

        start_time = time.time()

        pdf = pdfplumber.open(file_path)
        page_count = len(pdf.pages)

        first_page = pdf.pages[0]
        sample_words = first_page.extract_words()

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

        user_session.page_fields.clear()

        user_session.extracted_data = {
            'pdf_name': file.filename,
            'total_pages': page_count,
            'created_on': datetime.now().isoformat(),
            'pages': {}
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
            'page_height': first_page.height,
            'session_info': {
                'pdfs_loaded': len(user_session.pdfs),
                'cache_items': len(user_session.image_cache)
            },
            'extracted_data': user_session.extracted_data
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

        base_resolution = 150
        resolution = max(100, int(base_resolution * scale))

        img = page.to_image(resolution=resolution, antialias=True)
        pil_img = img.original

        img_buffer = io.BytesIO()
        pil_img.save(img_buffer, format='PNG', optimize=True, compress_level=6)
        img_buffer.seek(0)
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode()

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

        cropped_page = page.crop((x1, y1, x2, y2))
        text = cropped_page.extract_text()

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


@app.route('/get_extracted_data')
def get_extracted_data():
    """Get current user's extracted data"""
    try:
        user_session = get_user_session()
        return jsonify({
            'success': True,
            'extracted_data': user_session.extracted_data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/update_extracted_data', methods=['POST'])
def update_extracted_data():
    """Update user's extracted data"""
    try:
        user_session = get_user_session()
        data = request.get_json()

        if 'pdf_name' in data:
            user_session.extracted_data['pdf_name'] = data['pdf_name']
        if 'total_pages' in data:
            user_session.extracted_data['total_pages'] = data['total_pages']
        if 'created_on' in data:
            user_session.extracted_data['created_on'] = data['created_on']
        if 'pages' in data:
            user_session.extracted_data['pages'] = data['pages']

        return jsonify({
            'success': True,
            'extracted_data': user_session.extracted_data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/add_field_to_extracted_data', methods=['POST'])
def add_field_to_extracted_data():
    """Add a simplified field to the extracted data structure"""
    try:
        user_session = get_user_session()
        data = request.get_json()

        field_name = data.get('field_name')
        field_type = data.get('field_type', 'text')
        coordinates = data.get('coordinates')
        page_num = int(data.get('page_num'))

        if str(page_num) not in user_session.extracted_data['pages']:
            user_session.extracted_data['pages'][str(page_num)] = {'fields': []}

        # Simplified field data structure - no options for any field type
        field_data = {
            'name': field_name,
            'type': field_type,
            'coordinates': coordinates
        }

        user_session.extracted_data['pages'][str(page_num)]['fields'].append(field_data)

        return jsonify({
            'success': True,
            'extracted_data': user_session.extracted_data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/generate_config_json', methods=['POST'])
def generate_config_json():
    """Generate the final configuration JSON with single validation script and GitHub integration"""
    try:
        user_session = get_user_session()
        data = request.get_json()

        # Get SINGLE validation script
        validation_script = data.get('validation_script', '').strip()
        upload_to_github_flag = data.get('upload_to_github', False)

        # Create the config data
        config_data = {
            'pdf_name': user_session.extracted_data['pdf_name'],
            'total_pages': user_session.extracted_data['total_pages'],
            'created_on': datetime.now().isoformat(),
            'pages': user_session.extracted_data['pages']
        }

        base_name = user_session.extracted_data['pdf_name'].replace('.pdf', '')
        config_filename = f"{base_name}_config_{int(time.time())}.json"

        # Create temporary file for config
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
            config_temp_path = f.name

        user_session.temp_files.append(config_temp_path)

        # Create ZIP file with config and single validation script
        zip_filename = f"{base_name}_complete_package_{int(time.time())}.zip"

        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as zip_temp:
            zip_temp_path = zip_temp.name

        with zipfile.ZipFile(zip_temp_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add config JSON
            zipf.write(config_temp_path, 'config.json')  # Always named config.json

            # Add single validation script if provided
            if validation_script:
                zipf.writestr('validation_script.py', validation_script)

            # Add README
            readme_content = create_package_readme(config_data, validation_script)
            zipf.writestr('README.md', readme_content)

        user_session.temp_files.append(zip_temp_path)

        # Handle GitHub upload if requested
        if upload_to_github_flag and GITHUB_TOKEN:
            try:
                # Ensure repository exists
                repo_result = create_github_repo_if_not_exists()
                if not repo_result['success']:
                    return jsonify({'success': False, 'error': f"GitHub repository setup failed: {repo_result['error']}"})

                # Upload ZIP to GitHub
                upload_result = upload_zip_to_github(zip_temp_path, user_session.extracted_data['pdf_name'], 'simplified_config')

                if upload_result['success']:
                    return jsonify({
                        'success': True,
                        'uploaded_to_github': True,
                        'github_url': upload_result['url'],
                        'download_url': upload_result['download_url'],
                        'repository': f"{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}",
                        'message': f"Simplified configuration package uploaded to GitHub successfully!"
                    })
                else:
                    return jsonify({'success': False, 'error': f"GitHub upload failed: {upload_result['error']}"})

            except Exception as github_error:
                return jsonify({'success': False, 'error': f"GitHub integration error: {str(github_error)}"})

        # Return ZIP file for download
        return send_file(zip_temp_path, as_attachment=True, download_name=zip_filename)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


def create_package_readme(config_data, validation_script):
    """Create a README file for the simplified package with single script"""
    readme = f"""# PDF Configuration Package - Simplified Checkboxes

Generated by OkayDocay Enhanced on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Contents

1. **config.json** - The PDF field configuration with simplified checkboxes
2. **validation_script.py** - Your custom Python validation script
3. **README.md** - This file

## Configuration Details

- **PDF:** {config_data['pdf_name']}
- **Total Pages:** {config_data['total_pages']}

### Field Summary
"""

    # Add field summary
    total_fields = 0
    field_types = {'text': 0, 'signature': 0, 'checkbox': 0}

    for page_data in config_data.get('pages', {}).values():
        for field in page_data.get('fields', []):
            total_fields += 1
            field_type = field.get('type', 'text')
            if field_type in field_types:
                field_types[field_type] += 1

    readme += f"""
- **Total Fields:** {total_fields}
- **Text Fields:** {field_types['text']}
- **Signature Fields:** {field_types['signature']}
- **Checkbox Fields (Simple Tick Boxes):** {field_types['checkbox']}

## Simplified Checkbox Implementation

All checkbox fields are now simple tick boxes with just coordinates - no multiple options.
Each checkbox field represents a single tickable area on the PDF.

## Field Structure

```json
{{
  "name": "field_name",
  "type": "checkbox",
  "coordinates": "x1,y1,x2,y2"
}}
```

## Custom Script Included

"""

    if validation_script:
        readme += """- **validation_script.py** - Your custom validation and processing script

### Script Usage

Run your custom Python script:

```bash
python validation_script.py
```

The script includes combined logic for:
- PDF data processing
- Field coordinate extraction  
- Form template generation
- Validation logic

"""
    else:
        readme += "- No custom script was provided\n"

    readme += """
## Usage

### Using the Configuration JSON

The configuration JSON contains all the field definitions and can be used with any PDF processing system that supports field-based form filling.

### Example Field Access

```python
import json

# Load configuration
with open('config.json', 'r') as f:
    config = json.load(f)

# Access fields by page
for page_num, page_data in config['pages'].items():
    print(f"Page {page_num} fields:")
    for field in page_data['fields']:
        print(f"  - {field['name']} ({field['type']}): {field['coordinates']}")

# Process checkbox fields (simple tick boxes)
for page_num, page_data in config['pages'].items():
    for field in page_data['fields']:
        if field['type'] == 'checkbox':
            coords = field['coordinates'].split(',')
            x1, y1, x2, y2 = map(float, coords)
            print(f"Checkbox '{field['name']}' at ({x1}, {y1}) to ({x2}, {y2})")
```

### Integration with PDF Libraries

```python
# Example with PyPDF2 or similar
import json

def extract_checkbox_values(pdf_path, config_path):
    with open(config_path, 'r') as f:
        config = json.load(f)

    # Extract checkbox states from PDF
    checkbox_values = {}

    for page_num, page_data in config['pages'].items():
        for field in page_data['fields']:
            if field['type'] == 'checkbox':
                # Use coordinates to check if checkbox is ticked
                coords = field['coordinates'].split(',')
                # Your checkbox detection logic here
                checkbox_values[field['name']] = detect_checkbox_state(coords)

    return checkbox_values
```

## Package Structure

```
📦 config_package.zip
├── 📄 config.json              # Field configuration
├── 🐍 validation_script.py     # Your custom script
└── 📖 README.md               # This documentation
```

Generated by OkayDocay Enhanced - PDF Configuration Maker with Simplified Checkboxes
"""

    return readme


@app.route('/reset_session', methods=['POST'])
def reset_session():
    """Reset the current user session for new PDF"""
    try:
        user_session = get_user_session()

        # Close any open PDFs
        for pdf_data in user_session.pdfs.values():
            if 'pdf' in pdf_data:
                pdf_data['pdf'].close()

        # Clear all session data
        user_session.pdfs.clear()
        user_session.image_cache.clear()
        user_session.text_cache.clear()
        user_session.page_fields.clear()
        user_session.extracted_data.clear()

        # Clean up temp files
        for temp_file in user_session.temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except:
                pass
        user_session.temp_files.clear()

        return jsonify({'success': True, 'message': 'Session reset successfully'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    print("🚀 OkayDocay Enhanced with Simplified Checkboxes")
    print("📄 PDF Configuration Maker with Simple Tick Box Fields")
    print("🐙 GitHub Repository Integration")
    print("🌐 http://localhost:5000")
    print("=" * 60)

    if GITHUB_TOKEN:
        print(f"✅ GitHub configured: {GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}")
    else:
        print("⚠️  GitHub not configured - set GITHUB_TOKEN environment variable")
        print("   Set these environment variables to enable GitHub integration:")
        print("   export GITHUB_TOKEN='your_github_token'")
        print("   export GITHUB_REPO_OWNER='your_username'")
        print("   export GITHUB_REPO_NAME='pdf-configs'")

    print("=" * 60)

    app.run(debug=True, host='0.0.0.0', port=5000)