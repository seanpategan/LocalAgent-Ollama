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
const darkModeBtn = document.getElementById('dark-mode-btn');
const exportBtn = document.getElementById('export-btn');

let conversationHistory = [];
let isLoading = false;
let availableModels = [];
let selectedModel = null;
let allTabs = [];
let selectedTabIndex = -1;
let currentAtMentionStart = -1;
let activeStreams = {};

/**
 * Render basic markdown to HTML
 */
function renderMarkdown(text) {
  const codeBlocks = [];

  // Extract code blocks to protect them
  let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.trim()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
    return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
  });

  // Escape HTML in remaining text
  processed = processed
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Inline code
  processed = processed.replace(/`([^`\n]+)`/g, (_, code) =>
    `<code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`
  );

  // Bold and italic
  processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  processed = processed.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

  // Headers
  processed = processed.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  processed = processed.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  processed = processed.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Lists
  processed = processed.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  processed = processed.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  processed = processed.replace(/(<li>.*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Line breaks
  processed = processed.replace(/\n/g, '<br>');

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    processed = processed.replace(`\x00CODEBLOCK${i}\x00`, block);
  });

  return processed;
}

/**
 * Render a message element (used by addMessage and loadHistory)
 */
function renderMessage(role, text, timestamp) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'U' : 'AI';

  const content = document.createElement('div');
  content.className = 'message-content';

  const textEl = document.createElement('div');
  textEl.className = 'message-text';

  if (role === 'assistant') {
    textEl.innerHTML = renderMarkdown(text);
  } else {
    textEl.textContent = text;
  }

  content.appendChild(textEl);

  // Footer: timestamp left, copy right
  const footer = document.createElement('div');
  footer.className = 'message-footer';

  const timeEl = document.createElement('div');
  timeEl.className = 'message-timestamp';
  timeEl.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  footer.appendChild(timeEl);

  if (role === 'assistant') {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
          copyBtn.classList.remove('copied');
        }, 2000);
      });
    });
    footer.appendChild(copyBtn);
  }

  content.appendChild(footer);

  messageEl.appendChild(avatar);
  messageEl.appendChild(content);
  chatContainer.appendChild(messageEl);
  scrollToBottom();
  return messageEl;
}

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
  exportBtn.addEventListener('click', exportConversation);

  // Dark mode toggle
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
  darkModeBtn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  });

  // Load tabs for autocomplete
  await loadTabs();
  setInterval(loadTabs, 10000);

  // Suggestion buttons
  document.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      queryInput.value = btn.dataset.query;
      queryInput.focus();
      queryInput.selectionStart = queryInput.selectionEnd = queryInput.value.length;
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
 * Handle streaming messages from background
 */
chrome.runtime.onMessage.addListener((message) => {
  const stream = activeStreams[message.messageId];
  if (!stream) return;

  if (message.action === 'streamChunk') {
    stream.text = message.fullText;
    if (!stream.el) {
      stream.loadingEl.remove();
      stream.el = document.createElement('div');
      stream.el.className = 'message assistant';
      stream.el.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content">
          <div class="message-text streaming"></div>
        </div>`;
      chatContainer.appendChild(stream.el);
    }
    stream.el.querySelector('.message-text').innerHTML =
      renderMarkdown(stream.text) + '<span class="streaming-cursor">▋</span>';
    scrollToBottom();
  }

  if (message.action === 'streamComplete') {
    const finalText = message.text;
    if (stream.el) {
      // Replace streaming element with a proper rendered message
      stream.el.remove();
    } else {
      stream.loadingEl.remove();
    }
    renderMessage('assistant', finalText, Date.now());
    conversationHistory.push({ role: 'assistant', text: finalText, timestamp: Date.now() });
    saveHistory();
    stream.resolve(finalText);
    delete activeStreams[message.messageId];
  }

  if (message.action === 'streamError') {
    stream.loadingEl && stream.loadingEl.remove();
    stream.el && stream.el.remove();
    stream.reject(new Error(message.error));
    delete activeStreams[message.messageId];
  }
});

/**
 * Export conversation as markdown
 */
