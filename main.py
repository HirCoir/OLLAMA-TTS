import os
import json
import random
import string
import subprocess
import requests
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, Response, stream_with_context, send_from_directory
from bs4 import BeautifulSoup
import markdown
import threading
from queue import Queue
import time

app = Flask(__name__)

# Define directories
file_folder = os.path.dirname(os.path.abspath(__file__))
temp_audio_folder = os.path.join(file_folder, 'temp_audio')
chats_folder = os.path.join(os.path.expanduser('~'), 'Documents', 'OLLAMA-TTS', 'Chats')
model_folder = None
piper_binary_path = os.path.join(file_folder, 'piper', 'piper.exe')
default_settings_path = os.path.join(os.path.expanduser('~'), 'Documents', 'OLLAMA-TTS', 'default.json')

# Create necessary directories
os.makedirs(temp_audio_folder, exist_ok=True)
os.makedirs(chats_folder, exist_ok=True)

# Check default user folder
default_user_folder = os.path.join(os.path.expanduser('~'), 'Documents', 'ONNX-TTS')
alternative_user_folder = os.path.join(os.path.expanduser('~'), 'Documents', 'LLAMA-TTS', 'ONNX-TTS')

if os.path.exists(default_user_folder) and any(f.endswith('.onnx') for f in os.listdir(default_user_folder)):
    model_folder = default_user_folder
elif os.path.exists(alternative_user_folder) and any(f.endswith('.onnx') for f in os.listdir(alternative_user_folder)):
    model_folder = alternative_user_folder

# Global settings
DEFAULT_BASE_HOST = "http://localhost:11434"
SETTINGS = {
    'speaker': 0,
    'noise_scale': 0.667,
    'length_scale': 1.0,
    'noise_w': 0.8,
    'sentence_silence': 0.2
}

def get_available_models():
    if not model_folder:
        return []
    return [os.path.splitext(model)[0] for model in os.listdir(model_folder) if model.endswith('.onnx')]

def get_ollama_models(base_host=DEFAULT_BASE_HOST):
    try:
        response = requests.get(f"{base_host}/api/tags")
        if response.status_code == 200:
            return [model['name'] for model in response.json().get('models', [])]
        return []
    except:
        return []

def load_chat_history(chat_file):
    try:
        with open(os.path.join(chats_folder, chat_file), 'r', encoding='utf-8') as f:
            return json.load(f).get('messages', [])
    except:
        return []

def save_chat(messages, chat_file=None):
    if not messages:
        return None

    if not chat_file:
        timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        chat_file = f'chat-{timestamp}.json'

    filepath = os.path.join(chats_folder, chat_file)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump({
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'messages': messages
        }, f, ensure_ascii=False, indent=2)

    return chat_file

def remove_markdown(text):
    html_content = markdown.markdown(text)
    soup = BeautifulSoup(html_content, 'html.parser')
    return soup.get_text().strip()

def convert_to_speech(text, model_name, remove_md=False):
    if model_name not in get_available_models():
        return None

    if remove_md:
        text = remove_markdown(text)

    random_name = ''.join(random.choices(string.ascii_letters + string.digits, k=8)) + '.wav'
    output_file = os.path.join(temp_audio_folder, random_name)

    # Clean old audio files
    for file in os.listdir(temp_audio_folder):
        if file.endswith('.wav'):
            os.remove(os.path.join(temp_audio_folder, file))

    model_path = os.path.join(model_folder, model_name + '.onnx')

    # Create temporary text file
    temp_txt_path = os.path.join(os.getenv('TEMP'), "temp_text.txt")
    with open(temp_txt_path, "w", encoding="utf-8") as f:
        f.write(text)

    try:
        command = (f'type "{temp_txt_path}" | "{piper_binary_path}" -m "{model_path}" -f "{output_file}" '
                  f'--speaker {SETTINGS["speaker"]} --noise_scale {SETTINGS["noise_scale"]} '
                  f'--length_scale {SETTINGS["length_scale"]} --noise_w {SETTINGS["noise_w"]} '
                  f'--sentence_silence {SETTINGS["sentence_silence"]}')

        subprocess.run(command, shell=True, check=True)
        os.remove(temp_txt_path)

        if os.path.exists(output_file):
            return output_file
    except:
        pass
    finally:
        if os.path.exists(temp_txt_path):
            os.remove(temp_txt_path)

    return None

def set_default_models():
    tts_models = get_available_models()
    ollama_models = get_ollama_models()

    default_tts_model = "RecomendacionesConMiau" if "RecomendacionesConMiau" in tts_models else None
    default_ollama_model = "llama3.2:1b" if "llama3.2:1b" in ollama_models else None

    return default_tts_model, default_ollama_model

def load_default_settings():
    if os.path.exists(default_settings_path):
        with open(default_settings_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_default_settings(settings):
    with open(default_settings_path, 'w', encoding='utf-8') as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)

@app.route('/')
def index():
    tts_models = get_available_models()
    chat_files = sorted([f for f in os.listdir(chats_folder) if f.endswith('.json')], reverse=True)
    default_tts_model, default_ollama_model = set_default_models()
    default_settings = load_default_settings()
    return render_template('index.html', tts_models=tts_models, chat_files=chat_files, default_tts_model=default_tts_model, default_ollama_model=default_ollama_model, default_settings=default_settings)

