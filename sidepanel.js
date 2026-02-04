// Side panel UI logic

const chatContainer = document.getElementById('chat-container');
const queryInput = document.getElementById('query-input');
const sendBtn = document.getElementById('send-btn');
const includePageCheckbox = document.getElementById('include-page');
const modelSelect = document.getElementById('model-select');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const reconnectBtn = document.getElementById('reconnect-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const tabAutocomplete = document.getElementById('tab-autocomplete');
const tabSuggestions = document.getElementById('tab-suggestions');

let conversationHistory = [];
let isLoading = false;
let availableModels = [];
let selectedModel = null;
let allTabs = [];
let selectedTabIndex = -1;
let currentAtMentionStart = -1;

/**
 * Initialize the side panel
 */
async function init() {
  // Set up event listeners
  sendBtn.addEventListener('click', handleSend);
  queryInput.addEventListener('keydown', handleKeyDown);
  queryInput.addEventListener('input', handleInputChange);
  modelSelect.addEventListener('change', handleModelChange);
  reconnectBtn.addEventListener('click', handleReconnect);
  newChatBtn.addEventListener('click', handleNewChat);

  document.getElementById('lighting-btn').addEventListener('click', function() {
    document.documentElement.classList.toggle('dark');
    
    // Save theme preference
    if (document.documentElement.classList.contains('dark')) {
      localStorage.setItem('theme', 'dark');
    } else {
      localStorage.setItem('theme', 'light');
    }
  });

  // Load saved theme preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  }

  // Load tabs for autocomplete
  await loadTabs();
  setInterval(loadTabs, 10000); // Refresh tabs every 10 seconds

  // Suggestion buttons
  document.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      queryInput.textContent = btn.dataset.query;
      queryInput.focus();
      setCursorPosition(queryInput.textContent.length);
      handleInputChange();
    });
  });

  // Load models
  await loadModels();

  // Check connection status
  checkConnection();
  setInterval(checkConnection, 5000);

  // Load conversation history from storage
  loadHistory();

  // Load saved model selection
  const savedModel = await chrome.storage.local.get('selectedModel');
  if (savedModel.selectedModel && availableModels.some(m => m.name === savedModel.selectedModel)) {
    modelSelect.value = savedModel.selectedModel;
    selectedModel = savedModel.selectedModel;
  }
}

/**
 * Load available models from Ollama
 */
async function loadModels() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getModels' });

    if (response.success && response.models.length > 0) {
      availableModels = response.models;

      // Populate dropdown
      modelSelect.innerHTML = '';

      response.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = `${model.name} (${formatSize(model.size)})`;
        modelSelect.appendChild(option);
      });

      // Select first model by default
      if (!selectedModel && response.models.length > 0) {
        selectedModel = response.models[0].name;
        modelSelect.value = selectedModel;
        await chrome.storage.local.set({ selectedModel });
      }

      modelSelect.disabled = false;
    } else {
      modelSelect.innerHTML = '<option value="">No models found</option>';
      modelSelect.disabled = true;
      addErrorMessage('No Ollama models found. Please install models using: ollama pull <model-name>');
    }
  } catch (error) {
    console.error('Error loading models:', error);
    modelSelect.innerHTML = '<option value="">Error loading models</option>';
    modelSelect.disabled = true;
    addErrorMessage('Failed to load models. Make sure Ollama is running.');
  }
}

/**
 * Handle model selection change
 */
async function handleModelChange() {
  selectedModel = modelSelect.value;
  await chrome.storage.local.set({ selectedModel });
}

/**
 * Format size in bytes to human readable
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * Check connection to Ollama
 */
async function checkConnection() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkConnection' });
    updateConnectionStatus(response.connected);
  } catch (error) {
    updateConnectionStatus(false);
  }
}

/**
 * Update connection status UI
 */
function updateConnectionStatus(connected) {
  if (connected) {
    statusIndicator.className = 'status-indicator connected';
    statusText.textContent = 'Ollama Connected';
  } else {
    statusIndicator.className = 'status-indicator disconnected';
    statusText.textContent = 'Ollama Disconnected';
  }
}

/**
 * Handle manual reconnect button click
 */