function exportConversation() {
  if (conversationHistory.length === 0) return;

  let md = '# AI Assistant Conversation\n\n';
  conversationHistory.forEach(msg => {
    const label = msg.role === 'user' ? '**You**' : '**AI**';
    const time = new Date(msg.timestamp).toLocaleString();
    md += `${label} _(${time})_\n\n${msg.text}\n\n---\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conversation-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Load available models from Ollama
 */
async function loadModels() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getModels' });

    if (response.success && response.models.length > 0) {
      availableModels = response.models;

      modelSelect.innerHTML = '';
      response.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = `${model.name} (${formatSize(model.size)})`;
        modelSelect.appendChild(option);
      });

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
  reconnectBtn.disabled = true;
  statusIndicator.className = 'status-indicator connecting';
  statusText.textContent = 'Reconnecting...';

  try {
    await checkConnection();
    const response = await chrome.runtime.sendMessage({ action: 'checkConnection' });
    if (response.connected) {
      await loadModels();
    }
  } catch (error) {
    console.error('Reconnect failed:', error);
  } finally {
    reconnectBtn.disabled = false;
  }
}

/**
 * Handle new chat button click
 */
async function handleNewChat() {
  conversationHistory = [];
  await chrome.storage.local.remove('conversationHistory');
  chatContainer.innerHTML = '';

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

  welcomeMsg.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      queryInput.value = btn.dataset.query;
      queryInput.focus();
      queryInput.selectionStart = queryInput.selectionEnd = queryInput.value.length;
      handleInputChange();
    });
  });

  queryInput.value = '';
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
 * Detect @ mention in input and show autocomplete
 */
function detectAtMention() {
  const text = queryInput.value;
  const cursorPos = queryInput.selectionStart;

  let atPos = -1;
  for (let i = cursorPos - 1; i >= 0; i--) {
    if (text[i] === '@') { atPos = i; break; }
    if (text[i] === ' ' || text[i] === '\n') break;
  }

  if (atPos === -1) { hideAutocomplete(); return; }

  const searchTerm = text.substring(atPos + 1, cursorPos).toLowerCase();
  currentAtMentionStart = atPos;

  const filtered = allTabs.filter(tab =>
    tab.title.toLowerCase().includes(searchTerm) ||
    tab.url.toLowerCase().includes(searchTerm)
  );

  if (filtered.length === 0) { hideAutocomplete(); return; }
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

    // Favicon
    if (tab.favIconUrl) {
      const favicon = document.createElement('img');
      favicon.className = 'tab-favicon';
      favicon.src = tab.favIconUrl;
      favicon.width = 14;
      favicon.height = 14;
      favicon.onerror = () => { favicon.style.display = 'none'; };
      item.appendChild(favicon);
    }

    const textWrap = document.createElement('div');
    textWrap.className = 'tab-suggestion-text';

    const title = document.createElement('div');
    title.className = 'tab-suggestion-title';
    title.textContent = tab.title || 'Untitled';

    const url = document.createElement('div');
    url.className = 'tab-suggestion-url';
    url.textContent = tab.url;

    textWrap.appendChild(title);
    textWrap.appendChild(url);
    item.appendChild(textWrap);

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

  if (selectedTabIndex >= 0 && selectedTabIndex < items.length) {
    items[selectedTabIndex].classList.remove('selected');
  }

  selectedTabIndex += direction;
  if (selectedTabIndex < 0) selectedTabIndex = items.length - 1;
  if (selectedTabIndex >= items.length) selectedTabIndex = 0;

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

  const text = queryInput.value;
  const beforeAt = text.substring(0, currentAtMentionStart);
  const afterCursor = text.substring(queryInput.selectionStart);
  const newText = beforeAt + `@"${tabTitle}" ` + afterCursor;

  queryInput.value = newText;
  queryInput.selectionStart = queryInput.selectionEnd = beforeAt.length + tabTitle.length + 4;

  hideAutocomplete();
  queryInput.focus();
  handleInputChange();
}

/**
 * Parse @mentions from query text
 */
function parseTabMentions(text) {
  const mentions = [];
  const regex = /@"([^"]+)"/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const tab = allTabs.find(t => t.title === match[1]);
    if (tab) mentions.push(tab);
  }

  return mentions;
}

/**
 * Handle input changes
 */
function handleInputChange() {
  const hasText = queryInput.value.trim().length > 0;
  const hasModel = selectedModel !== null && selectedModel !== '';
  sendBtn.disabled = !hasText || !hasModel || isLoading;

  queryInput.style.height = 'auto';
  queryInput.style.height = queryInput.scrollHeight + 'px';

  detectAtMention();
}

/**
 * Handle keyboard events
 */
function handleKeyDown(e) {
  if (tabAutocomplete.style.display !== 'none') {
    if (e.key === 'ArrowDown') { e.preventDefault(); navigateAutocomplete(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); navigateAutocomplete(-1); return; }
    if (e.key === 'Tab') { e.preventDefault(); selectCurrentTab(); return; }
    if (e.key === 'Enter' && selectedTabIndex >= 0) { e.preventDefault(); selectCurrentTab(); return; }
    if (e.key === 'Escape') { hideAutocomplete(); return; }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSend();
  }
}

/**
 * Handle send button click
 */
async function handleSend() {
  const query = queryInput.value.trim();
  if (!query || isLoading || !selectedModel) return;

  const mentionedTabs = parseTabMentions(query);

  queryInput.value = '';
  handleInputChange();

  const welcomeMsg = document.querySelector('.welcome-message');
  if (welcomeMsg) welcomeMsg.remove();

  // Add user message to history and render
  const ts = Date.now();
  conversationHistory.push({ role: 'user', text: query, timestamp: ts });
  renderMessage('user', query, ts);

  isLoading = true;
  sendBtn.disabled = true;
  const loadingEl = addLoadingMessage();

  const messageId = ts.toString();

  const streamDone = new Promise((resolve, reject) => {
    activeStreams[messageId] = { loadingEl, el: null, text: '', resolve, reject };
  });

  try {
    chrome.runtime.sendMessage({
      action: 'queryStream',
      data: {
        query,
        model: selectedModel,
        includePageContent: includePageCheckbox.checked,
        mentionedTabs: mentionedTabs.map(t => ({ id: t.id, title: t.title, url: t.url })),
        messageId
      }
    });

    await streamDone;
  } catch (error) {
    loadingEl.remove();
    addErrorMessage(error.message);
  } finally {
    isLoading = false;
    handleInputChange();
  }

  saveHistory();
}

/**
 * Add message to chat (wraps renderMessage + history push)
 */
function addMessage(role, text) {
  const ts = Date.now();
  renderMessage(role, text, ts);
  conversationHistory.push({ role, text, timestamp: ts });
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
      <span></span><span></span><span></span>
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
    if (result.conversationHistory && result.conversationHistory.length > 0) {
      conversationHistory = result.conversationHistory;

      const welcomeMsg = document.querySelector('.welcome-message');
      if (welcomeMsg) welcomeMsg.remove();

      conversationHistory.forEach(msg => {
        renderMessage(msg.role, msg.text, msg.timestamp || Date.now());
      });

      scrollToBottom();
    }
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

// Initialize on load
init();