@app.route('/api/list_ollama_models')
def list_ollama_models():
    base_host = request.args.get('base_host', DEFAULT_BASE_HOST)
    return jsonify(models=get_ollama_models(base_host))

@app.route('/api/load_chat/<chat_file>')
def load_chat(chat_file):
    messages = load_chat_history(chat_file)
    return jsonify(messages=messages)

@app.route('/api/update_message', methods=['POST'])
def update_message():
    data = request.json
    chat_file = data.get('chat_file')
    message_index = data.get('message_index')
    new_content = data.get('content')
    is_user = data.get('is_user', False)

    if not chat_file or message_index is None or not new_content:
        return jsonify(error="Missing required parameters"), 400

    messages = load_chat_history(chat_file)
    if message_index >= len(messages):
        return jsonify(error="Invalid message index"), 400

    # Update the message content
    messages[message_index]['content'] = new_content

    # If it's a user message, regenerate all subsequent responses
    if is_user:
        # Keep messages up to and including the edited message
        messages = messages[:message_index + 1]

    # Save the updated chat
    save_chat(messages, chat_file)

    return jsonify(success=True, messages=messages)

@app.route('/api/rename_chat', methods=['POST'])
def rename_chat():
    data = request.json
    old_chat_file = data.get('old_chat_file')
    new_chat_file = data.get('new_chat_file')

    if not old_chat_file or not new_chat_file:
        return jsonify(error="Missing required parameters"), 400

    old_path = os.path.join(chats_folder, old_chat_file)
    new_path = os.path.join(chats_folder, new_chat_file)

    if os.path.exists(old_path):
        os.rename(old_path, new_path)
        return jsonify(success=True)
    else:
        return jsonify(error="Chat file not found"), 404

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    base_host = data.get('base_host', DEFAULT_BASE_HOST)
    model = data.get('model')
    messages = data.get('messages', [])
    chat_file = data.get('chat_file')

    def generate():
        queue = Queue()
        thread = threading.Thread(
            target=stream_ollama_response,
            args=(base_host, model, messages, queue)
        )
        thread.start()

        complete_response = ""
        while True:
            msg_type, content = queue.get()
            if msg_type == "error":
                yield f"data: {json.dumps({'error': content})}\n\n"
                break
            elif msg_type == "chunk":
                complete_response = content
                yield f"data: {json.dumps({'chunk': content})}\n\n"
            elif msg_type == "done":
                # Save chat history
                messages.append({"role": "assistant", "content": complete_response})
                save_chat(messages, chat_file)
                yield f"data: {json.dumps({'done': complete_response})}\n\n"
                break

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

def stream_ollama_response(base_host, model, messages, queue):
    url = f"{base_host}/api/chat"
    data = {
        "model": model,
        "messages": messages,
        "stream": True
    }

    try:
        with requests.post(url, json=data, stream=True) as response:
            if response.status_code == 200:
                complete_response = ""
                for line in response.iter_lines():
                    if line:
                        try:
                            json_response = json.loads(line)
                            chunk = json_response.get("message", {}).get("content", "")
                            if chunk:
                                complete_response += chunk
                                queue.put(("chunk", complete_response))
                        except json.JSONDecodeError:
                            continue
                queue.put(("done", complete_response))
            else:
                queue.put(("error", f"Error: {response.status_code}"))
    except Exception as e:
        queue.put(("error", f"Error: {str(e)}"))

@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    data = request.json
    text = data.get('text', '')
    model = data.get('model')
    remove_md = data.get('remove_markdown', False)

    if not text or not model:
        return jsonify(error="Missing text or model"), 400

    audio_file = convert_to_speech(text, model, remove_md)
    if not audio_file:
        return jsonify(error="Failed to convert text to speech"), 500

    return jsonify(audio_file=os.path.basename(audio_file))

@app.route('/audio/<filename>')
def serve_audio(filename):
    return send_file(os.path.join(temp_audio_folder, filename))

@app.route('/api/save_settings', methods=['POST'])
def save_settings():
    data = request.json
    base_host = data.get('base_host')
    ollama_model = data.get('ollama_model')
    tts_model = data.get('tts_model')
    volume = data.get('volume')
    remove_markdown = data.get('remove_markdown')

    settings = {
        'base_host': base_host,
        'ollama_model': ollama_model,
        'tts_model': tts_model,
        'volume': volume,
        'remove_markdown': remove_markdown
    }

    save_default_settings(settings)
    return jsonify(success=True)

# Route to serve favicon.ico
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico', mimetype='image/vnd.microsoft.icon')

# Route to serve tailwind.min.css
@app.route('/tailwind.min.css')
def tailwind():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'tailwind.min.css', mimetype='text/css')

# Route to serve all.min.css
@app.route('/all.min.css')
def all_css():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'all.min.css', mimetype='text/css')

@app.route('/hircoir.eu.org.css')
def css_custom():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'hircoir.eu.org.css', mimetype='text/css')
    
@app.route('/hircoir.eu.org.js')
def js_custom():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'hircoir.eu.org.js', mimetype='')

# Route to serve webfonts
@app.route('/webfonts/<path:filename>')
def serve_webfonts(filename):
    return send_from_directory(os.path.join(app.root_path, 'static', 'webfonts'), filename)
if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')
