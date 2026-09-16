let config = null;

// Load config on startup
async function loadConfig() {
  config = await window.electronAPI.getConfig();

  // Apply settings to UI
  if (config.openaiApiKey) {
    document.getElementById('apiKey').value = config.openaiApiKey;
  }
  if (config.geminiApiKey) {
    document.getElementById('geminiApiKey').value = config.geminiApiKey;
  }

  const provider = config.aiProvider || 'openai';
  document.getElementById('aiProvider').value = provider;
  toggleApiKeyFields(provider);

  document.getElementById('screenshotProtection').checked = config.overlaySettings.screenshotProtection;
  document.getElementById('preventFocusSteal').checked = config.overlaySettings.preventFocusSteal;

  // Default to true if undefined
  const secureInputEnabled = config.overlaySettings.secureInput !== false;
  document.getElementById('secureInput').checked = secureInputEnabled;

  // Apply initial state
  window.electronAPI.toggleSecureInput(secureInputEnabled);
}

function toggleApiKeyFields(provider) {
  const openaiGroup = document.getElementById('openaiKeyGroup');
  const geminiGroup = document.getElementById('geminiKeyGroup');

  if (provider === 'openai') {
    openaiGroup.style.display = 'block';
    geminiGroup.style.display = 'none';
  } else {
    openaiGroup.style.display = 'none';
    geminiGroup.style.display = 'block';
  }
}

document.getElementById('aiProvider').addEventListener('change', (e) => {
  toggleApiKeyFields(e.target.value);
});

// Initialize
loadConfig();

// 🤫 LOG SUPPRESSION (Renderer Stealth)
// Prevent DevTools console logging in production
if (true) { // Always enable for 10/10 stealth
  const noop = () => { };
  console.log = noop;
  console.warn = noop;
  console.error = noop;
}

// Button event listeners
document.getElementById('minimizeBtn').addEventListener('click', () => {
  window.electronAPI.minimizeWindow();
});

document.getElementById('closeBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to quit InvisAI?')) {
    window.electronAPI.quitApp();
  }
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  const panel = document.getElementById('settingsPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  config.openaiApiKey = document.getElementById('apiKey').value;
  config.geminiApiKey = document.getElementById('geminiApiKey').value;
  config.aiProvider = document.getElementById('aiProvider').value;
  config.overlaySettings.screenshotProtection = document.getElementById('screenshotProtection').checked;
  config.overlaySettings.preventFocusSteal = document.getElementById('preventFocusSteal').checked;
  config.overlaySettings.secureInput = document.getElementById('secureInput').checked;

  // Apply secure input immediately
  window.electronAPI.toggleSecureInput(config.overlaySettings.secureInput);

  await window.electronAPI.saveConfig(config);

  document.getElementById('settingsPanel').style.display = 'none';

  showNotification('Settings saved successfully!');
});

document.getElementById('cancelSettingsBtn').addEventListener('click', () => {
  document.getElementById('settingsPanel').style.display = 'none';
  loadConfig(); // Reset to saved config
});

// Message input
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    sendMessage();
  }

  // Auto-resize textarea
  messageInput.style.height = 'auto';
  messageInput.style.height = messageInput.scrollHeight + 'px';
});

sendBtn.addEventListener('click', sendMessage);

// Chat History Storage
let chatHistory = [];
const MAX_HISTORY = 20; // Keep last 20 messages to manage context window

