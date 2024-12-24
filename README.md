# OLLAMA-TTS

OLLAMA-TTS is a web application built with Flask that provides a user-friendly interface for interacting with AI models and converting text to speech. The application allows users to manage chat histories, select different AI and TTS models, and stream responses in real-time.

## Features

- **Chat Interface**: Interact with AI models through a chat interface.
- **Text-to-Speech**: Convert text messages to speech using selected TTS models.
- **Model Selection**: Choose from available AI and TTS models.
- **Chat History**: Save, load, and manage chat histories.
- **Real-time Streaming**: Stream AI responses in real-time.
- **Customizable Settings**: Adjust settings such as volume and markdown removal.

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/HirCoir/OLLAMA-TTS.git
   cd OLLAMA-TTS
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the Application**:
   ```bash
   python main.py
   ```

4. **Access the Application**:
   Open your web browser and navigate to `http://localhost:5000`.

## Usage

1. **Select Models**:
   - Choose an AI model from the dropdown menu.
   - Select a TTS model for converting text to speech.

2. **Start a New Chat**:
   - Click on the "New Chat" button to start a new conversation.
   - Type your message in the input area and click "Send".

3. **Manage Chat History**:
   - Save, load, and rename chat histories from the sidebar.
   - Edit messages by right-clicking on them and selecting "Edit".

4. **Adjust Settings**:
   - Modify settings such as volume and markdown removal from the input area.

5. **Convert Text to Speech**:
   - Click the "Play" button to convert the selected text to speech.
   - Adjust the volume using the slider.

## Directory Structure

- **`temp_audio`**: Temporary directory for storing audio files.
- **`Chats`**: Directory for storing chat histories.
- **`static`**: Directory for static files such as CSS, JavaScript, and fonts.
- **`templates`**: Directory for HTML templates.

## Contributing

Contributions are welcome! Please feel free to submit issues and enhancement requests.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For more information, please contact [HirCoir](https://youtube.com/@hircoir).

## Acknowledgments

- Special thanks to the open-source community for their contributions and support.

---

Made with love by [HirCoir](https://youtube.com/@hircoir).
