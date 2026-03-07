// Local-Agent Ollama — side panel

const chat        = document.getElementById('chat');
const input       = document.getElementById('input');
const sendBtn     = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const statusDot   = document.getElementById('status-dot');
const statusText  = document.getElementById('status-text');
const agentBtn    = document.getElementById('agent-btn');
const autocomplete      = document.getElementById('autocomplete');
const autocompleteList  = document.getElementById('autocomplete-list');

let history       = [];     // { role, text, timestamp }
let allTabs       = [];
let selectedModel = null;
let isLoading     = false;
let agentMode     = false;
let atStart       = -1;
let tabIdx        = -1;
let activeStreams  = {};    // messageId -> { loadingEl, el, text, resolve, reject }
let activeAgents  = {};    // messageId -> { card, stepsEl, headerEl, spinnerEl }

// ── Utilities ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function ts(ms) {
  return new Date(ms).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function scrollBottom() { chat.scrollTop = chat.scrollHeight; }

// ── Markdown ──────────────────────────────────────────────────────────────

function md(text) {
  const blocks = [];
  let out = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    blocks.push(`<pre><code>${escaped}</code></pre>`);
    return `\x00B${blocks.length-1}\x00`;
  });

  out = out.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  out = out.replace(/`([^`\n]+)`/g, (_, c) => `<code>${c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  out = out.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  out = out.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  out = out.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  out = out.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
  out = out.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  out = out.replace(/(<li>[\s\S]*?<\/li>)/g, m => `<ul>${m}</ul>`);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  out = out.replace(/\n/g, '<br>');
  blocks.forEach((b, i) => { out = out.replace(`\x00B${i}\x00`, b); });
  return out;
}

// ── Message rendering ──────────────────────────────────────────────────────

function renderMsg(role, text, timestamp) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  if (role === 'user') {
    avatar.textContent = 'U';
  } else {
    avatar.innerHTML = `<svg width="14" height="14" viewBox="0 0 691 691" fill="none"><rect width="691" height="691" rx="124" fill="#3b82f6"/><rect x="138" y="138" width="121" height="415" rx="42" fill="white"/><rect x="138" y="432" width="415" height="121" rx="42" fill="white"/></svg>`;
  }

  const body = document.createElement('div');
  body.className = 'msg-body';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  if (role === 'assistant') bubble.innerHTML = md(text);
  else bubble.textContent = text;

  const footer = document.createElement('div');
  footer.className = 'msg-footer';

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = ts(timestamp);
  footer.appendChild(time);

  if (role === 'assistant') {
    const copy = document.createElement('button');
    copy.className = 'copy-btn';
    copy.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        copy.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied`;
        copy.classList.add('copied');
        setTimeout(() => { copy.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`; copy.classList.remove('copied'); }, 2000);
      });
    });
    footer.appendChild(copy);
  }

  body.appendChild(bubble);
  body.appendChild(footer);
  el.appendChild(avatar);
  el.appendChild(body);
  chat.appendChild(el);
  scrollBottom();
  return el;
}

function addThinking() {
  const el = document.createElement('div');
  el.className = 'thinking';
  el.innerHTML = `
    <div class="msg-avatar" style="background:var(--surface-3)">
      <svg width="14" height="14" viewBox="0 0 691 691" fill="none"><rect width="691" height="691" rx="124" fill="#3b82f6"/><rect x="138" y="138" width="121" height="415" rx="42" fill="white"/><rect x="138" y="432" width="415" height="121" rx="42" fill="white"/></svg>
    </div>
    <div class="thinking-dots"><span></span><span></span><span></span></div>`;
  chat.appendChild(el);
  scrollBottom();
  return el;
}

function addError(msg) {
  const el = document.createElement('div');
  el.className = 'error-msg';
  el.textContent = `Error: ${msg}`;
  chat.appendChild(el);
  scrollBottom();
}

