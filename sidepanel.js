// Local-Agent Ollama — side panel

const chat             = document.getElementById('chat');
const input            = document.getElementById('input');
const sendBtn          = document.getElementById('send-btn');
const modelSelect      = document.getElementById('model-select');
const statusDot        = document.getElementById('status-dot');
const statusText       = document.getElementById('status-text');
const agentBtn         = document.getElementById('agent-btn');
const agentBtnText     = document.getElementById('agent-btn-text');
const autocomplete     = document.getElementById('autocomplete');
const autocompleteList = document.getElementById('autocomplete-list');

// Minimalist redesign elements
const modelShelf       = document.getElementById('model-shelf');
const modelPopover     = document.getElementById('model-popover');
const currentModelName = document.getElementById('current-model-name');
const modelList        = document.getElementById('model-list');
const modelCountBadge  = document.getElementById('model-count-badge');
const refreshModelsBtn = document.getElementById('refresh-models-btn');
const dictateBtn       = document.getElementById('dictate-btn');
const settingsBtn      = document.getElementById('settings-btn');
const micBlockedBanner      = document.getElementById('mic-blocked-banner');
const sidepanelUnlockMicBtn = document.getElementById('sidepanel-unlock-mic-btn');
const dismissMicBannerBtn   = document.getElementById('dismiss-mic-banner-btn');

let history       = [];     // { role, text, timestamp }
let allTabs       = [];
let selectedModel = null;
let isLoading     = false;
let agentMode     = false;
let tabIdx        = -1;
let activeStreams = {};     // messageId -> { loadingEl, el, text, resolve, reject }
let activeAgents  = {};     // messageId -> { card, stepsEl, headerEl, spinnerEl }
let isRecording   = false;
let speechRec     = null;
let savedRange    = null;

// ── Utilities ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function ts(ms) {
  return new Date(ms).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function scrollBottom() {
  chat.scrollTop = chat.scrollHeight;
}

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
    avatar.innerHTML = `<svg width="14" height="14" viewBox="0 0 691 691" fill="none"><rect width="691" height="691" rx="124" fill="#10a37f"/><rect x="138" y="138" width="121" height="415" rx="42" fill="white"/><rect x="138" y="432" width="415" height="121" rx="42" fill="white"/></svg>`;
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
        setTimeout(() => {
          copy.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
          copy.classList.remove('copied');
        }, 2000);
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
      <svg width="14" height="14" viewBox="0 0 691 691" fill="none"><rect width="691" height="691" rx="124" fill="#10a37f"/><rect x="138" y="138" width="121" height="415" rx="42" fill="white"/><rect x="138" y="432" width="415" height="121" rx="42" fill="white"/></svg>
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

// ── Streaming & Agent Message Handler ──────────────────────────────────────

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
          <div class="msg-avatar"><svg width="14" height="14" viewBox="0 0 691 691" fill="none"><rect width="691" height="691" rx="124" fill="#10a37f"/><rect x="138" y="138" width="121" height="415" rx="42" fill="white"/><rect x="138" y="432" width="415" height="121" rx="42" fill="white"/></svg></div>
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
      stream.loadingEl?.remove();
      stream.el?.remove();
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

    // Step limit confirmation requested
    if (msg.action === 'agentMaxStepsReached') {
      agent.spinnerEl.style.display = 'none';
      const promptCard = document.createElement('div');
      promptCard.className = 'agent-step-prompt';
      promptCard.innerHTML = `
        <div class="prompt-desc">Reached step limit (${msg.currentSteps} steps). Would you like to continue?</div>
        <div class="prompt-actions">
          <button class="prompt-btn continue" type="button">Continue (+${msg.suggestedIncrement || 10} steps)</button>
          <button class="prompt-btn end" type="button">End task</button>
        </div>
      `;
      agent.stepsEl.appendChild(promptCard);
      scrollBottom();

      promptCard.querySelector('.continue').addEventListener('click', () => {
        agent.spinnerEl.style.display = 'block';
        promptCard.remove();
        chrome.runtime.sendMessage({
          action: 'agentDecision',
          messageId: msg.messageId,
          decision: 'continue',
          additionalSteps: msg.suggestedIncrement || 10
        });
      });

      promptCard.querySelector('.end').addEventListener('click', () => {
        promptCard.remove();
        chrome.runtime.sendMessage({
          action: 'agentDecision',
          messageId: msg.messageId,
          decision: 'end'
        });
      });
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

// ── Contenteditable Input Helpers ─────────────────────────────────────────

function getInputText() {
  let text = '';
  input.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.classList?.contains('mcp-pill')) {
      const server = node.dataset.mcpServer || '';
      const tool = node.dataset.mcpTool || '';
      text += tool ? `/[${server}:${tool}] ` : `/[${server}] `;
    } else if (node.classList?.contains('mention-pill')) {
      text += `@"${node.dataset.tabTitle}" `;
    } else if (node.nodeName === 'BR') {
      text += '\n';
    } else {
      text += node.innerText || node.textContent || '';
    }
  });
  return text.trim();
}

