# Privacy Policy for Local Agent - Ollama

**Last Updated: February 1, 2025**

## Overview

Local Agent is a browser extension that provides AI-powered page analysis using Ollama, an AI service that runs entirely on your local machine. We are committed to protecting your privacy.

## What Data We Collect

### Website Content
When you explicitly reference a browser tab using the @ mention feature (e.g., `@"Tab Name"`), the extension extracts text content from that tab to provide context to your local AI model.

**Important:**
- Content is ONLY extracted when you explicitly mention a tab
- All processing happens locally on your machine via Ollama
- No content is transmitted to external servers
- We do not monitor or track your browsing activity

### Local Storage
The extension stores the following data locally in your browser:
- **Conversation history**: Your chat messages and AI responses
- **Model preference**: Your selected Ollama model

**Important:**
- All data is stored locally using Chrome's storage API
- No data is synchronized or transmitted to external servers
- You can clear this data anytime by using the "New Chat" button or clearing browser data

## What We DO NOT Collect

We do NOT collect, store, or transmit:
- Personal information (name, email, address)
- Browsing history
- Passwords or authentication data
- Financial information
- Location data
- Health information
- Data from tabs you don't explicitly reference

## How We Use Data

- **Website content** is sent to Ollama running on your local machine (localhost:11434) to generate AI responses
- **Conversation history** is displayed in the side panel to maintain chat context
- **Model preference** remembers your selected AI model

## Data Sharing

We do NOT:
- Sell user data to third parties
- Share data with third parties
- Transmit data to external servers
- Use data for advertising or analytics

**All AI processing happens locally on your machine via Ollama.**

## Data Security

- All data is stored locally in your browser
- Communication with Ollama occurs over localhost only
- No network requests are made to external servers
- You have full control over your data

## Your Rights

You can:
- Clear conversation history by clicking "New Chat"
- Remove all extension data by uninstalling the extension
- Access your data in Chrome's extension storage

## Third-Party Services

This extension communicates ONLY with:
- **Ollama** (http://localhost:11434) - A local AI service running on your own machine

Ollama is a separate application that you install and run yourself. Please refer to Ollama's documentation for their privacy practices.

## Changes to This Policy

We may update this privacy policy from time to time. We will notify users of any material changes by updating the "Last Updated" date.

## Contact

If you have questions about this privacy policy, please contact:
- GitHub Issues: https://github.com/yourusername/ai-browser-extension/issues
- Email: your-email@example.com

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/yourusername/ai-browser-extension