// ── Streaming message handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener(msg => {
  // Chat streaming
  const stream = activeStreams[msg.messageId];
  if (stream) {
    if (msg.action === 'streamChunk') {
      stream.text = msg.fullText;
      if (!stream.el) {
        stream.loadingEl.remove();
        stream.el = document.createElement('div');
        stream.el.className = 'msg assistant';
        stream.el.innerHTML = `
          <div class="msg-avatar"><svg width="14" height="14" viewBox="0 0 691 691" fill="none"><rect width="691" height="691" rx="124" fill="#3b82f6"/><rect x="138" y="138" width="121" height="415" rx="42" fill="white"/><rect x="138" y="432" width="415" height="121" rx="42" fill="white"/></svg></div>
          <div class="msg-body"><div class="msg-bubble"></div></div>`;
        chat.appendChild(stream.el);
      }
      stream.el.querySelector('.msg-bubble').innerHTML = md(stream.text) + '<span class="cursor"></span>';
      scrollBottom();
    }
    if (msg.action === 'streamComplete') {
      (stream.el || stream.loadingEl).remove();
      renderMsg('assistant', msg.text, Date.now());
      history.push({ role: 'assistant', text: msg.text, timestamp: Date.now() });
      saveHistory();
      stream.resolve(msg.text);
      delete activeStreams[msg.messageId];
    }
    if (msg.action === 'streamError') {
      stream.loadingEl?.remove(); stream.el?.remove();
      addError(msg.error);
      stream.reject(new Error(msg.error));
      delete activeStreams[msg.messageId];
    }
  }

  // Agent updates
  const agent = activeAgents[msg.messageId];
  if (agent) {
    if (msg.action === 'agentStep') {
      if (msg.type === 'action') agent.spinnerEl.style.display = 'none';
      const icons = { thinking: '·', action: '→', error: '✗', result: '✓' };
      const step = document.createElement('div');
      step.className = `agent-step ${msg.type}`;
      step.innerHTML = `<span class="step-icon">${icons[msg.type] || '·'}</span><span>${esc(msg.content)}</span>`;
      agent.stepsEl.appendChild(step);
      scrollBottom();
    }
    if (msg.action === 'agentComplete') {
      agent.spinnerEl.style.display = 'none';
      agent.headerEl.textContent = 'Agent done';
      const result = document.createElement('div');
      result.className = 'agent-result';
      result.innerHTML = md(msg.text);
      agent.card.appendChild(result);
      delete activeAgents[msg.messageId];
      history.push({ role: 'assistant', text: msg.text, timestamp: Date.now() });
      saveHistory();
      isLoading = false;
      updateSend();
      scrollBottom();
    }
  }
});

// ── Send ──────────────────────────────────────────────────────────────────

async function handleSend() {
  const query = input.value.trim();
  if (!query || isLoading || !selectedModel) return;

  input.value = '';
  input.style.height = 'auto';
  hideAutocomplete();
  document.getElementById('welcome')?.remove();

  const now = Date.now();
  const messageId = now.toString();
  history.push({ role: 'user', text: query, timestamp: now });
  renderMsg('user', query, now);
  isLoading = true;
  updateSend();

  if (agentMode) {
    // ── Agent mode ──
    startAgent(messageId, query);
    chrome.runtime.sendMessage({ action: 'agentTask', data: { task: query, model: selectedModel, messageId } });
    saveHistory();
  } else {
    // ── Chat mode ──
    const mentionedTabs = parseTabMentions(query);
    const loadingEl = addThinking();

    const streamDone = new Promise((resolve, reject) => {
      activeStreams[messageId] = { loadingEl, el: null, text: '', resolve, reject };
    });

    // Pass last 10 turns as context (excluding the one we just pushed)
    const historyContext = history.slice(-11, -1);

    chrome.runtime.sendMessage({
      action: 'queryStream',
      data: { query, model: selectedModel, mentionedTabs: mentionedTabs.map(t => ({ id: t.id, title: t.title, url: t.url })), history: historyContext, messageId }
    });

    try { await streamDone; }
    catch {} // error already shown by streamError handler
    finally { isLoading = false; updateSend(); }
    saveHistory();
  }
}

function startAgent(messageId, task) {
  const run = document.createElement('div');
  run.className = 'agent-run';
  run.innerHTML = `
    <div class="msg-avatar" style="background:var(--surface-3)">
      <svg width="14" height="14" viewBox="0 0 691 691" fill="none"><rect width="691" height="691" rx="124" fill="#3b82f6"/><rect x="138" y="138" width="121" height="415" rx="42" fill="white"/><rect x="138" y="432" width="415" height="121" rx="42" fill="white"/></svg>
    </div>
    <div class="agent-card">
      <div class="agent-header">
        <div class="agent-spinner"></div>
        <span class="agent-header-text">Agent working…</span>
      </div>
      <div class="agent-steps"></div>
    </div>`;
  chat.appendChild(run);
  scrollBottom();
  activeAgents[messageId] = {
    card:      run.querySelector('.agent-card'),
    stepsEl:   run.querySelector('.agent-steps'),
    headerEl:  run.querySelector('.agent-header-text'),
    spinnerEl: run.querySelector('.agent-spinner')
  };
}

// ── Models ────────────────────────────────────────────────────────────────