async function handleReconnect() {
  // Disable button and show connecting state
  reconnectBtn.disabled = true;
  reconnectBtn.classList.add('connecting');
  statusIndicator.className = 'status-indicator connecting';
  statusText.textContent = 'Reconnecting...';

  try {
    // Check connection
    await checkConnection();

    // Reload models if connected
    const response = await chrome.runtime.sendMessage({ action: 'checkConnection' });
    if (response.connected) {
      await loadModels();
    }
  } catch (error) {
    console.error('Reconnect failed:', error);
  } finally {
    // Re-enable button
    reconnectBtn.disabled = false;
    reconnectBtn.classList.remove('connecting');
  }
}

/**
 * Handle new chat button click
 */
async function handleNewChat() {
  // Clear conversation history
  conversationHistory = [];

  // Clear storage
  await chrome.storage.local.remove('conversationHistory');

  // Clear chat container
  chatContainer.innerHTML = '';

  // Show welcome message
  const welcomeMsg = document.createElement('div');
  welcomeMsg.className = 'welcome-message';
  welcomeMsg.innerHTML = `
    <h2>Welcome to AI Assistant</h2>
    <p>Ask me questions about any topic. Use @tabname to reference specific browser tabs. I'm powered by Ollama running locally on your machine.</p>
    <div class="suggestions">
      <button class="suggestion-btn" data-query='Summarize @"'>Summarize @tabname</button>
      <button class="suggestion-btn" data-query='What are the main points in @"'>What are the main points in @tabname?</button>
      <button class="suggestion-btn" data-query='Explain @"'>Explain @tabname in simple terms</button>
    </div>
  `;
  chatContainer.appendChild(welcomeMsg);

  // Re-attach suggestion button listeners
  welcomeMsg.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      queryInput.textContent = btn.dataset.query;
      queryInput.focus();
      setCursorPosition(queryInput.textContent.length);
      handleInputChange();
    });
  });

  // Clear input
  queryInput.textContent = '';
  handleInputChange();
}

/**
 * Load all tabs for autocomplete
 */
async function loadTabs() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getTabs' });
    if (response.success) {
      allTabs = response.tabs;
    }
  } catch (error) {
    console.error('Error loading tabs:', error);
  }
}

/**
 * Get cursor position in contenteditable div
 */
function getCursorPosition() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return 0;
  
  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(queryInput);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  
  return preCaretRange.toString().length;
}

/**
 * Set cursor position in contenteditable div
 */
function setCursorPosition(pos) {
  const selection = window.getSelection();
  const range = document.createRange();
  
  let currentPos = 0;
  let found = false;
  
  function searchNode(node) {
    if (found) return;
    
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent.length;
      if (currentPos + length >= pos) {
        range.setStart(node, Math.min(pos - currentPos, length));
        range.collapse(true);
        found = true;
        return;
      }
      currentPos += length;
    } else {
      for (let child of node.childNodes) {
        searchNode(child);
        if (found) return;
      }
    }
  }
  
  searchNode(queryInput);
  
  if (found) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Detect @ mention in input and show autocomplete
 */
function detectAtMention() {
  const text = queryInput.textContent;
  const cursorPos = getCursorPosition();

  // Find @ symbol before cursor
  let atPos = -1;
  for (let i = cursorPos - 1; i >= 0; i--) {
    if (text[i] === '@') {
      atPos = i;
      break;
    }
    // Stop at whitespace or newline
    if (text[i] === ' ' || text[i] === '\n') {
      break;
    }
  }

  if (atPos === -1) {
    hideAutocomplete();
    return;
  }

  // Get search term after @
  const searchTerm = text.substring(atPos + 1, cursorPos).toLowerCase();
  currentAtMentionStart = atPos;

  // Filter tabs
  const filtered = allTabs.filter(tab =>
    tab.title.toLowerCase().includes(searchTerm) ||
    tab.url.toLowerCase().includes(searchTerm)
  );

  if (filtered.length === 0) {
    hideAutocomplete();
    return;
  }

  showAutocomplete(filtered);
}

/**
 * Show autocomplete dropdown with filtered tabs
 */
