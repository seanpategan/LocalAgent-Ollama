# Privacy Policy — Local-Agent Ollama

_Last updated: March 2026_

## Overview

Local-Agent Ollama is a browser extension that connects to a locally running [Ollama](https://ollama.com) instance on your machine. All AI processing happens locally. No data is sent to any external server.

## Data Collection

**We collect no data.** The extension does not transmit, store, or share any personal information, browsing activity, or page content with any third party.

## What the Extension Accesses

| Data | Purpose | Stored? | Transmitted? |
|---|---|---|---|
| Page content (text) | Provided as context to your local AI model | No | No — sent only to `localhost:11434` |
| Tab titles and URLs | Used to identify tabs when you use `@tabname` | No | No |
| Chat history | Saved locally so conversations persist across sessions | Locally only (chrome.storage) | No |
| Active tab | Required to read the current page and execute agent actions | No | No |

## Local Storage

Chat history is stored locally in your browser using `chrome.storage`. It never leaves your device. You can clear it at any time by starting a new chat.

## Network Requests

The extension communicates exclusively with `http://localhost:11434` (your local Ollama server). No requests are made to any external server, analytics service, or third-party API.

## Permissions Justification

- **`tabs` / `activeTab`** — needed to read tab titles, URLs, and send messages to content scripts
- **`scripting`** — needed to inject scripts that read page content and execute agent actions (click, type, scroll) on your behalf
- **`storage`** — needed to save chat history locally
- **`sidePanel`** — needed to display the chat interface in Chrome's side panel

## Changes

If this policy changes, the updated version will be published in this repository.

## Contact

For questions, open an issue at [github.com/seanpategan/LocalAgent-Ollama](https://github.com/seanpategan/LocalAgent-Ollama).
