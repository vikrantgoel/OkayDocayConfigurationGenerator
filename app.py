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
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN', '')  # Set this in your environment
GITHUB_REPO_OWNER = os.getenv('GITHUB_REPO_OWNER', 'your-username')  # Your GitHub username
GITHUB_REPO_NAME = os.getenv('GITHUB_REPO_NAME', 'pdf-configs')  # Your repository name


user_sessions = {}
sessions_lock = threading.Lock()

# Configuration
MAX_SESSION_AGE = 3600
CLEANUP_INTERVAL = 3600


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

        # Initialize server-side extracted data
        self.extracted_data = {}

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

    # Check if repo exists
    check_url = f'https://api.github.com/repos/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}'
    response = requests.get(check_url, headers=headers)

    if response.status_code == 200:
        return {'success': True, 'message': 'Repository already exists'}
    elif response.status_code == 404:
        # Create repository
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


def upload_to_github(file_path, github_path, commit_message, content_type='file'):
    """Upload a file to GitHub repository"""
    if not GITHUB_TOKEN:
        return {'success': False, 'error': 'GitHub token not configured'}

    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    }

    # Read file content
    try:
        with open(file_path, 'rb') as f:
            file_content = f.read()

        # Encode content as base64
        encoded_content = base64.b64encode(file_content).decode('utf-8')

        # Check if file already exists to get SHA
        check_url = f'https://api.github.com/repos/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}/contents/{github_path}'
        check_response = requests.get(check_url, headers=headers)

        sha = None
        if check_response.status_code == 200:
            sha = check_response.json()['sha']

        # Upload/update file
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
    # Create organized path
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
        # This would be used to update GitHub settings
        # In production, you'd want proper authentication here
        data = request.get_json()

        # For security, we don't allow changing the token via API
        # These would need to be set via environment variables
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

        # Initialize server-side extracted data
        user_session.extracted_data = {
            'pdf_name': file.filename,  # Use original filename
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

        # Update the server-side extracted data
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
    """Add a field to the extracted data structure"""
    try:
        user_session = get_user_session()
        data = request.get_json()

        field_name = data.get('field_name')
        field_type = data.get('field_type', 'text')
        coordinates = data.get('coordinates')
        page_num = int(data.get('page_num'))
        options = data.get('options', [])  # For checkbox fields

        # Initialize page if it doesn't exist
        if str(page_num) not in user_session.extracted_data['pages']:
            user_session.extracted_data['pages'][str(page_num)] = {'fields': []}

        # Add the field
        field_data = {
            'name': field_name,
            'type': field_type
        }

        if field_type == 'checkbox':
            field_data['options'] = options
        else:
            field_data['coordinates'] = coordinates

        user_session.extracted_data['pages'][str(page_num)]['fields'].append(field_data)

        return jsonify({
            'success': True,
            'extracted_data': user_session.extracted_data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/generate_config_json', methods=['POST'])
def generate_config_json():
    """Generate the final configuration JSON with optional script generation and GitHub integration"""
    try:
        user_session = get_user_session()
        data = request.get_json()

        # Get the simple JSON input if provided
        simple_json_input = data.get('simple_json', {})
        generate_script = data.get('generate_script', False)
        upload_to_github_flag = data.get('upload_to_github', False)

        # Create the config data
        config_data = {
            'pdf_name': user_session.extracted_data['pdf_name'],
            'total_pages': user_session.extracted_data['total_pages'],
            'created_on': datetime.now().isoformat(),
            'pages': user_session.extracted_data['pages']
        }

        # If simple JSON provided, transform it and add populated data
        if simple_json_input:
            try:
                # Generate transformation script
                script_code = generate_transformation_script(user_session.extracted_data)

                # Execute the script with the provided simple JSON
                populated_config = execute_transformation_script(script_code, simple_json_input)

                # Merge the populated data with the base config
                config_data['populated_data'] = populated_config
                config_data['source_simple_json'] = simple_json_input
                config_data['data_populated'] = True

            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': f'Error processing simple JSON: {str(e)}'
                })
        else:
            config_data['data_populated'] = False

        # Create config filename
        base_name = user_session.extracted_data['pdf_name'].replace('.pdf', '')
        config_filename = f"{base_name}_config_{int(time.time())}.json"

        # Create temporary file for config
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
            config_temp_path = f.name

        user_session.temp_files.append(config_temp_path)

        # If script generation requested, create script file too
        script_temp_path = None
        script_filename = None

        if generate_script:
            try:
                script_code = generate_transformation_script(user_session.extracted_data)
                complete_script = create_complete_script_file(script_code, user_session.extracted_data)

                script_filename = f"{base_name}_transformer_{int(time.time())}.py"

                with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py', encoding='utf-8') as f:
                    f.write(complete_script)
                    script_temp_path = f.name

                user_session.temp_files.append(script_temp_path)

            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': f'Error generating script: {str(e)}'
                })

        # Create a ZIP file containing both files if script requested
        if generate_script and script_temp_path:
            zip_filename = f"{base_name}_complete_package_{int(time.time())}.zip"

            with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as zip_temp:
                zip_temp_path = zip_temp.name

            with zipfile.ZipFile(zip_temp_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                zipf.write(config_temp_path, config_filename)
                zipf.write(script_temp_path, script_filename)

                # Add README
                readme_content = create_package_readme(config_data, simple_json_input)
                zipf.writestr('README.md', readme_content)

            user_session.temp_files.append(zip_temp_path)

            # Handle GitHub upload if requested
            if upload_to_github_flag and GITHUB_TOKEN:
                try:
                    # Ensure repo exists
                    repo_result = create_github_repo_if_not_exists()
                    if not repo_result['success']:
                        return jsonify({
                            'success': False,
                            'error': f'GitHub setup failed: {repo_result["error"]}'
                        })

                    # Upload to GitHub
                    generation_type = 'populated_package' if simple_json_input else 'config_package'
                    github_result = upload_zip_to_github(
                        zip_temp_path,
                        user_session.extracted_data['pdf_name'],
                        generation_type
                    )

                    if github_result['success']:
                        return jsonify({
                            'success': True,
                            'message': 'Package uploaded to GitHub successfully!',
                            'github_url': github_result['url'],
                            'download_url': github_result['download_url'],
                            'uploaded_to_github': True
                        })
                    else:
                        return jsonify({
                            'success': False,
                            'error': f'GitHub upload failed: {github_result["error"]}'
                        })

                except Exception as e:
                    return jsonify({
                        'success': False,
                        'error': f'GitHub upload error: {str(e)}'
                    })

            # Return ZIP file for download
            return send_file(zip_temp_path, as_attachment=True, download_name=zip_filename)

        else:
            # Handle GitHub upload for config only
            if upload_to_github_flag and GITHUB_TOKEN:
                try:
                    # Ensure repo exists
                    repo_result = create_github_repo_if_not_exists()
                    if not repo_result['success']:
                        return jsonify({
                            'success': False,
                            'error': f'GitHub setup failed: {repo_result["error"]}'
                        })

                    # Upload to GitHub
                    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                    clean_pdf_name = user_session.extracted_data['pdf_name'].replace('.pdf', '').replace(' ', '_')
                    github_path = f'configs/{clean_pdf_name}/{timestamp}_config_only.json'

                    commit_message = f'Add configuration for {user_session.extracted_data["pdf_name"]} - {timestamp}'
                    github_result = upload_to_github(config_temp_path, github_path, commit_message)

                    if github_result['success']:
                        return jsonify({
                            'success': True,
                            'message': 'Configuration uploaded to GitHub successfully!',
                            'github_url': github_result['url'],
                            'download_url': github_result['download_url'],
                            'uploaded_to_github': True
                        })
                    else:
                        return jsonify({
                            'success': False,
                            'error': f'GitHub upload failed: {github_result["error"]}'
                        })

                except Exception as e:
                    return jsonify({
                        'success': False,
                        'error': f'GitHub upload error: {str(e)}'
                    })

            # Just return the config JSON for download
            return send_file(config_temp_path, as_attachment=True, download_name=config_filename)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


def create_package_readme(config_data, simple_json_input):
    """Create a README file for the package"""

    readme = f"""# PDF Configuration Package

Generated by OkayDocay Enhanced on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Contents

1. **Configuration JSON** - The PDF field configuration
2. **Transformer Script** - Python script to convert simple JSON to config format
3. **README.md** - This file

## Configuration Details

- **PDF:** {config_data['pdf_name']}
- **Total Pages:** {config_data['total_pages']}
- **Data Populated:** {'Yes' if config_data.get('data_populated', False) else 'No'}

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
- **Checkbox Fields:** {field_types['checkbox']}

## Usage

### Using the Transformer Script

```bash
# Test the script
python {config_data['pdf_name'].replace('.pdf', '')}_transformer_*.py --test

# Transform your data
python {config_data['pdf_name'].replace('.pdf', '')}_transformer_*.py input.json output_config.json
```

### Simple JSON Format

For text and signature fields:
```json
{{
    "field_name": "value"
}}
```

For checkbox fields:
```json
{{
    "checkbox_group/option_name": true,
    "checkbox_group/other_option": false
}}
```

"""

    if simple_json_input:
        readme += f"""### Example Input Used

```json
{json.dumps(simple_json_input, indent=2)}
```

"""

    readme += """## Integration

The configuration JSON can be used with any PDF processing system that supports field-based form filling. The transformer script makes it easy to convert simple data formats into the required configuration structure.

Generated by OkayDocay Enhanced - PDF Configuration Maker
"""

    return readme


def generate_transformation_script(extracted_data):
    """
    Generate simple transformation script - coordinates are just metadata!
    Focus on field name matching and value assignment only.
    """

    pdf_name = extracted_data.get('pdf_name', 'document.pdf')
    total_pages = extracted_data.get('total_pages', 1)

    script = f'''#!/usr/bin/env python3
"""
Simple PDF Configuration Transformer
Source: {pdf_name}
Pages: {total_pages}

This script transforms simple JSON input to PDF config format by:
1. Matching field names between input and field definitions
2. Copying field definitions and adding values
3. Preserving coordinates and metadata as-is
"""

import json
import sys
from datetime import datetime

# Field definitions from PDF analysis (coordinates are just metadata)
FIELD_DEFINITIONS = {json.dumps(extracted_data, indent=4)}

def transform_simple_to_config(simple_json):
    """
    Transform simple input to config format.
    Coordinates are irrelevant - just match names and copy values.
    """
    result = {{
        'pdf_name': FIELD_DEFINITIONS['pdf_name'],
        'total_pages': FIELD_DEFINITIONS['total_pages'], 
        'processed_on': datetime.now().isoformat(),
        'pages': {{}}
    }}

    # Process each page's field definitions
    for page_num, page_data in FIELD_DEFINITIONS['pages'].items():
        result['pages'][page_num] = {{'fields': []}}

        for field_def in page_data.get('fields', []):
            field_name = field_def['name']
            field_type = field_def.get('type', 'text')

            # Handle different field types
            if field_type == 'checkbox':
                # For checkboxes, look for group/option pattern
                checkbox_options = []
                for input_key, input_value in simple_json.items():
                    if input_key.startswith(field_name + '/') and input_value:
                        option_name = input_key.split('/', 1)[1]
                        checkbox_options.append({{
                            'name': option_name,
                            'checked': True,
                            'coordinates': field_def.get('coordinates', ''),
                            'page': int(page_num)
                        }})

                if checkbox_options:
                    result['pages'][page_num]['fields'].append({{
                        'name': field_name,
                        'type': 'checkbox',
                        'options': checkbox_options
                    }})

            else:
                # Regular fields (text/signature) - simple name matching
                if field_name in simple_json:
                    # Copy the field definition and add the value
                    output_field = field_def.copy()  # Preserves coordinates, type, etc.
                    output_field['value'] = str(simple_json[field_name])
                    result['pages'][page_num]['fields'].append(output_field)

    # Remove empty pages
    result['pages'] = {{page: data for page, data in result['pages'].items() 
                      if data['fields']}}

    return result


def main():
    """Command line interface"""
    if len(sys.argv) < 2:
        print("Usage: python script.py input.json [output.json]")
        print("   or: python script.py --test")
        sys.exit(1)

    if sys.argv[1] == "--test":
        # Generate test data based on field definitions
        test_data = {{}}

        for page_data in FIELD_DEFINITIONS['pages'].values():
            for field_def in page_data.get('fields', []):
                field_name = field_def['name']
                field_type = field_def.get('type', 'text')

                if field_type == 'checkbox':
                    test_data[f"{{field_name}}/option1"] = True
                    test_data[f"{{field_name}}/option2"] = False
                elif field_type == 'signature':
                    test_data[field_name] = "sample_signature_data"
                else:
                    test_data[field_name] = f"sample_{{field_name}}_value"

        print("🧪 Testing with generated sample data:")
        print(json.dumps(test_data, indent=2))
        print("\\n" + "="*60 + "\\n")

        result = transform_simple_to_config(test_data)
        print("📄 Transformed config:")
        print(json.dumps(result, indent=2))

        # Show field mapping summary
        print("\\n" + "="*60)
        print("📊 FIELD MAPPING SUMMARY:")
        for page_num, page_data in result['pages'].items():
            print(f"  Page {{page_num}}: {{len(page_data['fields'])}} fields populated")
            for field in page_data['fields']:
                if 'value' in field:
                    print(f"    ✓ {{field['name']}} = {{field['value']}}")
                elif field['type'] == 'checkbox':
                    checked = [opt['name'] for opt in field.get('options', []) if opt.get('checked')]
                    print(f"    ☑ {{field['name']}} = {{checked}}")

        return

    # Process actual files
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.json', '_config.json')

    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            simple_data = json.load(f)

        print(f"📖 Reading: {{input_file}}")
        config_data = transform_simple_to_config(simple_data)

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)

        # Summary
        total_fields = sum(len(page['fields']) for page in config_data['pages'].values())
        print(f"✅ Transformed {{input_file}} → {{output_file}}")
        print(f"📊 {{total_fields}} fields populated across {{len(config_data['pages'])}} pages")

    except Exception as e:
        print(f"❌ Error: {{e}}")
        sys.exit(1)


if __name__ == "__main__":
    main()
'''

    return script


def analyze_field_patterns(pages):
    """Analyze the field configuration to understand patterns"""
    analysis = {
        'text_fields': [],
        'signature_fields': [],
        'checkbox_groups': {},
        'page_mapping': {}
    }

    for page_num, page_data in pages.items():
        analysis['page_mapping'][page_num] = []

        for field in page_data.get('fields', []):
            field_info = {
                'name': field['name'],
                'page': int(page_num)
            }

            if field.get('coordinates'):
                field_info['coordinates'] = field['coordinates']

            analysis['page_mapping'][page_num].append(field_info)

            # Categorize field types
            if field.get('type') == 'checkbox':
                # Handle checkbox groups
                checkbox_name = field['name']
                if checkbox_name not in analysis['checkbox_groups']:
                    analysis['checkbox_groups'][checkbox_name] = []

                for option in field.get('options', []):
                    analysis['checkbox_groups'][checkbox_name].append({
                        'name': option['name'],
                        'coordinates': option['coordinates'],
                        'page': option['page']
                    })
            elif field.get('type') == 'signature':
                analysis['signature_fields'].append(field_info)
            else:  # text field
                analysis['text_fields'].append(field_info)

    return analysis


def generate_field_processing_logic(analysis):
    """Generate the field processing logic based on analysis"""
    lines = [
        "    # Initialize page structure",
        "    page_structure = {}",
        "    for i in range(1, result['total_pages'] + 1):",
        "        page_structure[i] = {'fields': []}",
        "",
        "    # Process each field type",
        "",
    ]

    # Process text fields
    if analysis['text_fields']:
        lines.append("    # Text Fields Processing")
        for field in analysis['text_fields']:
            lines.extend([
                f"    if '{field['name']}' in simple_json:",
                f"        page_structure[{field['page']}]['fields'].append({{",
                f"            'name': '{field['name']}',",
                f"            'value': simple_json['{field['name']}'],",
                f"            'coordinates': '{field.get('coordinates', '')}',",
                f"            'type': 'text'",
                f"        }})",
                "",
            ])

    # Process signature fields
    if analysis['signature_fields']:
        lines.append("    # Signature Fields Processing")
        for field in analysis['signature_fields']:
            lines.extend([
                f"    if '{field['name']}' in simple_json:",
                f"        page_structure[{field['page']}]['fields'].append({{",
                f"            'name': '{field['name']}',",
                f"            'value': simple_json['{field['name']}'],",
                f"            'coordinates': '{field.get('coordinates', '')}',",
                f"            'type': 'signature'",
                f"        }})",
                "",
            ])

    # Process checkbox groups
    if analysis['checkbox_groups']:
        lines.append("    # Checkbox Groups Processing")
        for group_name, options in analysis['checkbox_groups'].items():
            safe_group_name = group_name.replace('-', '_').replace(' ', '_')
            lines.extend([
                f"    # Checkbox group: {group_name}",
                f"    checkbox_options_{safe_group_name} = []",
            ])

            for option in options:
                lines.extend([
                    f"    if '{group_name}/{option['name']}' in simple_json and simple_json['{group_name}/{option['name']}']:",
                    f"        checkbox_options_{safe_group_name}.append({{",
                    f"            'name': '{option['name']}',",
                    f"            'checked': True,",
                    f"            'coordinates': '{option['coordinates']}',",
                    f"            'page': {option['page']}",
                    f"        }})",
                ])

            # Add the checkbox group to the appropriate page
            first_page = min(opt['page'] for opt in options)
            lines.extend([
                f"    if checkbox_options_{safe_group_name}:",
                f"        page_structure[{first_page}]['fields'].append({{",
                f"            'name': '{group_name}',",
                f"            'type': 'checkbox',",
                f"            'options': checkbox_options_{safe_group_name}",
                f"        }})",
                "",
            ])

    return lines


def execute_transformation_script(script_code, test_json):
    """Safely execute the transformation script with test data"""

    # Create a safe execution environment
    safe_globals = {
        '__builtins__': {
            'len': len,
            'str': str,
            'int': int,
            'float': float,
            'bool': bool,
            'list': list,
            'dict': dict,
            'min': min,
            'max': max,
            'range': range,
        },
        'json': __import__('json'),
        'datetime': __import__('datetime'),
    }

    # Execute the script
    exec(script_code, safe_globals)

    # Get the transformation function
    transform_func = safe_globals.get('transform_simple_to_config')

    if not transform_func:
        raise Exception("Transformation function not found in script")

    # Execute with test data
    result = transform_func(test_json)

    return result


def create_complete_script_file(script_code, extracted_data):
    """Create a complete, standalone Python script file"""

    header = f'''#!/usr/bin/env python3
"""
PDF Configuration Transformer
Generated by OkayDocay Enhanced

This script transforms simple JSON data into the PDF configuration format
required for processing PDF forms.

Configuration: {extracted_data.get('pdf_name', 'Unknown')}
Generated on: {datetime.now().isoformat()}
Total Pages: {extracted_data.get('total_pages', 'Unknown')}
"""

import json
import sys
from datetime import datetime


'''

    footer = '''

def main():
    """Main function for command line usage"""
    if len(sys.argv) < 2:
        print("Usage: python script.py <input_json_file> [output_file]")
        print("   or: python script.py --test")
        sys.exit(1)

    if sys.argv[1] == "--test":
        # Run with test data
        test_data = {
            "example_field": "Test Value",
            "checkbox_group/option1": True,
            "checkbox_group/option2": False,
            "signature_field": "SignatureBase64Data"
        }

        print("Testing with sample data:")
        print(json.dumps(test_data, indent=2))
        print("\\n" + "="*50 + "\\n")

        result = transform_simple_to_config(test_data)
        print("Transformed result:")
        print(json.dumps(result, indent=2))
        return

    # Read input file
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.json', '_config.json')

    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            simple_data = json.load(f)

        # Transform the data
        config_data = transform_simple_to_config(simple_data)

        # Write output
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)

        print(f"Successfully transformed {{input_file}} -> {{output_file}}")

    except Exception as e:
        print(f"Error: {{e}}")
        sys.exit(1)


if __name__ == "__main__":
    main()
'''

    return header + script_code + footer


if __name__ == '__main__':
    print("🚀 OkayDocay Enhanced with GitHub Integration")
    print("📄 PDF Configuration Maker with Transformer Scripts")
    print("🐙 GitHub Repository Integration")
    print("🌐 http://localhost:5000")
    print("=" * 60)

    # Check GitHub configuration
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