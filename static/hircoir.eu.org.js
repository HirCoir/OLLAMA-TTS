let currentChatFile = null;
let conversationHistory = [];
let currentAudio = null;
let currentEventSource = null;
let lastAssistantMessage = null;
let abortController = null;
let selectedOllamaModel = 'llama3.2:1b';
let selectedTtsModel = 'Yiseni';
let editingMessageIndex = null;
let renamingChatFile = null;

function escapeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

function renderMarkdown(text) {
    let html = text
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/^\* (.*$)/gm, '<li>$1</li>')
        .replace(/^\d\. (.*$)/gm, '<li>$1</li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    return `<p>${html}</p>`;
}

function addMessage(text, isUser = true, messageIndex = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'user-message' : 'assistant-message'} p-4 rounded-lg`;
    messageDiv.dataset.index = messageIndex !== null ? messageIndex : conversationHistory.length;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'markdown-content';
    contentDiv.innerHTML = renderMarkdown(text);

    messageDiv.appendChild(contentDiv);
    document.getElementById('chatArea').appendChild(messageDiv);
    scrollToBottom();

    // Add context menu event listener
    messageDiv.addEventListener('contextmenu', showContextMenu);

    return messageDiv;
}

function scrollToBottom() {
    const chatArea = document.getElementById('chatArea');
    chatArea.scrollTop = chatArea.scrollHeight;
}

function loadChat(chatFile) {
    fetch(`/api/load_chat/${chatFile}`)
        .then(response => response.json())
        .then(data => {
            currentChatFile = chatFile;
            conversationHistory = data.messages;
            document.getElementById('chatArea').innerHTML = '';
            conversationHistory.forEach((message, index) => {
                addMessage(message.content, message.role === 'user', index);
            });
        });
}

function showContextMenu(e) {
    e.preventDefault();
    const contextMenu = document.getElementById('contextMenu');
    const messageDiv = e.currentTarget;

    // Store the message index for editing
    editingMessageIndex = parseInt(messageDiv.dataset.index);

    // Position the context menu
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.style.display = 'block';
}

function hideContextMenu() {
    document.getElementById('contextMenu').style.display = 'none';
}

function showEditModal(content) {
    const modal = document.getElementById('editModal');
    const input = document.getElementById('editMessageInput');
    input.value = content;
    modal.style.display = 'block';
}

function hideEditModal() {
    document.getElementById('editModal').style.display = 'none';
    editingMessageIndex = null;
}

function showRenameModal(chatFile) {
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('renameChatInput');
    input.value = chatFile.replace('.json', '');
    modal.style.display = 'block';
    renamingChatFile = chatFile;
}

function hideRenameModal() {
    document.getElementById('renameModal').style.display = 'none';
    renamingChatFile = null;
}

async function saveEditedMessage() {
    const newContent = document.getElementById('editMessageInput').value;
    const isUserMessage = conversationHistory[editingMessageIndex].role === 'user';

    try {
        const response = await fetch('/api/update_message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_file: currentChatFile,
                message_index: editingMessageIndex,
                content: newContent,
                is_user: isUserMessage
            })
        });

        // Close the modal immediately after sending the request
        hideEditModal();

        const data = await response.json();
        if (data.success) {
            // Update conversation history and UI
            conversationHistory = data.messages;
            document.getElementById('chatArea').innerHTML = '';
            conversationHistory.forEach((message, index) => {
                addMessage(message.content, message.role === 'user', index);
            });

            // If it was a user message, regenerate the response
            if (isUserMessage) {
                await sendMessage(false);
            }
        }
    } catch (error) {
        console.error('Error saving edited message:', error);
        alert('Failed to save the edited message');
    }
}

async function saveRenamedChat() {
    const newChatName = document.getElementById('renameChatInput').value;
    const newChatFile = newChatName.endsWith('.json') ? newChatName : `${newChatName}.json`;

    try {
        const response = await fetch('/api/rename_chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                old_chat_file: renamingChatFile,
                new_chat_file: newChatFile
            })
        });

        const data = await response.json();
        if (data.success) {
            // Update the chat list
            loadChat(newChatFile);
            location.reload();
        }
    } catch (error) {
        console.error('Error renaming chat:', error);
        alert('Failed to rename the chat');
    }

    hideRenameModal();
}

function disableUI() {
    document.getElementById('sendBtn').disabled = true;
    document.getElementById('newChatBtn').disabled = true;
    document.getElementById('listModelsBtn').disabled = true;
    document.getElementById('sidebar').classList.add('disabled');
    document.getElementById('chatsList').classList.add('disabled');
    document.getElementById('stopBtn').style.display = 'block';
}

function enableUI() {
    document.getElementById('sendBtn').disabled = false;
    document.getElementById('newChatBtn').disabled = false;
    document.getElementById('listModelsBtn').disabled = false;
    document.getElementById('sidebar').classList.remove('disabled');
    document.getElementById('chatsList').classList.remove('disabled');
    document.getElementById('stopBtn').style.display = 'none';
}

async function sendMessage(addUserMessage = true) {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    if (!text && addUserMessage) return;

    const model = document.getElementById('ollamaModel').value;
    if (!model) {
        alert('Please select a model first');
        return;
    }

    if (addUserMessage) {
        // Add user message
        addMessage(text, true);
        messageInput.value = '';

        // Add to conversation history
        conversationHistory.push({ role: 'user', content: text });
    }

    // Stop any existing EventSource
    if (currentEventSource) {
        currentEventSource.close();
    }

    const baseHost = document.getElementById('baseHost').value;

    // Create a new AbortController
    abortController = new AbortController();

    // Disable UI
    disableUI();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                base_host: baseHost,
                model: model,
                messages: conversationHistory,
                chat_file: currentChatFile || ''
            }),
            signal: abortController.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = addMessage('', false);
        let completeResponse = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.error) {
                            alert(data.error);
                            break;
                        } else if (data.chunk) {
                            completeResponse = data.chunk;
                            assistantMessage.querySelector('.markdown-content').innerHTML = renderMarkdown(completeResponse);
                            scrollToBottom();
                        } else if (data.done) {
                            lastAssistantMessage = completeResponse;
                            conversationHistory.push({ role: 'assistant', content: completeResponse });

                            // Convert to speech
                            const ttsModel = document.getElementById('ttsModel').value;
                            if (ttsModel) {
                                convertToSpeech(completeResponse, ttsModel);
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Fetch aborted');
        } else {
            console.error('Error:', error);
            alert('Error sending message: ' + error.message);
        }
    } finally {
        // Enable UI
        enableUI();
    }
}

function convertToSpeech(text, model) {
    const removeMarkdown = document.getElementById('removeMarkdown').checked;

    fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model, remove_markdown: removeMarkdown })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            if (currentAudio) {
                currentAudio.pause();
            }
            currentAudio = new Audio(`/audio/${data.audio_file}`);
            currentAudio.volume = document.getElementById('volumeSlider').value / 100;
            currentAudio.play();
        }
    });
}

// Event Listeners
document.getElementById('sendBtn').addEventListener('click', () => sendMessage(true));
document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(true);
    }
});

document.getElementById('stopBtn').addEventListener('click', () => {
    if (abortController) {
        abortController.abort();
    }
});

document.getElementById('newChatBtn').addEventListener('click', () => {
    currentChatFile = null;
    conversationHistory = [];
    document.getElementById('chatArea').innerHTML = '';
    // Restore selected models
    document.getElementById('ollamaModel').value = selectedOllamaModel;
    document.getElementById('ttsModel').value = selectedTtsModel;
});

document.getElementById('listModelsBtn').addEventListener('click', () => {
    const baseHost = document.getElementById('baseHost').value;
    fetch(`/api/list_ollama_models?base_host=${encodeURIComponent(baseHost)}`)
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('ollamaModel');
            select.innerHTML = '<option value="">Select Ollama Model</option>';
            data.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                select.appendChild(option);
            });
        });
});

document.getElementById('playBtn').addEventListener('click', () => {
    if (currentAudio) {
        currentAudio.play();
    } else if (lastAssistantMessage) {
        const ttsModel = document.getElementById('ttsModel').value;
        if (ttsModel) {
            convertToSpeech(lastAssistantMessage, ttsModel);
        }
    }
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (currentAudio) {
        currentAudio.pause();
    }
});

document.getElementById('volumeSlider').addEventListener('input', (e) => {
    if (currentAudio) {
        currentAudio.volume = e.target.value / 100;
    }
    saveSettings();
});

document.getElementById('chatsList').addEventListener('click', (e) => {
    const chatFile = e.target.closest('.chat-file')?.dataset.file;
    if (chatFile) {
        loadChat(chatFile);
    }
});

// Store selected models
document.getElementById('ollamaModel').addEventListener('change', (e) => {
    selectedOllamaModel = e.target.value;
    saveSettings();
});

document.getElementById('ttsModel').addEventListener('change', (e) => {
    selectedTtsModel = e.target.value;
    saveSettings();
});

document.getElementById('removeMarkdown').addEventListener('change', () => {
    saveSettings();
});

// Context Menu Event Listeners
document.addEventListener('click', hideContextMenu);
document.getElementById('editMenuItem').addEventListener('click', () => {
    if (editingMessageIndex !== null) {
        const content = conversationHistory[editingMessageIndex].content;
        showEditModal(content);
    }
    hideContextMenu();
});

// Edit Modal Event Listeners
document.querySelector('.close-modal').addEventListener('click', hideEditModal);
document.getElementById('cancelEditBtn').addEventListener('click', hideEditModal);
document.getElementById('saveEditBtn').addEventListener('click', saveEditedMessage);

// Initial load of Ollama models
document.getElementById('listModelsBtn').click();

// Add sidebar toggle functionality
document.getElementById('toggleSidebar').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const sidebarTitle = document.getElementById('sidebarTitle');

    if (sidebar.classList.contains('sidebar-expanded')) {
        sidebar.classList.remove('sidebar-expanded');
        sidebar.classList.add('sidebar-collapsed');
        sidebarTitle.style.display = 'none';
        document.querySelectorAll('.chat-file span').forEach(span => span.style.display = 'none');
    } else {
        sidebar.classList.remove('sidebar-collapsed');
        sidebar.classList.add('sidebar-expanded');
        sidebarTitle.style.display = 'block';
        document.querySelectorAll('.chat-file span').forEach(span => span.style.display = 'inline');
    }
});

// Add responsive sidebar behavior
function handleResize() {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth < 768 && !sidebar.classList.contains('sidebar-collapsed')) {
        sidebar.classList.remove('sidebar-expanded');
        sidebar.classList.add('sidebar-collapsed');
        document.getElementById('sidebarTitle').style.display = 'none';
        document.querySelectorAll('.chat-file span').forEach(span => span.style.display = 'none');
    }
}

window.addEventListener('resize', handleResize);
handleResize(); // Initial check

function saveSettings() {
    const baseHost = document.getElementById('baseHost').value;
    const ollamaModel = document.getElementById('ollamaModel').value;
    const ttsModel = document.getElementById('ttsModel').value;
    const volume = document.getElementById('volumeSlider').value;
    const removeMarkdown = document.getElementById('removeMarkdown').checked;

    fetch('/api/save_settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            base_host: baseHost,
            ollama_model: ollamaModel,
            tts_model: ttsModel,
            volume: volume,
            remove_markdown: removeMarkdown
        })
    });
}

// Add context menu for chat names
document.querySelectorAll('.edit-chat-name').forEach(editIcon => {
    editIcon.addEventListener('click', (e) => {
        const chatFile = e.currentTarget.dataset.file;
        const chatNameSpan = e.currentTarget.previousElementSibling;

        // Create an input field for editing
        const input = document.createElement('input');
        input.type = 'text';
        input.value = chatNameSpan.textContent;
        input.className = 'bg-gray-700 input-focus rounded-lg px-3 py-2 text-sm';

        // Replace the span with the input field
        chatNameSpan.replaceWith(input);
        input.focus();

        // Handle the Enter key press to save the new name
        input.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const newChatName = input.value.trim();
                if (!newChatName) {
                    alert('Chat name cannot be empty');
                    return;
                }

                const newChatFile = newChatName.endsWith('.json') ? newChatName : `${newChatName}.json`;

                try {
                    const response = await fetch('/api/rename_chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            old_chat_file: chatFile,
                            new_chat_file: newChatFile
                        })
                    });

                    const data = await response.json();
                    if (data.success) {
                        // Update the chat list
                        loadChat(newChatFile);
                        location.reload();
                    }
                } catch (error) {
                    console.error('Error renaming chat:', error);
                    alert('Failed to rename the chat');
                }
            }
        });

        // Handle the blur event to revert to the span if not saved
        input.addEventListener('blur', () => {
            const span = document.createElement('span');
            span.className = 'chat-name';
            span.dataset.file = chatFile;
            span.textContent = input.value.trim() || chatNameSpan.textContent;
            input.replaceWith(span);
        });
    });
});

// Add context menu for messages
document.querySelectorAll('.chat-message').forEach(messageDiv => {
    messageDiv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const contextMenu = document.getElementById('contextMenu');

        // Store the message index for editing
        editingMessageIndex = parseInt(messageDiv.dataset.index);

        // Position the context menu
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        contextMenu.style.display = 'block';

        // Show only the edit option
        document.getElementById('editMenuItem').style.display = 'block';
        document.getElementById('renameMenuItem').style.display = 'none';
    });
});