function clearInput() {
  input.innerHTML = '';
  updateSend();
}

function setInputPlain(text) {
  input.innerHTML = '';
  if (text) {
    input.appendChild(document.createTextNode(text));
  }
  updateSend();
}

function getMentionedTabs() {
  const pills = input.querySelectorAll('.mention-pill:not(.mcp-pill)');
  const tabs = [];
  pills.forEach(p => {
    const id = Number(p.dataset.tabId);
    const tab = allTabs.find(t => t.id === id) || {
      id,
      title: p.dataset.tabTitle,
      url: p.dataset.tabUrl
    };
    tabs.push(tab);
  });

  // Also include any typed text mentions
  const textTabs = parseTabMentions(getInputText());
  textTabs.forEach(t => {
    if (!tabs.some(existing => existing.id === t.id)) {
      tabs.push(t);
    }
  });

  return tabs;
}

function parseMcpMentions(text) {
  const mcp = [];
  const regex = /\/\[([^\]:]+)(?::([^\]]+))?\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    mcp.push({
      server: match[1].trim(),
      tool: match[2] ? match[2].trim() : null
    });
  }
  return mcp;
}

function getMentionedMCP() {
  const pills = input.querySelectorAll('.mention-pill.mcp-pill');
  const mcp = [];
  pills.forEach(p => {
    mcp.push({
      server: p.dataset.mcpServer,
      tool: p.dataset.mcpTool || null
    });
  });

  const textMcp = parseMcpMentions(getInputText());
  textMcp.forEach(m => {
    if (!mcp.some(existing => existing.server.toLowerCase() === m.server.toLowerCase() && existing.tool === m.tool)) {
      mcp.push(m);
    }
  });

  return mcp;
}

// ── Send ──────────────────────────────────────────────────────────────────

async function handleSend() {
  const query = getInputText();
  if (!query || isLoading || !selectedModel) return;

  const mentionedTabs = getMentionedTabs();
  const mentionedMCP = getMentionedMCP();

  clearInput();
  hideAutocomplete();
  document.getElementById('welcome')?.remove();

  const now = Date.now();
  const messageId = now.toString();
  history.push({ role: 'user', text: query, timestamp: now });
  renderMsg('user', query, now);
  isLoading = true;
  updateSend();

  if (agentMode) {
    startAgent(messageId, query);
    chrome.runtime.sendMessage({ action: 'agentTask', data: { task: query, model: selectedModel, messageId, mentionedMCP } });
    saveHistory();
  } else {
    const loadingEl = addThinking();

    const streamDone = new Promise((resolve, reject) => {
      activeStreams[messageId] = { loadingEl, el: null, text: '', resolve, reject };
    });

    const historyContext = history.slice(-11, -1);

    chrome.runtime.sendMessage({
      action: 'queryStream',
      data: {
        query,
        model: selectedModel,
        mentionedTabs: mentionedTabs.map(t => ({ id: t.id, title: t.title, url: t.url })),
        mentionedMCP,
        history: historyContext,
        messageId
      }
    });

    try { await streamDone; }
    catch {}
    finally { isLoading = false; updateSend(); }
    saveHistory();
  }
}