async function loadModels() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getModels' });
    if (res?.success && res.models?.length) {
      modelSelect.innerHTML = '';
      res.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name;
        modelSelect.appendChild(opt);
      });
      const saved = (await chrome.storage.local.get('selectedModel')).selectedModel;
      if (saved && res.models.some(m => m.name === saved)) {
        modelSelect.value = saved;
        selectedModel = saved;
      } else {
        selectedModel = res.models[0].name;
        modelSelect.value = selectedModel;
      }
    } else {
      modelSelect.innerHTML = '<option>No models</option>';
      const msg = res?.error || 'Ollama not found';
      addError(msg.includes('OLLAMA_ORIGINS')
        ? msg
        : 'Cannot reach Ollama. Steps to fix:\n1. Make sure Ollama is running: ollama serve\n2. If still failing, restart with: OLLAMA_ORIGINS="*" ollama serve');
    }
  } catch (e) {
    modelSelect.innerHTML = '<option>Ollama offline</option>';
    addError('Cannot reach Ollama. Make sure it is running: ollama serve');
  }
}

// ── Connection ────────────────────────────────────────────────────────────

async function checkConn() {
  try {
    const { connected } = await chrome.runtime.sendMessage({ action: 'checkConnection' });
    statusDot.className = `dot ${connected ? 'connected' : 'disconnected'}`;
    statusText.textContent = connected ? 'Ollama connected' : 'Ollama disconnected';
  } catch {
    statusDot.className = 'dot disconnected';
    statusText.textContent = 'Ollama disconnected';
  }
}

// ── Tabs & autocomplete ───────────────────────────────────────────────────

async function loadTabs() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getTabs' });
    if (res.success) allTabs = res.tabs;
  } catch {}
}

function parseTabMentions(text) {
  const out = [];
  const re = /@"([^"]+)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tab = allTabs.find(t => t.title === m[1]) || allTabs.find(t => t.url === m[1]);
    if (tab) out.push(tab);
  }
  return out;
}

function detectAt() {
  const text = input.value;
  const cur = input.selectionStart;
  let pos = -1;
  for (let i = cur - 1; i >= 0; i--) {
    if (text[i] === '@') { pos = i; break; }
    if (text[i] === ' ' || text[i] === '\n') break;
  }
  if (pos === -1) { hideAutocomplete(); return; }
  atStart = pos;
  const q = text.slice(pos + 1, cur).toLowerCase();
  const hits = allTabs.filter(t => t.title?.toLowerCase().includes(q) || t.url?.toLowerCase().includes(q));
  if (!hits.length) { hideAutocomplete(); return; }
  showAutocomplete(hits);
}

function showAutocomplete(tabs) {
  autocompleteList.innerHTML = '';
  tabIdx = -1;
  tabs.forEach((tab, i) => {
    const item = document.createElement('div');
    item.className = 'tab-item';
    item.dataset.i = i;
    if (tab.favIconUrl) {
      const img = document.createElement('img');
      img.className = 'tab-favicon'; img.src = tab.favIconUrl;
      img.width = img.height = 14; img.onerror = () => img.remove();
      item.appendChild(img);
    }
    const info = document.createElement('div'); info.className = 'tab-info';
    info.innerHTML = `<div class="tab-title">${esc(tab.title||'Untitled')}</div><div class="tab-url">${esc(tab.url)}</div>`;
    item.appendChild(info);
    item.addEventListener('click', () => { tabIdx = i; selectTab(); });
    autocompleteList.appendChild(item);
  });
  autocomplete.style.display = 'block';
}

function hideAutocomplete() {
  autocomplete.style.display = 'none';
  tabIdx = -1; atStart = -1;
}

function navAutocomplete(dir) {
  const items = autocompleteList.querySelectorAll('.tab-item');
  if (!items.length) return;
  if (tabIdx >= 0) items[tabIdx].classList.remove('selected');
  tabIdx = (tabIdx + dir + items.length) % items.length;
  items[tabIdx].classList.add('selected');
  items[tabIdx].scrollIntoView({ block: 'nearest' });
}

function selectTab() {
  const items = autocompleteList.querySelectorAll('.tab-item');
  if (tabIdx < 0 || tabIdx >= items.length) return;
  const title = items[tabIdx].querySelector('.tab-title').textContent;
  const before = input.value.slice(0, atStart);
  const after  = input.value.slice(input.selectionStart);
  input.value = before + `@"${title}" ` + after;
  input.selectionStart = input.selectionEnd = before.length + title.length + 4;
  hideAutocomplete();
  input.focus();
  updateSend();
}

// ── Input ─────────────────────────────────────────────────────────────────

function updateSend() {
  sendBtn.disabled = !input.value.trim() || !selectedModel || isLoading;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  detectAt();
}

