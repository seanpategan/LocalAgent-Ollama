// Local-Agent Ollama — Settings Controller
import { MCPClient } from '/mcp-client.js';

const ollamaHostInput      = document.getElementById('ollama-host');
const testOllamaBtn        = document.getElementById('test-ollama-btn');
const ollamaStatusBadge    = document.getElementById('ollama-status-badge');
const openrouterEnabled    = document.getElementById('openrouter-enabled');
const openrouterFields     = document.getElementById('openrouter-fields');
const openrouterKeyInput       = document.getElementById('openrouter-key');
const openrouterModelInput     = document.getElementById('openrouter-model');
const addOpenrouterModelBtn    = document.getElementById('add-openrouter-model-btn');
const addModelStatus           = document.getElementById('add-model-status');
const openrouterModelsContainer = document.getElementById('openrouter-models-container');
const openrouterModelsList     = document.getElementById('openrouter-models-list');
const verifyOpenrouterBtn      = document.getElementById('verify-openrouter-btn');
const toggleKeyBtn         = document.getElementById('toggle-key-btn');

// MCP Elements
const mcpServerNameInput   = document.getElementById('mcp-server-name');
const mcpAuthTypeSelect    = document.getElementById('mcp-auth-type');
const mcpServerUrlInput    = document.getElementById('mcp-server-url');
const addMcpBtn            = document.getElementById('add-mcp-btn');
const mcpOauthGroup        = document.getElementById('mcp-oauth-group');
const startOauthBtn        = document.getElementById('start-oauth-btn');
const toggleManualTokenBtn = document.getElementById('toggle-manual-token-btn');
const mcpOauthManualContainer = document.getElementById('mcp-oauth-manual-container');
const mcpOauthTokenInput   = document.getElementById('mcp-oauth-token-input');
const oauthBadgeStatus     = document.getElementById('oauth-badge-status');
const mcpBearerGroup       = document.getElementById('mcp-bearer-group');
const mcpApiKeyInput       = document.getElementById('mcp-api-key');
const toggleMcpKeyBtn      = document.getElementById('toggle-mcp-key-btn');
const mcpCustomHeaderGroup = document.getElementById('mcp-custom-header-group');
const mcpHeaderNameInput   = document.getElementById('mcp-header-name');
const mcpHeaderValInput    = document.getElementById('mcp-header-val');
const mcpDiscoveryStatus   = document.getElementById('mcp-discovery-status');
const loadMcpDemoBtn       = document.getElementById('load-mcp-demo-btn');
const loadMcpNotionBtn     = document.getElementById('load-mcp-notion-btn');
const mcpServerCount       = document.getElementById('mcp-server-count');
const mcpServersList       = document.getElementById('mcp-servers-list');

// Microphone Elements
const micStatusBadge       = document.getElementById('mic-status-badge');
const unlockMicBtn         = document.getElementById('unlock-mic-btn');
const chromeMicSettingsBtn = document.getElementById('chrome-mic-settings-btn');
const micHelpBox           = document.getElementById('mic-help-box');

let configuredMcpServers = [];
const maxStepsSlider       = document.getElementById('max-steps-slider');
const maxStepsDisplay      = document.getElementById('max-steps-display');
const stepIncrementSelect  = document.getElementById('step-increment');
const exportHistoryBtn     = document.getElementById('export-history-btn');
const clearHistoryBtn      = document.getElementById('clear-history-btn');
const themeBtn             = document.getElementById('theme-btn');
const toastEl              = document.getElementById('toast');
const toastMsg             = document.getElementById('toast-msg');

let toastTimer = null;
let connectedOpenrouterModels = [];

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function showToast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  toastMsg.textContent = msg;
  toastEl.style.display = 'block';
  toastTimer = setTimeout(() => {
    toastEl.style.display = 'none';
  }, 2200);
}