async function sendMessage() {
  const message = messageInput.value.trim();

  if (!message) return;

  if (config.aiProvider === 'gemini') {
    if (!config.geminiApiKey) {
      showNotification('Please configure your Gemini API key in settings first!');
      document.getElementById('settingsPanel').style.display = 'block';
      return;
    }
  } else {
    if (!config.openaiApiKey) {
      showNotification('Please configure your OpenAI API key in settings first!');
      document.getElementById('settingsPanel').style.display = 'block';
      return;
    }
  }

  // Clear input
  messageInput.value = '';
  messageInput.style.height = 'auto';

  // Remove welcome message if present
  const welcomeMsg = document.querySelector('.welcome-message');
  if (welcomeMsg) {
    welcomeMsg.remove();
  }

  // Add user message to UI
  addMessage(message, 'user');

  // Show loading
  const loadingId = addMessage('Thinking...', 'assistant', true);

  try {
    let aiResponse;

    if (config.aiProvider === 'gemini') {
      // Gemini API Call (Multi-turn)
      const model = 'gemini-1.5-flash'; // Optimized for speed/cost
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`;

      // 1. Build Gemini History
      const contents = [];

      // Add history messages
      chatHistory.forEach(msg => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      });

      // 2. Add Current Message
      const currentParts = [{ text: message }];

      if (window.currentScreenshot) {
        const base64Data = window.currentScreenshot.split(',')[1];
        currentParts.push({
          inline_data: {
            mime_type: 'image/png',
            data: base64Data
          }
        });
      }

      contents.push({
        role: 'user',
        parts: currentParts
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || 'Gemini API request failed');
      }

      const data = await response.json();
      aiResponse = data.candidates[0].content.parts[0].text;

    } else {
      // OpenAI API Call (Multi-turn)
      // 1. Start with System Prompt
      const messages = [
        {
          role: 'system',
          content: '' // Write your own system prompt here for the legacy renderer.
        }
      ];

      // 2. Add History
      chatHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });

      // 3. Add Current Message
      if (window.currentScreenshot) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: message },
            { type: 'image_url', image_url: { url: window.currentScreenshot } }
          ]
        });
      } else {
        messages.push({
          role: 'user',
          content: message
        });
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: window.currentScreenshot ? 'gpt-4o' : 'gpt-4',
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      aiResponse = data.choices[0].message.content;
    }

    // Remove loading message
    document.getElementById(loadingId).remove();

    // Add AI response to UI
    const parsedResponse = typeof marked !== 'undefined' ? marked.parse(aiResponse) : aiResponse;
    addMessage(parsedResponse, 'assistant');

    // UPDATE HISTORY
    // Push User Message
    chatHistory.push({ role: 'user', content: message });
    // Push AI Response
    chatHistory.push({ role: 'assistant', content: aiResponse });

    // Prune history if too long
    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(chatHistory.length - MAX_HISTORY);
    }

    // Clear screenshot after analysis
    if (window.currentScreenshot) {
      showNotification('Screenshot analyzed! Cleared from context.');
      window.currentScreenshot = null;
    }

  } catch (error) {
    console.error('Error:', error);
    document.getElementById(loadingId).remove();
    addMessage('Sorry, I encountered an error. Please check your API key and try again.', 'assistant');
  }
}

function addMessage(text, sender, isLoading = false) {
  const chatContainer = document.getElementById('chatContainer');
  const messageDiv = document.createElement('div');
  const messageId = 'msg-' + Date.now();

  messageDiv.id = messageId;
  messageDiv.className = `message ${sender}`;
  messageDiv.innerHTML = `
    <div class="message-avatar">${sender === 'user' ? '👤' : '🤖'}</div>
    <div class="message-content">${text}</div>
  `;

  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  return messageId;
}

function showNotification(text) {
  // Create temporary notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(102, 126, 234, 0.9);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 2000;
    animation: fadeIn 0.3s;
  `;
  notification.textContent = text;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Screenshot capture handler
window.electronAPI.onScreenshotCaptured((dataUrl) => {
  console.log('📸 Screenshot received');

  // Remove welcome message if present
  const welcomeMsg = document.querySelector('.welcome-message');
  if (welcomeMsg) {
    welcomeMsg.remove();
  }

  // Create screenshot message
  const chatContainer = document.getElementById('chatContainer');
  const screenshotDiv = document.createElement('div');
  screenshotDiv.className = 'message assistant screenshot-message';
  screenshotDiv.innerHTML = `
    <div class="message-avatar">📸</div>
    <div class="message-content">
      <div class="screenshot-wrapper">
        <img src="${dataUrl}" class="screenshot-image" alt="Screenshot" />
        <div class="screenshot-actions">
          <button class="screenshot-btn analyze-btn">🤖 Analyze with AI</button>
          <button class="screenshot-btn remove-btn">🗑️ Remove</button>
        </div>
      </div>
      <p class="screenshot-hint">Screenshot captured! You can ask me about this image.</p>
    </div>
  `;

  chatContainer.appendChild(screenshotDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Store current screenshot for AI analysis
  window.currentScreenshot = dataUrl;

  // Add event listeners
  const analyzeBtn = screenshotDiv.querySelector('.analyze-btn');
  const removeBtn = screenshotDiv.querySelector('.remove-btn');

  analyzeBtn.addEventListener('click', () => {
    messageInput.value = 'What do you see in this screenshot?';
    messageInput.focus();
  });

  removeBtn.addEventListener('click', () => {
    screenshotDiv.remove();
    window.currentScreenshot = null;
  });

  showNotification('Screenshot captured! Press Cmd+Enter to analyze');
});
