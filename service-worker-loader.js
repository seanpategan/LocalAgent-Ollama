// Local-Agent Ollama — background service worker
// (loaded as module for Chrome compatibility with cached registration)

// Try localhost first, fall back to 127.0.0.1 (some systems resolve differently)
let OLLAMA = 'http://localhost:11434';

async function findOllama() {
  for (const base of ['http://localhost:11434', 'http://127.0.0.1:11434']) {
    try {
      const r = await fetch(`${base}/api/tags`);
      if (r.ok) { OLLAMA = base; return base; }
    } catch {}
  }
  return null;
}

// ── Ollama helpers ────────────────────────────────────────────────────────

async function ollamaModels() {
  const base = await findOllama();
  if (!base) throw new Error('Ollama not reachable. Make sure it is running:\n  ollama serve\n\nIf it is running, restart it with:\n  OLLAMA_ORIGINS="*" ollama serve');
  const r = await fetch(`${base}/api/tags`);
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const d = await r.json();
  return d.models || [];
}

async function ollamaPing() {
  const base = await findOllama();
  return base !== null;
}

function ollamaError(status) {
  if (status === 403) return `Ollama blocked the request (403).\n\nOllama rejects requests from browser extensions by default.\nFix: quit Ollama, then run it with:\n\n  OLLAMA_ORIGINS="*" ollama serve\n\nOr set it permanently:\n  launchctl setenv OLLAMA_ORIGINS "*"  (then restart Ollama)`;
  return `Ollama returned ${status}`;
}

/** Streaming chat — calls onChunk(token) for each piece, returns full text. */
async function ollamaChat(model, messages, onChunk) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true })
  });
  if (!r.ok) throw new Error(ollamaError(r.status));

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split('\n')) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        const token = d.message?.content || '';
        if (token) { full += token; onChunk?.(token); }
        if (d.done) return full;
      } catch {}
    }
  }
  return full;
}

/** Non-streaming single call for agent steps. */
async function ollamaOnce(model, messages) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false })
  });
  if (!r.ok) throw new Error(ollamaError(r.status));
  const d = await r.json();
  return d.message?.content?.trim() || '';
}

// ── Tab helpers ───────────────────────────────────────────────────────────

async function getAllTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active, favIconUrl: t.favIconUrl || '' }));
}

async function extractTab(tabId) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return '[Tab not found]'; }

  const url = tab.url || '';
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('data:'))
    return '[Cannot access this page]';

  // Try content script first
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'extractContent' });
    if (res?.success && res.data?.content?.length > 200)
      return `Title: ${res.data.title}\nURL: ${res.data.url}\n\n${res.data.content}`;
  } catch {}

  // Fallback: inject extraction script directly (works even if content script not loaded)
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const selectors = ['article','main','[role="main"]','.article-body','.article-content','.post-content','#article-body','#main-content','#content'];
        let el = null;
        for (const s of selectors) { el = document.querySelector(s); if (el) break; }
        if (!el) el = document.body;
        let content = (el.innerText || el.textContent || '')
          .replace(/\t/g,' ').replace(/ {2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
        if (content.length > 10000) content = content.slice(0, 10000) + '\n[…truncated]';
        return { title: document.title, url: location.href, content };
      }
    });
    const data = results?.[0]?.result;
    if (data?.content?.length > 200)
      return `Title: ${data.title}\nURL: ${data.url}\n\n${data.content}`;
  } catch {}

  // Last fallback: fetch directly
  try {
    const res = await fetch(url);
    if (!res.ok) return '[Could not fetch page]';
    let html = await res.text();
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, '\n$2\n')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
      .replace(/\n{3,}/g, '\n\n').trim();
    if (html.length > 8000) html = html.slice(0, 8000) + '\n[…truncated]';
    if (html.length > 200) return `Title: ${tab.title}\nURL: ${url}\n\n${html}`;
  } catch {}

  return '[Could not extract page content]';
}

// ── Message routing ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((req, _sender, respond) => {

  if (req.action === 'getModels') {
    ollamaModels()
      .then(models => respond({ success: true, models }))
      .catch(e => respond({ success: false, error: e.message }));
    return true;
  }

  if (req.action === 'checkConnection') {
    ollamaPing()
      .then(connected => respond({ connected }))
      .catch(() => respond({ connected: false }));
    return true;
  }

  if (req.action === 'getTabs') {
    getAllTabs()
      .then(tabs => respond({ success: true, tabs }))
      .catch(() => respond({ success: false, tabs: [] }));
    return true;
  }

  if (req.action === 'queryStream') {
    handleStreamQuery(req.data).catch(console.error);
    respond({ success: true });
    return true;
  }

  if (req.action === 'agentTask') {
    handleAgentTask(req.data).catch(console.error);
    respond({ success: true });
    return true;
  }
});