function renderOpenrouterModels() {
  if (!connectedOpenrouterModels.length) {
    openrouterModelsContainer.style.display = 'none';
    openrouterModelsList.innerHTML = '';
    return;
  }

  openrouterModelsContainer.style.display = 'flex';
  openrouterModelsList.innerHTML = '';

  connectedOpenrouterModels.forEach(modelName => {
    const chip = document.createElement('div');
    chip.className = 'connected-model-chip';
    chip.innerHTML = `
      <span class="chip-dot"></span>
      <span class="chip-name">${esc(modelName)}</span>
      <button class="chip-remove-btn" type="button" title="Remove model">×</button>
    `;

    chip.querySelector('.chip-remove-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      connectedOpenrouterModels = connectedOpenrouterModels.filter(m => m !== modelName);
      await chrome.storage.local.set({ openrouterModels: connectedOpenrouterModels });
      renderOpenrouterModels();
      showToast(`Removed ${modelName}`);
    });

    openrouterModelsList.appendChild(chip);
  });
}

// ── Storage Helpers ───────────────────────────────────────────────────────

async function saveSettings() {
  const activeProvider = document.querySelector('input[name="activeProvider"]:checked')?.value || 'ollama';
  const ollamaHost = ollamaHostInput.value.trim().replace(/\/+$/, '') || 'http://127.0.0.1:11434';
  const openrouterKey = openrouterKeyInput.value.trim();
  const openrouterModel = openrouterModelInput.value.trim() || 'anthropic/claude-3.5-sonnet';
  const isOREnabled = openrouterEnabled.checked;
  const maxSteps = parseInt(maxStepsSlider.value, 10) || 20;
  const stepIncrement = parseInt(stepIncrementSelect.value, 10) || 10;

  await chrome.storage.local.set({
    activeProvider,
    ollamaHost,
    openrouterApiKey: openrouterKey,
    openrouterModel,
    openrouterModels: connectedOpenrouterModels,
    openrouterEnabled: isOREnabled,
    maxSteps,
    stepIncrement
  });

  showToast('Settings saved');
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'activeProvider',
    'ollamaHost',
    'openrouterApiKey',
    'openrouterModel',
    'openrouterModels',
    'openrouterEnabled',
    'maxSteps',
    'stepIncrement'
  ]);

  if (data.activeProvider) {
    const radio = document.querySelector(`input[name="activeProvider"][value="${data.activeProvider}"]`);
    if (radio) radio.checked = true;
  }

  if (data.ollamaHost) {
    ollamaHostInput.value = data.ollamaHost;
  }

  if (data.openrouterApiKey) {
    openrouterKeyInput.value = data.openrouterApiKey;
  }

  if (data.openrouterModel) {
    openrouterModelInput.value = data.openrouterModel;
  }

  if (Array.isArray(data.openrouterModels) && data.openrouterModels.length) {
    connectedOpenrouterModels = [...data.openrouterModels];
  } else if (data.openrouterModel && data.openrouterApiKey) {
    connectedOpenrouterModels = [data.openrouterModel];
  } else {
    connectedOpenrouterModels = [];
  }
  renderOpenrouterModels();

  if (data.openrouterEnabled !== undefined) {
    openrouterEnabled.checked = data.openrouterEnabled;
  }

  const steps = data.maxSteps || 20;
  maxStepsSlider.value = steps;
  maxStepsDisplay.textContent = `${steps} steps`;

  if (data.stepIncrement) {
    stepIncrementSelect.value = data.stepIncrement;
  }

  testOllama();
  await renderMcpServers();
  await checkMicPermission();

  if (window.location.search.includes('unlockMic') || window.location.hash.includes('mic')) {
    document.getElementById('microphone-section')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(requestMicAccess, 350);
  }
}

// ── MCP Server Management ─────────────────────────────────────────────────

function updateMcpAuthFields() {
  const type = mcpAuthTypeSelect.value;
  mcpBearerGroup.style.display = type === 'bearer' ? 'flex' : 'none';
  mcpCustomHeaderGroup.style.display = type === 'custom' ? 'flex' : 'none';
  if (mcpOauthGroup) mcpOauthGroup.style.display = type === 'oauth' ? 'flex' : 'none';
}