function startAgent(messageId, task) {
  const run = document.createElement('div');
  run.className = 'agent-run';
  run.innerHTML = `
    <div class="msg-avatar" style="background:var(--surface-3)">
      <svg width="14" height="14" viewBox="0 0 691 691" fill="none"><rect width="691" height="691" rx="124" fill="#10a37f"/><rect x="138" y="138" width="121" height="415" rx="42" fill="white"/><rect x="138" y="432" width="415" height="121" rx="42" fill="white"/></svg>
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

// ── Models & Shelf ────────────────────────────────────────────────────────

function renderModelList(models) {
  modelList.innerHTML = '';
  if (modelCountBadge) modelCountBadge.textContent = models.length;

  const ollamaModels = models.filter(m => m.provider === 'ollama');
  const openrouterModels = models.filter(m => m.provider === 'openrouter');

  function createModelItem(m) {
    const item = document.createElement('div');
    item.className = `model-item ${m.name === selectedModel ? 'active' : ''}`;
    item.innerHTML = `
      <div class="model-item-meta">
        <span class="model-item-title" title="${esc(m.name)}">${esc(m.name)}</span>
      </div>
      ${m.name === selectedModel ? `
        <span class="model-item-check">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
      ` : ''}
    `;

    item.addEventListener('click', async () => {
      selectedModel = m.name;
      modelSelect.value = m.name;
      currentModelName.textContent = m.name;
      await chrome.storage.local.set({ selectedModel });
      closeModelPopover();
      renderModelList(models);
      updateSend();
    });

    return item;
  }

  // 1. Ollama Models Section
  const ollamaSection = document.createElement('div');
  ollamaSection.className = 'model-section';
  ollamaSection.innerHTML = `
    <div class="model-section-header">
      <span class="model-section-title">Ollama</span>
    </div>
  `;
  if (ollamaModels.length) {
    ollamaModels.forEach(m => ollamaSection.appendChild(createModelItem(m)));
  } else {
    const empty = document.createElement('div');
    empty.className = 'model-empty-hint';
    empty.textContent = 'No local Ollama models found. Ensure Ollama is running.';
    ollamaSection.appendChild(empty);
  }
  modelList.appendChild(ollamaSection);

  // 2. OpenRouter Models Section (under Ollama models)
  const orSection = document.createElement('div');
  orSection.className = 'model-section';
  orSection.innerHTML = `
    <div class="model-section-header">
      <span class="model-section-title">OpenRouter</span>
    </div>
  `;
  if (openrouterModels.length) {
    openrouterModels.forEach(m => orSection.appendChild(createModelItem(m)));
  } else {
    const empty = document.createElement('div');
    empty.className = 'model-empty-hint';
    empty.innerHTML = `No OpenRouter models connected.<br/><button class="model-configure-link" type="button">Configure in Settings</button>`;
    empty.querySelector('.model-configure-link')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModelPopover();
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    });
    orSection.appendChild(empty);
  }
  modelList.appendChild(orSection);
}

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

      currentModelName.textContent = selectedModel;
      renderModelList(res.models);
    } else {
      modelSelect.innerHTML = '<option>No models</option>';
      currentModelName.textContent = 'Select model…';
      renderModelList([]);
      if (modelCountBadge) modelCountBadge.textContent = '0';
    }
  } catch (e) {
    modelSelect.innerHTML = '<option>Offline</option>';
    currentModelName.textContent = 'Server offline';
    modelList.innerHTML = '<div class="model-empty">Cannot reach model provider.</div>';
    if (modelCountBadge) modelCountBadge.textContent = '0';
  }
}

function toggleModelPopover() {
  const isOpen = modelPopover.style.display !== 'none';
  if (isOpen) {
    closeModelPopover();
  } else {
    modelPopover.style.display = 'flex';
    modelShelf.classList.add('open');
  }
}

function closeModelPopover() {
  modelPopover.style.display = 'none';
  modelShelf.classList.remove('open');
}

// ── Connection ────────────────────────────────────────────────────────────

async function checkConn() {
  try {
    const { connected } = await chrome.runtime.sendMessage({ action: 'checkConnection' });
    if (statusDot) statusDot.className = `dot ${connected ? 'connected' : 'disconnected'}`;
    if (statusText) statusText.textContent = connected ? 'Connected' : 'Disconnected';
  } catch {
    if (statusDot) statusDot.className = 'dot disconnected';
    if (statusText) statusText.textContent = 'Offline';
  }
}

// ── Tabs & Autocomplete with Editable Mention Pills ───────────────────────

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

let allMcpServers = [];

async function loadMcpServers() {
  try {
    const data = await chrome.storage.local.get('mcpServers');
    allMcpServers = Array.isArray(data.mcpServers) ? data.mcpServers : [];
  } catch {}
}

function detectTrigger() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) { hideAutocomplete(); return; }
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) { hideAutocomplete(); return; }

  const textBefore = node.textContent.slice(0, range.startOffset);
  const atIdx = textBefore.lastIndexOf('@');
  const slashIdx = textBefore.lastIndexOf('/');

  const triggerIdx = Math.max(atIdx, slashIdx);
  if (triggerIdx === -1) { hideAutocomplete(); return; }

  // Ensure trigger is at the start of text or preceded by whitespace
  if (triggerIdx > 0 && !/\s/.test(textBefore[triggerIdx - 1])) {
    hideAutocomplete();
    return;
  }

  const triggerChar = textBefore[triggerIdx]; // '@' or '/'
  const query = textBefore.slice(triggerIdx + 1).toLowerCase();
  if (query.includes('\n')) { hideAutocomplete(); return; }

  if (triggerChar === '@') {
    const hits = allTabs.filter(t =>
      t.title?.toLowerCase().includes(query) || t.url?.toLowerCase().includes(query)
    );

    if (!hits.length) { hideAutocomplete(); return; }

    savedRange = {
      trigger: '@',
      node,
      atOffset: triggerIdx,
      endOffset: range.startOffset
    };

    showAutocomplete(hits, '@');
  } else if (triggerChar === '/') {
    const hits = [];
    allMcpServers.forEach(server => {
      const sName = (server.name || '').toLowerCase();
      const sMatch = sName.includes(query);
      if (sMatch) {
        hits.push({
          type: 'mcp-server',
          server,
          title: `/${server.name}`,
          description: `${server.tools?.length || 0} tools · ${server.authType || 'none'}`,
          url: server.originalUrl || server.url
        });
      }

      if (server.tools && server.tools.length) {
        server.tools.forEach(tool => {
          const tName = (tool.name || '').toLowerCase();
          const tDesc = (tool.description || '').toLowerCase();
          if (tName.includes(query) || tDesc.includes(query) || sMatch) {
            hits.push({
              type: 'mcp-tool',
              server,
              tool,
              title: `/${server.name}:${tool.name}`,
              description: tool.description || `Tool from ${server.name}`,
              url: server.name
            });
          }
        });
      }
    });

    if (!allMcpServers.length) {
      hits.push({
        type: 'mcp-empty',
        title: 'No MCP servers connected',
        description: 'Click to open Settings and connect an MCP server',
        url: 'settings.html'
      });
    } else if (!hits.length) {
      hideAutocomplete();
      return;
    }

    savedRange = {
      trigger: '/',
      node,
      atOffset: triggerIdx,
      endOffset: range.startOffset
    };

    showAutocomplete(hits, '/');
  }
}

function showAutocomplete(items, trigger = '@') {
  autocompleteList.innerHTML = '';
  tabIdx = -1;
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'tab-item';
    el.dataset.i = i;

    if (trigger === '@') {
      const tab = item;
      if (tab.favIconUrl) {
        const img = document.createElement('img');
        img.className = 'tab-favicon';
        img.src = tab.favIconUrl;
        img.width = img.height = 14;
        img.onerror = () => img.remove();
        el.appendChild(img);
      }
      const info = document.createElement('div');
      info.className = 'tab-info';
      info.innerHTML = `<div class="tab-title">${esc(tab.title || 'Untitled')}</div><div class="tab-url">${esc(tab.url)}</div>`;
      el.appendChild(info);

      el.addEventListener('mousedown', e => e.preventDefault());
      el.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        insertMentionPill(tab);
      });
    } else {
      const mcpItem = item;
      const icon = document.createElement('span');
      icon.className = 'mcp-icon';
      icon.textContent = mcpItem.type === 'mcp-server' ? 'S' : (mcpItem.type === 'mcp-empty' ? '⚙' : 'T');
      el.appendChild(icon);

      const info = document.createElement('div');
      info.className = 'tab-info';
      info.innerHTML = `<div class="tab-title">${esc(mcpItem.title)}</div><div class="tab-url">${esc(mcpItem.description || mcpItem.url)}</div>`;
      el.appendChild(info);

      el.addEventListener('mousedown', e => e.preventDefault());
      el.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (mcpItem.type === 'mcp-empty') {
          hideAutocomplete();
          chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
          return;
        }
        insertMCPPill(mcpItem);
      });
    }

    autocompleteList.appendChild(el);
  });
  autocomplete.style.display = 'block';
}

function hideAutocomplete() {
  autocomplete.style.display = 'none';
  tabIdx = -1;
  savedRange = null;
}

function navAutocomplete(dir) {
  const items = autocompleteList.querySelectorAll('.tab-item');
  if (!items.length) return;
  if (tabIdx >= 0) items[tabIdx].classList.remove('selected');
  tabIdx = (tabIdx + dir + items.length) % items.length;
  items[tabIdx].classList.add('selected');
  items[tabIdx].scrollIntoView({ block: 'nearest' });
}

function stripTrailingTriggerBefore(pill, trigger = '@') {
  let prev = pill.previousSibling;
  while (prev) {
    if (prev.nodeType === Node.TEXT_NODE) {
      if (prev.textContent.endsWith(trigger)) {
        prev.textContent = prev.textContent.slice(0, -1);
      } else if (new RegExp(`\\${trigger}\\s*$`).test(prev.textContent)) {
        prev.textContent = prev.textContent.replace(new RegExp(`\\${trigger}\\s*$`), '');
      }
      break;
    } else if (prev.classList?.contains('mention-pill')) {
      break;
    }
    prev = prev.previousSibling;
  }
}

function cleanAllStrayTriggers() {
  const pills = input.querySelectorAll('.mention-pill');
  pills.forEach(p => {
    stripTrailingTriggerBefore(p, '@');
    stripTrailingTriggerBefore(p, '/');
  });
}

function insertMentionPill(tab) {
  const rangeInfo = savedRange;
  hideAutocomplete();

  const pill = document.createElement('span');
  pill.className = 'mention-pill';
  pill.contentEditable = 'false';
  pill.dataset.tabId = tab.id;
  pill.dataset.tabTitle = tab.title || 'Untitled';
  pill.dataset.tabUrl = tab.url || '';
  pill.innerHTML = `
    <span class="pill-at">@</span>
    <span class="pill-title">${esc(tab.title || 'Untitled')}</span>
    <button class="pill-remove" type="button" tabindex="-1" title="Remove">×</button>
  `;

  pill.querySelector('.pill-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    pill.remove();
    updateSend();
    input.focus();
  });

  const space = document.createTextNode('\u00A0');
  const sel = window.getSelection();
  let inserted = false;

  if (rangeInfo && rangeInfo.node && rangeInfo.node.parentNode) {
    try {
      const r = document.createRange();
      r.setStart(rangeInfo.node, rangeInfo.atOffset);
      r.setEnd(rangeInfo.node, rangeInfo.endOffset);
      r.deleteContents();
      r.insertNode(space);
      r.insertNode(pill);

      const caretRange = document.createRange();
      caretRange.setStartAfter(space);
      caretRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caretRange);
      inserted = true;
    } catch (err) {
      console.warn('Range insertion error, falling back:', err);
    }
  }

  if (!inserted) {
    cleanTrailingTrigger('@');
    input.appendChild(pill);
    input.appendChild(space);
    const caretRange = document.createRange();
    caretRange.setStartAfter(space);
    caretRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caretRange);
  }

  // Ensure absolutely no stray @ remains in preceding text nodes
  stripTrailingTriggerBefore(pill, '@');
  cleanAllStrayTriggers();

  savedRange = null;
  input.focus();
  updateSend();
}

function insertMCPPill(item) {
  const rangeInfo = savedRange;
  hideAutocomplete();

  const pill = document.createElement('span');
  pill.className = 'mention-pill mcp-pill';
  pill.contentEditable = 'false';

  const isTool = item.type === 'mcp-tool';
  const serverName = item.server?.name || '';
  const toolName = isTool ? item.tool?.name : '';

  pill.dataset.mcpServer = serverName;
  if (isTool) pill.dataset.mcpTool = toolName;

  const displayTitle = isTool ? `${serverName}:${toolName}` : serverName;

  pill.innerHTML = `
    <span class="pill-at">/</span>
    <span class="pill-title">${esc(displayTitle)}</span>
    <button class="pill-remove" type="button" tabindex="-1" title="Remove">×</button>
  `;

  pill.querySelector('.pill-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    pill.remove();
    updateSend();
    input.focus();
  });

  const space = document.createTextNode('\u00A0');
  const sel = window.getSelection();
  let inserted = false;

  if (rangeInfo && rangeInfo.node && rangeInfo.node.parentNode) {
    try {
      const r = document.createRange();
      r.setStart(rangeInfo.node, rangeInfo.atOffset);
      r.setEnd(rangeInfo.node, rangeInfo.endOffset);
      r.deleteContents();
      r.insertNode(space);
      r.insertNode(pill);

      const caretRange = document.createRange();
      caretRange.setStartAfter(space);
      caretRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caretRange);
      inserted = true;
    } catch (err) {
      console.warn('Range insertion error, falling back:', err);
    }
  }

  if (!inserted) {
    cleanTrailingTrigger('/');
    input.appendChild(pill);
    input.appendChild(space);
    const caretRange = document.createRange();
    caretRange.setStartAfter(space);
    caretRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caretRange);
  }

  // Ensure no stray / remains in preceding text nodes
  stripTrailingTriggerBefore(pill, '/');
  cleanAllStrayTriggers();

  savedRange = null;
  input.focus();
  updateSend();
}

function cleanTrailingTrigger(trigger = '@') {
  for (let i = input.childNodes.length - 1; i >= 0; i--) {
    const child = input.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      const re = new RegExp(`\\${trigger}([a-zA-Z0-9_\\-\\s]*)$`);
      const m = child.textContent.match(re);
      if (m) {
        child.textContent = child.textContent.slice(0, child.textContent.length - m[0].length);
        break;
      }
    }
  }
}

// ── Voice Dictation ───────────────────────────────────────────────────────

function initSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return null;

  const rec = new SpeechRec();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';

  rec.onstart = () => {
    isRecording = true;
    dictateBtn.classList.add('recording');
    dictateBtn.title = 'Listening… click to finish';
  };

  rec.onresult = event => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }
    if (finalTranscript) {
      const current = input.textContent.trim();
      const space = current.length ? ' ' : '';
      input.appendChild(document.createTextNode(space + finalTranscript.trim()));
      updateSend();
    }
  };

  rec.onerror = event => {
    console.warn('Speech recognition error:', event.error);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      showMicBlockedBanner();
    }
    stopRecording();
  };

  rec.onend = () => {
    stopRecording();
  };

  return rec;
}

function showMicBlockedBanner() {
  if (micBlockedBanner) micBlockedBanner.style.display = 'flex';
}

function hideMicBlockedBanner() {
  if (micBlockedBanner) micBlockedBanner.style.display = 'none';
}

async function toggleDictation() {
  try {
    if (navigator.permissions?.query) {
      const perm = await navigator.permissions.query({ name: 'microphone' }).catch(() => null);
      if (perm?.state === 'denied') {
        showMicBlockedBanner();
        return;
      }
    }
  } catch {}

  if (!speechRec) {
    speechRec = initSpeechRecognition();
  }

  if (!speechRec) {
    alert('Web Speech API is not supported in this browser. Please use Google Chrome or a compatible Chromium browser.');
    return;
  }

  if (isRecording) {
    stopRecording();
  } else {
    try {
      speechRec.start();
    } catch (e) {
      console.warn('Error starting speech recognition:', e);
      showMicBlockedBanner();
      stopRecording();
    }
  }
}

function stopRecording() {
  isRecording = false;
  dictateBtn.classList.remove('recording');
  dictateBtn.title = 'Dictate message';
  try { speechRec?.stop(); } catch {}
}

// ── Input Event Handlers ──────────────────────────────────────────────────

function updateSend() {
  const text = getInputText();
  sendBtn.disabled = !text || !selectedModel || isLoading;
  detectTrigger();
}

input.addEventListener('input', updateSend);

input.addEventListener('keydown', e => {
  if (autocomplete.style.display !== 'none') {
    if (e.key === 'ArrowDown')  { e.preventDefault(); navAutocomplete(1); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); navAutocomplete(-1); return; }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      const items = autocompleteList.querySelectorAll('.tab-item');
      if (tabIdx >= 0 && items[tabIdx]) {
        items[tabIdx].click();
      } else if (items.length) {
        items[0].click();
      }
      return;
    }
    if (e.key === 'Escape')     { hideAutocomplete(); return; }
  }

  // Atomic Backspace for mention pills
  if (e.key === 'Backspace') {
    const sel = window.getSelection();
    if (sel && sel.isCollapsed && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      if (range.startOffset === 0) {
        const prev = range.startContainer.previousSibling;
        if (prev?.classList?.contains('mention-pill')) {
          e.preventDefault();
          prev.remove();
          updateSend();
          return;
        }
      }
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSend();
  }
});

// Paste plain text only into contenteditable
input.addEventListener('paste', e => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
  updateSend();
});

sendBtn.addEventListener('click', handleSend);

// ── New Chat ──────────────────────────────────────────────────────────────

async function newChat() {
  history = [];
  await chrome.storage.local.remove('chatHistory');
  chat.innerHTML = '';
  const welcome = document.createElement('div');
  welcome.id = 'welcome';
  welcome.className = 'welcome';
  welcome.innerHTML = `
    <h2 class="welcome-title">How can I help you today?</h2>
    <p class="welcome-desc">Chat, navigate web tasks, or reference open tabs with <code>@tabname</code>. Fully private and customizable.</p>
    <div class="suggestions">
      <button class="suggestion" data-q="Summarize @">Summarize a tab</button>
      <button class="suggestion" data-q="What are the key points in @">Key points</button>
      <button class="suggestion" data-q="Explain @">Explain this page</button>
    </div>`;
  chat.appendChild(welcome);
  attachSuggestionListeners(welcome);
  clearInput();
}

function attachSuggestionListeners(parent) {
  parent.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      setInputPlain(btn.dataset.q);
      input.focus();
      updateSend();
    });
  });
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
  // Theme toggle
  document.getElementById('theme-btn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-mode') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-mode', next);
    localStorage.setItem('la-theme', next);
  });

  // Top toolbar buttons
  document.getElementById('new-chat-btn').addEventListener('click', newChat);

  // Settings: open full settings page in a tab
  settingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  });

  // Agent mode switcher
  agentBtn.addEventListener('click', () => {
    agentMode = !agentMode;
    agentBtn.classList.toggle('active', agentMode);
    agentBtnText.textContent = agentMode ? 'Agent' : 'Chat';
    input.dataset.placeholder = agentMode ? 'Describe a task for the agent…' : 'Ask anything…';
  });

  // Dictation button & Unlock Microphone Handlers
  dictateBtn.addEventListener('click', toggleDictation);
  if (sidepanelUnlockMicBtn) {
    sidepanelUnlockMicBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html?unlockMic=1') });
      hideMicBlockedBanner();
    });
  }
  if (dismissMicBannerBtn) {
    dismissMicBannerBtn.addEventListener('click', hideMicBlockedBanner);
  }

  try {
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'microphone' }).then(perm => {
        if (perm.state === 'granted') hideMicBlockedBanner();
        perm.onchange = () => {
          if (perm.state === 'granted') hideMicBlockedBanner();
        };
      }).catch(() => {});
    }
  } catch {}

  // Model Shelf toggle
  modelShelf.addEventListener('click', toggleModelPopover);
  modelShelf.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleModelPopover();
    }
  });

  refreshModelsBtn.addEventListener('click', async e => {
    e.stopPropagation();
    refreshModelsBtn.style.transform = 'rotate(180deg)';
    await loadModels();
    setTimeout(() => { refreshModelsBtn.style.transform = ''; }, 300);
  });

  // Dismiss model popover on click outside
  document.addEventListener('click', e => {
    if (!modelShelf.contains(e.target) && !modelPopover.contains(e.target)) {
      closeModelPopover();
    }
  });

  // Reconnect button (if present)
  const reconnectBtn = document.getElementById('reconnect-btn');
  if (reconnectBtn) {
    reconnectBtn.addEventListener('click', async () => {
      if (statusDot) statusDot.className = 'dot connecting';
      if (statusText) statusText.textContent = 'Connecting…';
      await checkConn();
      await loadModels();
    });
  }

  // Initial welcome suggestion buttons
  attachSuggestionListeners(document);

  await loadTabs();
  setInterval(loadTabs, 10000);
  await loadMcpServers();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.mcpServers) {
      allMcpServers = Array.isArray(changes.mcpServers.newValue) ? changes.mcpServers.newValue : [];
    }
  });
  await loadModels();
  checkConn();
  setInterval(checkConn, 6000);
  await loadHistory();
}

init();