// ── Streaming chat handler ────────────────────────────────────────────────

async function handleStreamQuery(data) {
  const { query, model, mentionedTabs = [], history = [], messageId } = data;

  const send = (action, extra) =>
    chrome.runtime.sendMessage({ action, messageId, ...extra }).catch(() => {});

  try {
    // Build system + context
    let system = 'You are a helpful assistant.';
    let userContent = query;

    if (mentionedTabs.length) {
      const pages = await Promise.all(mentionedTabs.map(t => extractTab(t.id)));
      const ctx = pages.map((p, i) => `=== ${mentionedTabs[i].title} ===\n${p}`).join('\n\n---\n\n');
      system = 'You are a helpful assistant. Use only the page content provided to answer. Do not invent information not found in the content.';
      userContent = `${ctx}\n\n---\nQuestion: ${query}`;
    }

    // Build messages array with conversation history
    const messages = [{ role: 'system', content: system }];
    for (const h of history) {
      messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text });
    }
    messages.push({ role: 'user', content: userContent });

    let full = '';
    await ollamaChat(model, messages, token => {
      full += token;
      send('streamChunk', { chunk: token, fullText: full });
    });

    send('streamComplete', { text: full });
  } catch (e) {
    send('streamError', { error: e.message });
  }
}

// ── Agentic loop ──────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseAction(text) {
  const s = text.replace(/```[\s\S]*?```/g, '').trim();

  let m;
  m = s.match(/^CLICK(?:\s+on)?\s+(ref_\d+)/im);
  if (m) return { name: 'click', args: { refId: m[1] } };

  m = s.match(/^TYPE\s+(ref_\d+)\s+([\s\S]+)/im);
  if (m) return { name: 'type', args: { refId: m[1], text: m[2].trim() } };

  m = s.match(/^SCROLL\s+(down|up)/im);
  if (m) return { name: 'scroll', args: { direction: m[1].toLowerCase() } };

  m = s.match(/^KEY\s+(\S+)/im);
  if (m) return { name: 'key', args: { key: m[1] } };

  m = s.match(/^NAVIGATE\s+(https?:\/\/\S+)/im);
  if (m) return { name: 'navigate', args: { url: m[1] } };

  m = s.match(/^DONE\s+([\s\S]+)/im);
  if (m) return { name: 'done', args: { result: m[1].trim() } };

  return null;
}

async function getTree(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'getTree' });
    if (res?.success) return res.tree;
  } catch {}
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return tab ? `Page: ${tab.title}\nURL: ${tab.url}\n(Could not read elements — try refreshing)` : '(no tab)';
}

async function waitLoad(tabId, ms = 8000) {
  await sleep(400);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || tab.status === 'complete') { await sleep(500); return; }
    await sleep(300);
  }
}

// ── Agent tool definitions ────────────────────────────────────────────────

const agentTools = [
  { type: 'function', function: { name: 'click',    description: 'Click an element on the page',                                   parameters: { type: 'object', properties: { refId: { type: 'string', description: 'ref ID from the page listing, e.g. ref_3' } }, required: ['refId'] } } },
  { type: 'function', function: { name: 'type',     description: 'Type text into an input, textarea, or contenteditable element',   parameters: { type: 'object', properties: { refId: { type: 'string' }, text: { type: 'string' } }, required: ['refId', 'text'] } } },
  { type: 'function', function: { name: 'key',      description: 'Press a keyboard key, e.g. Enter to submit a form',              parameters: { type: 'object', properties: { key: { type: 'string', description: 'Key name: Enter, Tab, Escape, ArrowDown, etc.' } }, required: ['key'] } } },
  { type: 'function', function: { name: 'scroll',   description: 'Scroll the page up or down',                                     parameters: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] } }, required: ['direction'] } } },
  { type: 'function', function: { name: 'navigate', description: 'Navigate to a URL',                                              parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'read',     description: 'Read the visible text content of the current page — use this to find information displayed on the page such as weather, prices, search results, article text, etc.',  parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'done',     description: 'Task complete — return the final answer',                        parameters: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] } } }
];