async function renderMcpServers() {
  configuredMcpServers = await MCPClient.getServers();
  mcpServerCount.textContent = `${configuredMcpServers.length} server${configuredMcpServers.length === 1 ? '' : 's'}`;

  if (!configuredMcpServers.length) {
    mcpServersList.innerHTML = `<div class="model-empty">No MCP servers connected. Add one above to enable <code>/</code> tool invocation in chat.</div>`;
    return;
  }

  mcpServersList.innerHTML = '';
  configuredMcpServers.forEach(server => {
    const card = document.createElement('div');
    card.className = 'mcp-server-card';
    const toolCount = server.tools?.length || 0;

    let toolsHtml = '';
    if (server.tools && server.tools.length) {
      toolsHtml = `
        <div class="mcp-tools-container">
          ${server.tools.map(t => `
            <span class="mcp-tool-pill" title="${esc(t.description || t.name)}">
              ${esc(t.name)}
              ${t.description ? `<span class="tool-desc">— ${esc(t.description.slice(0, 32))}${t.description.length > 32 ? '…' : ''}</span>` : ''}
            </span>
          `).join('')}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="mcp-card-top">
        <div class="mcp-card-identity">
          <span class="status-dot connected"></span>
          <span class="mcp-server-name">${esc(server.name)}</span>
          ${server.authType === 'oauth' ? '<span class="mcp-auth-badge oauth">OAuth</span>' : ''}
          <span class="mcp-tool-count-badge">${toolCount} tool${toolCount === 1 ? '' : 's'}</span>
        </div>
        <div class="mcp-server-actions">
          ${server.authType === 'oauth' ? '<button class="action-btn secondary open-oauth-tab-action" type="button" title="Re-authorize Notion Workspace">Re-auth</button>' : ''}
          <button class="action-btn secondary refresh-mcp-btn" type="button" title="Refresh & re-discover tools">Rediscover</button>
          <button class="action-btn danger delete-mcp-btn" type="button" title="Remove MCP server">Delete</button>
        </div>
      </div>
      <div class="mcp-card-url">${esc(server.originalUrl || server.url)}</div>
      ${toolsHtml}
    `;

    card.querySelector('.open-oauth-tab-action')?.addEventListener('click', async () => {
      const btn = card.querySelector('.open-oauth-tab-action');
      btn.disabled = true;
      btn.textContent = 'Authorizing…';
      try {
        const refreshed = await MCPClient.connectAndDiscover(server, (msg) => {
          showToast(msg);
        });
        await MCPClient.addServer(refreshed);
        await renderMcpServers();
        showToast(`Authorized & connected to ${server.name}!`);
      } catch (e) {
        alert(`OAuth authorization failed: ${e.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Re-auth';
      }
    });

    card.querySelector('.refresh-mcp-btn').addEventListener('click', async () => {
      const btn = card.querySelector('.refresh-mcp-btn');
      btn.disabled = true;
      btn.textContent = 'Discovering…';
      try {
        const refreshed = await MCPClient.connectAndDiscover(server);
        await MCPClient.addServer(refreshed);
        await renderMcpServers();
        showToast(`Refreshed ${server.name} (${refreshed.tools.length} tools)`);
      } catch (err) {
        alert(`Discovery failed: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Rediscover';
      }
    });

    card.querySelector('.delete-mcp-btn').addEventListener('click', async () => {
      if (confirm(`Remove MCP server "${server.name}"?`)) {
        await MCPClient.removeServer(server.id);
        await renderMcpServers();
        showToast(`Removed MCP server ${server.name}`);
      }
    });

    mcpServersList.appendChild(card);
  });
}

async function handleAddMCPServer() {
  const name = mcpServerNameInput.value.trim();
  const url = mcpServerUrlInput.value.trim();
  const authType = mcpAuthTypeSelect.value;
  const apiKey = mcpApiKeyInput.value.trim();
  const manualToken = mcpOauthTokenInput ? mcpOauthTokenInput.value.trim() : '';
  const customHeaderName = mcpHeaderNameInput.value.trim();
  const customHeaderValue = mcpHeaderValInput.value.trim();

  if (!name) {
    mcpDiscoveryStatus.style.display = 'block';
    mcpDiscoveryStatus.className = 'model-status-text error';
    mcpDiscoveryStatus.textContent = 'Please enter a name for this MCP server.';
    mcpServerNameInput.focus();
    return;
  }

  if (!url) {
    mcpDiscoveryStatus.style.display = 'block';
    mcpDiscoveryStatus.className = 'model-status-text error';
    mcpDiscoveryStatus.textContent = 'Please enter the MCP server endpoint URL.';
    mcpServerUrlInput.focus();
    return;
  }

  addMcpBtn.disabled = true;
  if (startOauthBtn) startOauthBtn.disabled = true;
  addMcpBtn.textContent = 'Connecting…';
  mcpDiscoveryStatus.style.display = 'block';
  mcpDiscoveryStatus.className = 'model-status-text loading';
  mcpDiscoveryStatus.textContent = `Connecting to ${url}…`;

  try {
    const discovered = await MCPClient.connectAndDiscover({
      name,
      url,
      authType,
      accessToken: authType === 'oauth' ? manualToken : '',
      apiKey,
      customHeaderName,
      customHeaderValue
    }, (statusMsg) => {
      mcpDiscoveryStatus.textContent = statusMsg;
    });

    await MCPClient.addServer(discovered);
    await renderMcpServers();

    if (oauthBadgeStatus && discovered.authType === 'oauth') {
      oauthBadgeStatus.textContent = '✓ Authorized';
      oauthBadgeStatus.className = 'oauth-badge-pill connected';
    }

    mcpDiscoveryStatus.className = 'model-status-text success';
    mcpDiscoveryStatus.textContent = `✓ Connected! Discovered ${discovered.tools.length} tool${discovered.tools.length === 1 ? '' : 's'}: ${discovered.tools.map(t => t.name).join(', ') || 'No tools exposed'}`;

    mcpServerNameInput.value = '';
    mcpServerUrlInput.value = '';
    mcpApiKeyInput.value = '';
    if (mcpOauthTokenInput) mcpOauthTokenInput.value = '';
    mcpHeaderValInput.value = '';
    showToast(`MCP Server "${discovered.name}" added`);
  } catch (err) {
    mcpDiscoveryStatus.className = 'model-status-text error';
    mcpDiscoveryStatus.textContent = `✗ Connection failed: ${err.message}`;
  } finally {
    addMcpBtn.disabled = false;
    if (startOauthBtn) startOauthBtn.disabled = false;
    addMcpBtn.textContent = 'Connect & Discover';
  }
}

// ── Test Connections ──────────────────────────────────────────────────────

async function testOllama() {
  const host = ollamaHostInput.value.trim().replace(/\/+$/, '') || 'http://127.0.0.1:11434';
  const dot = ollamaStatusBadge.querySelector('.status-dot');
  const text = ollamaStatusBadge.querySelector('.status-text');

  dot.className = 'status-dot';
  text.textContent = 'Testing…';

  try {
    const res = await fetch(`${host}/api/tags`);
    if (res.ok) {
      const data = await res.json();
      const count = data.models?.length || 0;
      dot.className = 'status-dot connected';
      text.textContent = `Connected (${count} model${count === 1 ? '' : 's'})`;
    } else {
      dot.className = 'status-dot disconnected';
      text.textContent = `Error ${res.status}`;
    }
  } catch {
    dot.className = 'status-dot disconnected';
    text.textContent = 'Offline';
  }
}

async function verifyOpenrouter() {
  const key = openrouterKeyInput.value.trim();
  if (!key) {
    alert('Please enter an OpenRouter API key first.');
    return;
  }

  verifyOpenrouterBtn.textContent = 'Checking…';
  verifyOpenrouterBtn.disabled = true;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      const limit = data.data?.limit ? `$${data.data.limit}` : 'Active';
      alert(`OpenRouter Key Verified!\n\nStatus: Valid\nLabel: ${data.data?.label || 'API Key'}`);
      saveSettings();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`OpenRouter verification failed: ${err.error?.message || res.statusText}`);
    }
  } catch (e) {
    alert(`Could not reach OpenRouter: ${e.message}`);
  } finally {
    verifyOpenrouterBtn.textContent = 'Verify';
    verifyOpenrouterBtn.disabled = false;
  }
}

