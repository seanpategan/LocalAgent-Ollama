// Local-Agent Ollama — content script

// ── Page content extraction ───────────────────────────────────────────────

function extractPageContent() {
  try {
    const selectors = ['article','main','[role="main"]','.article-body','.article-content','.post-content','#article-body','#main-content','#content'];
    let el = null;
    for (const s of selectors) { el = document.querySelector(s); if (el) break; }
    if (!el) el = document.body;

    let content = (el.innerText || el.textContent || '')
      .replace(/\t/g,' ').replace(/ {2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    if (content.length > 10000) content = content.slice(0, 10000) + '\n[…truncated]';

    return { success: true, data: { title: document.title, url: location.href, content, contentLength: content.length } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Accessibility tree ────────────────────────────────────────────────────

function buildPageTree() {
  window.__la_refs = {};
  let counter = 0;

  const TAG_ROLES = { a:'link', button:'button', input:'input', textarea:'textbox', select:'combobox', h1:'heading', h2:'heading', h3:'heading', img:'img', form:'form' };

  function getRole(el) { return el.getAttribute('role') || TAG_ROLES[el.tagName.toLowerCase()] || null; }

  function getLabel(el) {
    return (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('title') || el.innerText?.trim().replace(/\s+/g,' ') || '').slice(0, 80);
  }

  function isInteractive(el) {
    const t = el.tagName.toLowerCase();
    return ['a','button','input','select','textarea'].includes(t)
      || el.getAttribute('role') === 'button'
      || el.getAttribute('role') === 'link'
      || el.getAttribute('role') === 'textbox'
      || el.isContentEditable
      || el.getAttribute('onclick') !== null
      || (el.getAttribute('tabindex') !== null && el.getAttribute('tabindex') !== '-1');
  }

  function walk(el, depth) {
    if (depth > 12 || !el?.tagName) return '';
    const t = el.tagName.toLowerCase();
    if (['script','style','noscript','head','svg','canvas','iframe'].includes(t)) return '';
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return '';

    const rect = el.getBoundingClientRect();
    const isContainer = ['div','section','main','article','form','ul','ol','li','nav'].includes(t);
    if (rect.width === 0 && rect.height === 0 && !isContainer) return '';

    let out = '';
    if (isInteractive(el)) {
      const label = getLabel(el);
      if (label) {
        const id = `ref_${counter++}`;
        window.__la_refs[id] = el;
        const role = getRole(el) || t;
        const extra = t === 'input' ? ` [type=${el.type||'text'}]` : t === 'a' && el.href ? ` [href=${el.href.slice(0,60)}]` : '';
        const editable = el.isContentEditable ? ' [editable]' : '';
      out += `${'  '.repeat(depth)}[${id}] ${role}${extra}${editable}: "${label}"\n`;
      }
    }
    for (const child of el.children) out += walk(child, depth + 1);
    return out;
  }

  let tree = walk(document.body, 0);
  if (tree.length > 8000) {
    // Keep first 4000 (nav/main actions) + last 3000 (dialogs/modals rendered at end of DOM)
    tree = tree.slice(0, 4000) + '\n…[middle truncated]…\n' + tree.slice(-3000);
  }
  return `Page: ${document.title}\nURL: ${location.href}\n\n${tree || '(no interactive elements found)'}`;
}

// ── Tool execution ────────────────────────────────────────────────────────

function runTool(tool, args) {
  const refs = window.__la_refs || {};
  try {
    if (tool === 'click') {
      const el = refs[args.refId];
      if (!el) return { success: false, error: `${args.refId} not found — try getTree again` };
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      el.focus(); el.click();
      return { success: true };
    }
    if (tool === 'type') {
      const el = refs[args.refId];
      if (!el) return { success: false, error: `${args.refId} not found` };
      el.focus();
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, args.text); else el.value = args.text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, args.text);
      } else {
        el.value = args.text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { success: true };
    }
    if (tool === 'scroll') {
      window.scrollBy({ top: args.direction === 'up' ? -500 : 500, behavior: 'smooth' });
      return { success: true };
    }
    if (tool === 'key') {
      const el = document.activeElement || document.body;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: args.key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup',   { key: args.key, bubbles: true }));
      return { success: true };
    }
    return { success: false, error: `Unknown tool: ${tool}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Message listener ──────────────────────────────────────────────────────

try {
  chrome.runtime.onMessage.addListener((req, _sender, respond) => {
    if (req.action === 'extractContent') { respond(extractPageContent()); return true; }
    if (req.action === 'getTree')        { try { respond({ success: true, tree: buildPageTree() }); } catch (e) { respond({ success: false, error: e.message }); } return true; }
    if (req.action === 'executeTool')    { respond(runTool(req.tool, req.args)); return true; }
  });
} catch (e) {
  // Extension was reloaded — this content script is stale, ignore silently
}