async function handleAgentTask(data) {
  const { task, model, messageId, maxSteps = 20 } = data;

  const step = (type, content) =>
    chrome.runtime.sendMessage({ action: 'agentStep', messageId, type, content }).catch(() => {});
  const done = text =>
    chrome.runtime.sendMessage({ action: 'agentComplete', messageId, text }).catch(() => {});

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) { done('No active tab found.'); return; }
  const tabId = activeTab.id;

  // Seed the conversation with the initial page state
  const tree = await getTree(tabId);
  const snippet = tree.length > 3500 ? tree.slice(0, 3500) + '\n…[truncated]' : tree;

  // Persistent thread — grows with every action + result, just like Claude
  const messages = [
    { role: 'system', content: `You are a browser automation agent. Use the provided tools to complete tasks step by step. Call done() when you have the final answer.

Rules:
- Ref IDs (ref_0, ref_1, …) change after every action. Never reuse a ref from a previous step — always read the current page state and find the correct ref by its LABEL.
- To use a field: find the element whose label matches what you want (e.g. label "To", "Subject", "Message Body"), then use that ref.
- After clicking a button that opens a dialog or modal, wait for the updated page state and look for new fields by their labels before acting.
- Elements marked [editable] or role=textbox are typeable — use the type tool on them.
- Never scroll when form fields are visible. Never navigate away from a page mid-task unless required.
- To submit a form: click the Send/Submit button by its label, or press Enter.
- After navigating to a page where you need to read information (weather, search results, prices, articles), call read() to get the page text, then call done() with the answer.` },
    { role: 'user', content: `TASK: ${task}\n\nCURRENT PAGE:\n${snippet}` }
  ];

  for (let i = 1; i <= maxSteps; i++) {
    step('thinking', `Step ${i}…`);

    let msg;
    try {
      const r = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, tools: agentTools, stream: false })
      });
      if (!r.ok) throw new Error(ollamaError(r.status));
      msg = (await r.json()).message;
    } catch (e) { step('error', `Model error: ${e.message}`); done('Agent stopped due to an error.'); return; }

    const toolCalls = msg?.tool_calls;

    // No tool calls: model returned plain text — try text parsing, else treat as final answer
    if (!toolCalls?.length) {
      const content = msg?.content?.trim() || '';
      const action = parseAction(content);
      if (action?.name === 'done') { done(action.args.result); return; }
      done(content || 'Task complete.');
      return;
    }

    // Append the assistant turn to the thread
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = tc.function.arguments; // already an object in Ollama (not a JSON string)

      if (name === 'done') { done(args.result); return; }

      const desc = {
        click:    `Click ${args.refId}`,
        type:     `Type "${String(args.text || '').slice(0, 50)}" into ${args.refId}`,
        key:      `Press ${args.key}`,
        scroll:   `Scroll ${args.direction}`,
        navigate: `Navigate to ${String(args.url || '').slice(0, 60)}`
      }[name] || name;
      step('action', desc);

      let toolResult = '';
      try {
        if (name === 'navigate') {
          await chrome.tabs.update(tabId, { url: args.url });
          await waitLoad(tabId);
          toolResult = 'Navigated.';
        } else if (name === 'read') {
          const text = await extractTab(tabId);
          toolResult = text;
        } else {
          const result = await chrome.tabs.sendMessage(tabId, { action: 'executeTool', tool: name, args });
          if (result?.success === false) {
            step('error', result.error);
            toolResult = `Error: ${result.error}`;
          } else {
            toolResult = 'Action completed.';
            await sleep(1500);
          }
        }
      } catch (e) {
        step('error', `Action failed: ${e.message}`);
        toolResult = `Error: ${e.message}`;
      }

      // Include the updated page state in the tool result — model sees what changed
      const newTree = await getTree(tabId);
      const newSnippet = newTree.length > 3000 ? newTree.slice(0, 3000) + '\n…[truncated]' : newTree;
      messages.push({ role: 'tool', content: `${toolResult}\n\nUpdated page:\n${newSnippet}` });
    }
  }

  done(`Reached maximum steps (${maxSteps}).`);
}

// ── Open side panel on icon click ────────────────────────────────────────

chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
});

console.log('[Local-Agent Ollama] background ready');