function showAutocomplete(tabs) {
  tabSuggestions.innerHTML = '';
  selectedTabIndex = -1;

  tabs.forEach((tab, index) => {
    const item = document.createElement('div');
    item.className = 'tab-suggestion-item';
    item.dataset.index = index;

    const title = document.createElement('div');
    title.className = 'tab-suggestion-title';
    title.textContent = tab.title || 'Untitled';

    const url = document.createElement('div');
    url.className = 'tab-suggestion-url';
    url.textContent = tab.url;

    item.appendChild(title);
    item.appendChild(url);

    item.addEventListener('click', () => {
      selectedTabIndex = index;
      selectCurrentTab();
    });

    tabSuggestions.appendChild(item);
  });

  tabAutocomplete.style.display = 'block';
}

/**
 * Hide autocomplete dropdown
 */
function hideAutocomplete() {
  tabAutocomplete.style.display = 'none';
  selectedTabIndex = -1;
  currentAtMentionStart = -1;
}

/**
 * Navigate autocomplete with arrow keys
 */
function navigateAutocomplete(direction) {
  const items = tabSuggestions.querySelectorAll('.tab-suggestion-item');
  if (items.length === 0) return;

  // Remove previous selection
  if (selectedTabIndex >= 0 && selectedTabIndex < items.length) {
    items[selectedTabIndex].classList.remove('selected');
  }

  // Update index
  selectedTabIndex += direction;
  if (selectedTabIndex < 0) selectedTabIndex = items.length - 1;
  if (selectedTabIndex >= items.length) selectedTabIndex = 0;

  // Add new selection
  items[selectedTabIndex].classList.add('selected');
  items[selectedTabIndex].scrollIntoView({ block: 'nearest' });
}

/**
 * Select current tab from autocomplete
 */
function selectCurrentTab() {
  const items = tabSuggestions.querySelectorAll('.tab-suggestion-item');
  if (selectedTabIndex < 0 || selectedTabIndex >= items.length) return;

  const selectedItem = items[selectedTabIndex];
  const tabTitle = selectedItem.querySelector('.tab-suggestion-title').textContent;
  const tabUrl = selectedItem.querySelector('.tab-suggestion-url').textContent;

  // Get current text and cursor position
  const text = queryInput.textContent;
  const cursorPos = getCursorPosition();
  
  // Replace @ mention with tag element
  const beforeAt = text.substring(0, currentAtMentionStart);
  const afterCursor = text.substring(cursorPos);
  
  // Create the mention tag
  const mentionTag = document.createElement('span');
  mentionTag.className = 'tab-mention';
  mentionTag.contentEditable = 'false';
  mentionTag.textContent = tabTitle;
  mentionTag.dataset.tabTitle = tabTitle;
  mentionTag.dataset.tabUrl = tabUrl;
  
  // Clear and rebuild content
  queryInput.textContent = '';
  
  if (beforeAt) {
    queryInput.appendChild(document.createTextNode(beforeAt));
  }
  
  queryInput.appendChild(mentionTag);
  queryInput.appendChild(document.createTextNode(' ' + afterCursor));
  
  // Set cursor after the mention tag
  const newCursorPos = beforeAt.length + tabTitle.length + 1;
  setTimeout(() => {
    setCursorPosition(newCursorPos);
    queryInput.focus();
  }, 0);

  hideAutocomplete();
  handleInputChange();
}

/**
 * Parse @mentions from query text
 */
function parseTabMentions() {
  const mentions = [];
  const mentionElements = queryInput.querySelectorAll('.tab-mention');
  
  mentionElements.forEach(element => {
    const tabTitle = element.dataset.tabTitle;
    const tab = allTabs.find(t => t.title === tabTitle);
    if (tab) {
      mentions.push(tab);
    }
  });

  return mentions;
}

/**
 * Get plain text from contenteditable (for sending)
 */
function getPlainText() {
  let text = '';
  
  function extractText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.classList && node.classList.contains('tab-mention')) {
      text += `@"${node.dataset.tabTitle}"`;
    } else {
      for (let child of node.childNodes) {
        extractText(child);
      }
    }
  }
  
  extractText(queryInput);
  return text;
}

/**
 * Handle input changes
 */
function handleInputChange() {
  const hasText = queryInput.textContent.trim().length > 0;
  const hasModel = selectedModel !== null && selectedModel !== '';
  sendBtn.disabled = !hasText || !hasModel || isLoading;

  // Check for @ mention
  detectAtMention();
}