async function addOpenrouterModel() {
  const key = openrouterKeyInput.value.trim();
  const rawModel = openrouterModelInput.value.trim();

  if (!key) {
    addModelStatus.style.display = 'block';
    addModelStatus.className = 'model-status-text error';
    addModelStatus.textContent = 'Please enter an OpenRouter API key above first.';
    openrouterKeyInput.focus();
    return;
  }

  if (!rawModel) {
    addModelStatus.style.display = 'block';
    addModelStatus.className = 'model-status-text error';
    addModelStatus.textContent = 'Please specify a model identifier (e.g. anthropic/claude-3.5-sonnet).';
    openrouterModelInput.focus();
    return;
  }

  addOpenrouterModelBtn.disabled = true;
  addOpenrouterModelBtn.textContent = 'Checking…';
  addModelStatus.style.display = 'block';
  addModelStatus.className = 'model-status-text loading';
  addModelStatus.textContent = `Verifying connection for "${rawModel}"…`;

  try {
    // 1. Verify key
    const keyRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    if (!keyRes.ok) {
      const err = await keyRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Invalid API Key');
    }

    // 2. Check model catalog on OpenRouter
    let modelName = rawModel;
    try {
      const modelsRes = await fetch('https://openrouter.ai/api/v1/models');
      if (modelsRes.ok) {
        const mData = await modelsRes.json();
        const found = mData.data?.find(m => m.id.toLowerCase() === rawModel.toLowerCase());
        if (found) {
          modelName = found.id;
        }
      }
    } catch {}

    if (!connectedOpenrouterModels.includes(modelName)) {
      connectedOpenrouterModels.push(modelName);
    }

    openrouterEnabled.checked = true;
    openrouterModelInput.value = modelName;

    await chrome.storage.local.set({
      openrouterEnabled: true,
      openrouterApiKey: key,
      openrouterModel: modelName,
      openrouterModels: connectedOpenrouterModels
    });

    addModelStatus.className = 'model-status-text success';
    addModelStatus.textContent = `✓ Model verified and connected: ${modelName}`;
    renderOpenrouterModels();
    showToast(`Connected ${modelName}`);
  } catch (err) {
    addModelStatus.className = 'model-status-text error';
    addModelStatus.textContent = `✗ Verification failed: ${err.message}`;
  } finally {
    addOpenrouterModelBtn.disabled = false;
    addOpenrouterModelBtn.textContent = 'Add';
  }
}