input.addEventListener('input', updateSend);

input.addEventListener('keydown', e => {
  if (autocomplete.style.display !== 'none') {
    if (e.key === 'ArrowDown')  { e.preventDefault(); navAutocomplete(1); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); navAutocomplete(-1); return; }
    if (e.key === 'Tab')        { e.preventDefault(); selectTab(); return; }
    if (e.key === 'Enter' && tabIdx >= 0) { e.preventDefault(); selectTab(); return; }
    if (e.key === 'Escape')     { hideAutocomplete(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) handleSend(); }
});

sendBtn.addEventListener('click', handleSend);

// ── New chat ──────────────────────────────────────────────────────────────

async function newChat() {
  history = [];
  await chrome.storage.local.remove('chatHistory');
  chat.innerHTML = '';
  const welcome = document.createElement('div');
  welcome.id = 'welcome'; welcome.className = 'welcome';
  welcome.innerHTML = `
    <div class="welcome-logo"><svg width="40" height="40" viewBox="0 0 691 691" fill="none"><rect width="691" height="691" rx="124" fill="#3b82f6"/><rect x="138" y="138" width="121" height="415" rx="42" fill="white"/><rect x="138" y="432" width="415" height="121" rx="42" fill="white"/></svg></div>
    <h2 class="welcome-title">Local-Agent Ollama</h2>
    <p class="welcome-desc">Chat, summarize pages, or reference any open tab with <code>@tabname</code>. Powered by Ollama — fully private, runs on your machine.</p>
    <div class="suggestions">
      <button class="suggestion" data-q='Summarize @"'>Summarize a tab</button>
      <button class="suggestion" data-q='What are the key points in @"'>Key points</button>
      <button class="suggestion" data-q='Explain @"'>Explain this page</button>
    </div>`;
  chat.appendChild(welcome);
  welcome.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => { input.value = btn.dataset.q; input.focus(); input.selectionStart = input.selectionEnd = input.value.length; updateSend(); });
  });
  input.value = ''; updateSend();
}

// ── Export ────────────────────────────────────────────────────────────────

function exportChat() {
  if (!history.length) return;
  let out = '# Local-Agent Ollama Conversation\n\n';
  history.forEach(m => {
    out += `**${m.role === 'user' ? 'You' : 'Agent'}** _(${new Date(m.timestamp).toLocaleString()})_\n\n${m.text}\n\n---\n\n`;
  });
  const url = URL.createObjectURL(new Blob([out], { type: 'text/markdown' }));
  Object.assign(document.createElement('a'), { href: url, download: `local-agent-${Date.now()}.md` }).click();
  URL.revokeObjectURL(url);
}

// ── History ───────────────────────────────────────────────────────────────

async function saveHistory() {
  try { await chrome.storage.local.set({ chatHistory: history }); } catch {}
}

async function loadHistory() {
  try {
    const { chatHistory } = await chrome.storage.local.get('chatHistory');
    if (chatHistory?.length) {
      history = chatHistory;
      document.getElementById('welcome')?.remove();
      history.forEach(m => renderMsg(m.role, m.text, m.timestamp || Date.now()));
      scrollBottom();
    }
  } catch {}
}

// ── Boot ──────────────────────────────────────────────────────────────────

async function init() {
  // Theme
  document.getElementById('theme-btn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-mode') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-mode', next);
    localStorage.setItem('la-theme', next);
  });

  // New chat
  document.getElementById('new-chat-btn').addEventListener('click', newChat);

  // Export
  document.getElementById('export-btn').addEventListener('click', exportChat);

  // Agent mode
  agentBtn.addEventListener('click', () => {
    agentMode = !agentMode;
    agentBtn.classList.toggle('active', agentMode);
    input.placeholder = agentMode ? 'Describe a task for the agent…' : 'Ask anything…';
  });

  // Model change
  modelSelect.addEventListener('change', async () => {
    selectedModel = modelSelect.value;
    await chrome.storage.local.set({ selectedModel });
  });

  // Reconnect
  document.getElementById('reconnect-btn').addEventListener('click', async () => {
    statusDot.className = 'dot connecting';
    statusText.textContent = 'Reconnecting…';
    await checkConn();
    await loadModels();
  });

  // Suggestion buttons
  document.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => { input.value = btn.dataset.q; input.focus(); input.selectionStart = input.selectionEnd = input.value.length; updateSend(); });
  });

  await loadTabs();
  setInterval(loadTabs, 10000);
  await loadModels();
  checkConn();
  setInterval(checkConn, 6000);
  await loadHistory();
}

init();
