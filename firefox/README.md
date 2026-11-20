# Local-Agent Ollama (Firefox Edition)

A private, hybrid AI sidebar browser extension built for **Mozilla Firefox** powered by [Ollama](https://ollama.com) and [OpenRouter](https://openrouter.ai). Chat with any webpage, summarize tabs, invoke Model Context Protocol (MCP) servers, and automate browser tasks with zero local PC backend dependencies.

---

## Firefox Manifest V3 Compatibility

This build is specifically adapted and optimized for **Mozilla Firefox 115+**:
- **Sidebar Integration**: Uses native Firefox `sidebar_action` to dock directly in the Firefox sidebar.
- **Background Event Page**: Configured with `"scripts": ["service-worker-loader.js"], "type": "module"` for full ES module imports.
- **Gecko Extension ID**: Configured with `browser_specific_settings.gecko.id: "localagent-ollama@local"` required for Firefox WebExtensions.
- **Origin Bypass with Declarative Net Request**: Strips browser `Origin` headers on MCP endpoints to bypass DNS rebinding 403s on remote servers (e.g. Notion MCP).
- **Cross-Browser Identity & PKCE**: Works with `browser.identity.launchWebAuthFlow` and `browser.identity.getRedirectURL` for OAuth 2.0 PKCE authentication.

---

## Installation in Firefox

1. Open **Mozilla Firefox**.
2. Type `about:debugging#/runtime/this-firefox` in the address bar and press Enter.
3. Click **Load Temporary Add-on…**.
4. In the file picker, navigate to this `firefox` folder and select `manifest.json`.
5. Local-Agent Ollama will appear under **Temporary Extensions**.

---

## Usage

- **Toggle Sidebar**:
  - Shortcut: Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> (or <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> on macOS).
  - Or click the **Local-Agent Ollama** icon in the toolbar.
  - Or go to the Firefox menu: **View → Sidebar → Local-Agent Ollama**.
- **Model Selector**:
  - Click the model name drawer at the bottom to choose between local Ollama models and cloud OpenRouter models.
- **Chat Mode**:
  - Type `@` to search and mention open tabs for tab question answering or page summarization.
  - Type `/` to search and invoke connected Model Context Protocol (MCP) servers and tools.
- **Agent Mode**:
  - Toggle the switch to **Agent** mode to let the AI interact with the active webpage (reading, clicking, typing, navigating) and execute multi-step tasks.
- **Settings**:
  - Click the sliders icon at the top right to configure Ollama endpoint, OpenRouter keys, and add MCP servers.

---

## Requirements & Tips

### Ollama (Local Models)
If using local Ollama models, ensure Ollama allows requests from Firefox extensions:
```bash
OLLAMA_ORIGINS="*" ollama serve
```

### Voice Dictation in Firefox
To use the microphone dictation feature in Firefox:
1. Open a new tab and go to `about:config`.
2. Search for `media.webspeech.recognition.enable`.
3. Toggle it to `true`.
4. Return to the sidebar or click **Unlock Microphone** in Settings to grant microphone access.

---

## File Structure

```
firefox/
├── manifest.json            # Firefox MV3 manifest (sidebar_action, gecko settings)
├── service-worker-loader.js # Background script with cross-browser sidebar toggle & tool execution
├── mcp-client.js            # Browser-only MCP client with PKCE OAuth 2.0 & DNR origin handling
├── content.js               # Content script for accessibility tree generation & DOM actions
├── sidepanel.html           # Sidebar user interface
├── sidepanel.css            # OpenAI-style dark/light theme with Firefox scrollbar styling
├── sidepanel.js             # Sidebar interaction controller, tab & MCP mentions, model drawer
├── settings.html            # Settings dashboard (Ollama, OpenRouter, MCP, Microphone, Agent limits)
├── settings.css             # Settings layout and styles
├── settings.js              # Settings persistence and connection test controller
├── rules.json               # Declarative Net Request ruleset for MCP headers
├── theme-init.js            # Light/dark mode flash prevention
├── lao_icon.svg             # Vector extension icon
└── README.md                # Firefox instructions and documentation
```