// ── Microphone & Dictation Management ─────────────────────────────────────

async function checkMicPermission() {
  if (!micStatusBadge) return 'unknown';
  try {
    if (navigator.permissions?.query) {
      const perm = await navigator.permissions.query({ name: 'microphone' });
      updateMicBadge(perm.state);
      perm.onchange = () => updateMicBadge(perm.state);
      return perm.state;
    }
  } catch {}
  return 'unknown';
}

function updateMicBadge(state) {
  if (!micStatusBadge) return;
  const dot = micStatusBadge.querySelector('.status-dot');
  const text = micStatusBadge.querySelector('.status-text');
  if (state === 'granted') {
    dot.className = 'status-dot connected';
    text.textContent = 'Active / Unblocked';
    if (unlockMicBtn) {
      unlockMicBtn.textContent = 'Microphone Unlocked ✓';
      unlockMicBtn.classList.add('secondary');
    }
    if (micHelpBox) micHelpBox.style.display = 'none';
  } else if (state === 'denied') {
    dot.className = 'status-dot disconnected';
    text.textContent = 'Blocked by Chrome';
    if (unlockMicBtn) {
      unlockMicBtn.textContent = 'Unlock Microphone';
      unlockMicBtn.classList.remove('secondary');
    }
    if (micHelpBox) micHelpBox.style.display = 'flex';
  } else {
    dot.className = 'status-dot';
    text.textContent = 'Permission Needed';
    if (unlockMicBtn) {
      unlockMicBtn.textContent = 'Unlock Microphone';
      unlockMicBtn.classList.remove('secondary');
    }
  }
}

async function requestMicAccess() {
  if (!unlockMicBtn) return;
  unlockMicBtn.disabled = true;
  unlockMicBtn.textContent = 'Requesting…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    updateMicBadge('granted');
    showToast('✓ Microphone unblocked! Dictation is now ready in the side panel.');
  } catch (err) {
    console.warn('Microphone permission request error:', err);
    updateMicBadge('denied');
    if (micHelpBox) micHelpBox.style.display = 'flex';
    alert('Microphone is blocked by Chrome.\n\nPlease click the tune icon / lock next to the address bar and switch Microphone to "Allow".');
  } finally {
    unlockMicBtn.disabled = false;
  }
}

// ── Export & Clear History ────────────────────────────────────────────────