/**
 * Handle keyboard events
 */
function handleKeyDown(e) {
  // Handle autocomplete navigation
  if (tabAutocomplete.style.display !== 'none') {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateAutocomplete(1);
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateAutocomplete(-1);
      return;
    } else if (e.key === 'Tab') {
      e.preventDefault();
      selectCurrentTab();
      return;
    } else if (e.key === 'Enter' && selectedTabIndex >= 0) {
      e.preventDefault();
      selectCurrentTab();
      return;
    } else if (e.key === 'Escape') {
      hideAutocomplete();
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) {
      handleSend();
    }
  }
}

/**
 * Handle send button click
 */
async function handleSend() {
  const query = getPlainText().trim();
  if (!query || isLoading || !selectedModel) return;

  // Parse tab mentions
  const mentionedTabs = parseTabMentions();

  // Clear input
  queryInput.textContent = '';
  handleInputChange();

  // Remove welcome message if present
  const welcomeMsg = document.querySelector('.welcome-message');
  if (welcomeMsg) {
    welcomeMsg.remove();
  }

  // Add user message
  addMessage('user', query);

  // Show loading
  isLoading = true;
  const loadingEl = addLoadingMessage();

  try {
    // Send query to background script
    const response = await chrome.runtime.sendMessage({
      action: 'query',
      data: {
        query,
        model: selectedModel,
        includePageContent: includePageCheckbox.checked,
        mentionedTabs: mentionedTabs.map(t => ({ id: t.id, title: t.title, url: t.url }))
      }
    });

    // Remove loading
    loadingEl.remove();

    if (response.success) {
      addMessage('assistant', response.text);
    } else {
      addErrorMessage(response.error || 'Unknown error occurred');
    }
  } catch (error) {
    loadingEl.remove();
    addErrorMessage(error.message);
  } finally {
    isLoading = false;
    handleInputChange();
  }

  // Save history
  saveHistory();
}

/**
 * Add message to chat
 */
function addMessage(role, text) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'U' : 'AI';

  const content = document.createElement('div');
  content.className = 'message-content';

  const textEl = document.createElement('div');
  textEl.className = 'message-text';
  textEl.textContent = text;

  content.appendChild(textEl);
  messageEl.appendChild(avatar);
  messageEl.appendChild(content);

  chatContainer.appendChild(messageEl);
  scrollToBottom();

  // Add to history
  conversationHistory.push({ role, text, timestamp: Date.now() });
}

/**
 * Add loading message
 */
function addLoadingMessage() {
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-message';
  loadingEl.innerHTML = `
    <span>Thinking</span>
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  chatContainer.appendChild(loadingEl);
  scrollToBottom();
  return loadingEl;
}

/**
 * Add error message
 */
function addErrorMessage(error) {
  const errorEl = document.createElement('div');
  errorEl.className = 'error-message';
  errorEl.textContent = `Error: ${error}`;
  chatContainer.appendChild(errorEl);
  scrollToBottom();
}

/**
 * Scroll to bottom of chat
 */
function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Save conversation history
 */
async function saveHistory() {
  try {
    await chrome.storage.local.set({ conversationHistory });
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

/**
 * Load conversation history
 */
async function loadHistory() {
  try {
    const result = await chrome.storage.local.get('conversationHistory');
    if (result.conversationHistory) {
      conversationHistory = result.conversationHistory;

      // Remove welcome message
      const welcomeMsg = document.querySelector('.welcome-message');
      if (welcomeMsg && conversationHistory.length > 0) {
        welcomeMsg.remove();
      }

      // Display messages
      conversationHistory.forEach(msg => {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${msg.role}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = msg.role === 'user' ? 'U' : 'AI';

        const content = document.createElement('div');
        content.className = 'message-content';

        const textEl = document.createElement('div');
        textEl.className = 'message-text';
        textEl.textContent = msg.text;

        content.appendChild(textEl);
        messageEl.appendChild(avatar);
        messageEl.appendChild(content);

        chatContainer.appendChild(messageEl);
      });

      scrollToBottom();
    }
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

// Initialize on load
init();