async function exportChat() {
  const { chatHistory } = await chrome.storage.local.get('chatHistory');
  if (!chatHistory?.length) {
    alert('No conversation history to export.');
    return;
  }

  let out = '# Local-Agent Ollama Conversation\n\n';
  chatHistory.forEach(m => {
    out += `**${m.role === 'user' ? 'You' : 'Agent'}** _(${new Date(m.timestamp || Date.now()).toLocaleString()})_\n\n${m.text}\n\n---\n\n`;
  });

  const url = URL.createObjectURL(new Blob([out], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `local-agent-export-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function clearChatHistory() {
  if (confirm('Are you sure you want to delete all saved conversations? This cannot be undone.')) {
    await chrome.storage.local.remove('chatHistory');
    showToast('Conversation history cleared');
  }
}

// ── Event Listeners ───────────────────────────────────────────────────────

document.querySelectorAll('input[name="activeProvider"]').forEach(radio => {
  radio.addEventListener('change', saveSettings);
});

ollamaHostInput.addEventListener('change', () => {
  saveSettings();
  testOllama();
});
testOllamaBtn.addEventListener('click', testOllama);

openrouterEnabled.addEventListener('change', saveSettings);
openrouterKeyInput.addEventListener('change', saveSettings);
openrouterModelInput.addEventListener('change', saveSettings);
verifyOpenrouterBtn.addEventListener('click', verifyOpenrouter);
addOpenrouterModelBtn.addEventListener('click', addOpenrouterModel);
openrouterModelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addOpenrouterModel();
  }
});

toggleKeyBtn.addEventListener('click', () => {
  openrouterKeyInput.type = openrouterKeyInput.type === 'password' ? 'text' : 'password';
});

// MCP Event Listeners
mcpAuthTypeSelect.addEventListener('change', updateMcpAuthFields);
toggleMcpKeyBtn.addEventListener('click', () => {
  mcpApiKeyInput.type = mcpApiKeyInput.type === 'password' ? 'text' : 'password';
});
addMcpBtn.addEventListener('click', handleAddMCPServer);
mcpServerUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleAddMCPServer();
  }
});
mcpServerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleAddMCPServer();
  }
});
if (loadMcpDemoBtn) {
  loadMcpDemoBtn.addEventListener('click', () => {
    mcpServerNameInput.value = 'Demo Tools';
    mcpServerUrlInput.value = 'browser://demo-tools';
    mcpAuthTypeSelect.value = 'none';
    updateMcpAuthFields();
    handleAddMCPServer();
  });
}
if (loadMcpNotionBtn) {
  loadMcpNotionBtn.addEventListener('click', () => {
    mcpServerNameInput.value = 'Notion';
    mcpServerUrlInput.value = 'https://mcp.notion.com/mcp';
    mcpAuthTypeSelect.value = 'oauth';
    updateMcpAuthFields();
    mcpServerUrlInput.focus();
  });
}
if (startOauthBtn) {
  startOauthBtn.addEventListener('click', () => {
    if (!mcpServerNameInput.value.trim()) mcpServerNameInput.value = 'Notion';
    if (!mcpServerUrlInput.value.trim()) mcpServerUrlInput.value = 'https://mcp.notion.com/mcp';
    mcpAuthTypeSelect.value = 'oauth';
    updateMcpAuthFields();
    handleAddMCPServer();
  });
}
if (toggleManualTokenBtn) {
  toggleManualTokenBtn.addEventListener('click', () => {
    if (mcpOauthManualContainer) {
      const isHidden = mcpOauthManualContainer.style.display === 'none';
      mcpOauthManualContainer.style.display = isHidden ? 'flex' : 'none';
      if (isHidden && mcpOauthTokenInput) mcpOauthTokenInput.focus();
    }
  });
}

// Microphone Listeners
if (unlockMicBtn) {
  unlockMicBtn.addEventListener('click', requestMicAccess);
}
if (chromeMicSettingsBtn) {
  chromeMicSettingsBtn.addEventListener('click', () => {
    try {
      chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
    } catch {
      if (micHelpBox) micHelpBox.style.display = 'flex';
    }
  });
}

maxStepsSlider.addEventListener('input', () => {
  maxStepsDisplay.textContent = `${maxStepsSlider.value} steps`;
});
maxStepsSlider.addEventListener('change', saveSettings);
stepIncrementSelect.addEventListener('change', saveSettings);

exportHistoryBtn.addEventListener('click', exportChat);
clearHistoryBtn.addEventListener('click', clearChatHistory);

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-mode') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-mode', current);
  localStorage.setItem('la-theme', current);
});

loadSettings();
