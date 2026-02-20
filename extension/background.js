// Background service worker for coordinating between UI, content script, and Ollama API

const OLLAMA_API_BASE = 'http://localhost:11434';

/**
 * Fetch available models from Ollama
 */
async function fetchOllamaModels() {
  try {
    const response = await fetch(`${OLLAMA_API_BASE}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }
    const data = await response.json();
    return {
      success: true,
      models: data.models || []
    };
  } catch (error) {
    console.error('Error fetching Ollama models:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if Ollama is running
 */
async function checkOllamaConnection() {
  try {
    const response = await fetch(`${OLLAMA_API_BASE}/api/tags`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Generate response using Ollama
 */
async function generateWithOllama(model, prompt, onChunk) {
  try {
    const response = await fetch(`${OLLAMA_API_BASE}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            fullResponse += data.response;
            if (onChunk) {
              onChunk(data.response);
            }
          }
          if (data.done) {
            return {
              success: true,
              text: fullResponse,
              model: data.model,
              context: data.context
            };
          }
        } catch (e) {
          console.warn('Failed to parse chunk:', line);
        }
      }
    }

    return {
      success: true,
      text: fullResponse
    };
  } catch (error) {
    console.error('Error generating with Ollama:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get all tabs
 */
async function getAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active
    }));
  } catch (error) {
    console.error('Error getting tabs:', error);
    throw error;
  }
}

/**
 * Extract content from a specific tab
 */
async function extractTabContent(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);

    // Return fallback if no tab found
    if (!tab) {
      return {
        title: 'Error',
        url: '',
        content: '[Tab not found]',
        contentLength: 0
      };
    }

    // Check if we can access the tab
    const tabUrl = String(tab.url || '');
    if (!tabUrl ||
        tabUrl === '' ||
        tabUrl.startsWith('chrome://') ||
        tabUrl.startsWith('chrome-extension://') ||
        tabUrl.startsWith('edge://') ||
        tabUrl.startsWith('brave://') ||
        tabUrl.startsWith('about:') ||
        tabUrl.startsWith('data:')) {
      return {
        title: tab.title || 'Restricted Tab',
        url: tab.url || '',
        content: '[Cannot access system or extension pages]',
        contentLength: 0
      };
    }

    // Send message to content script; if it's not injected yet, inject it and retry
    let response;
    try {
      response = await chrome.tabs.sendMessage(tabId, { action: 'extractContent' });
    } catch (e) {
      // Content script not loaded — inject it dynamically then retry
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      response = await chrome.tabs.sendMessage(tabId, { action: 'extractContent' });
    }

    if (response && response.success) {
      return {
        ...response.data,
        tabTitle: tab.title,
        tabUrl: tab.url
      };
    }

    // If we got here, extraction failed
    return {
      title: tab.title || 'Error',
      url: tab.url || '',
      content: `[Could not extract content - tab may need to be refreshed]`,
      contentLength: 0
    };
  } catch (error) {
    // Catch all errors (message errors, etc.) and return gracefully
    return {
      title: tab?.title || 'Error',
      url: tab?.url || '',
      content: `[Could not extract content - tab may need to be refreshed]`,
      contentLength: 0
    };
  }
}

/**
 * Extract content from active tab
 */
async function extractActiveTabContent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Return fallback if no tab found
    if (!tab || !tab.id) {
      return {
        title: 'Current Tab',
        url: '',
        content: '[No active tab found]',
        contentLength: 0
      };
    }

    // Check if we can access the tab
    const tabUrl = String(tab.url || '');
    if (!tabUrl ||
        tabUrl === '' ||
        tabUrl.startsWith('chrome://') ||
        tabUrl.startsWith('chrome-extension://') ||
        tabUrl.startsWith('edge://') ||
        tabUrl.startsWith('brave://') ||
        tabUrl.startsWith('about:') ||
        tabUrl.startsWith('data:')) {
      return {
        title: 'Current Tab',
        url: '',
        content: '[Cannot access system or extension pages]',
        contentLength: 0
      };
    }

    // Send message to content script; if it's not injected yet, inject it and retry
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
    } catch (e) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
    }

    if (response && response.success) {
      return response.data;
    }

    // If we got here, extraction failed
    return {
      title: 'Current Tab',
      url: '',
      content: '[Content extraction unavailable - tab may need to be refreshed]',
      contentLength: 0
    };
  } catch (error) {
    // Catch all errors (message errors, etc.) and return gracefully
    return {
      title: 'Current Tab',
      url: '',
      content: '[Content extraction unavailable - tab may need to be refreshed]',
      contentLength: 0
    };
  }
}

/**
 * Handle messages from side panel
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getModels') {
    fetchOllamaModels()
      .then(response => sendResponse(response))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'checkConnection') {
    checkOllamaConnection()
      .then(connected => sendResponse({ connected }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }

  if (request.action === 'getTabs') {
    getAllTabs()
      .then(tabs => sendResponse({ success: true, tabs }))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));
    return true;
  }

  if (request.action === 'query') {
    handleQuery(request.data, request.streamCallback)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'queryStream') {
    // Handle streaming query
    handleStreamingQuery(request.data, sender.tab?.id)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));
    return true;
  }
});

/**
 * Handle query from side panel
 */
async function handleQuery(data) {
  try {
    const { query, model, includePageContent, mentionedTabs = [] } = data;

    if (!model) {
      throw new Error('No model selected');
    }

    let prompt = query;

    // Build context from mentioned tabs or current page
    if (mentionedTabs.length > 0) {
      // Extract content from all mentioned tabs
      const tabContents = await Promise.all(
        mentionedTabs.map(tab => extractTabContent(tab.id))
      );

      let contextParts = [];
      tabContents.forEach((tabData, index) => {
        const tabInfo = mentionedTabs[index];
        contextParts.push(`Tab: ${tabInfo.title}
URL: ${tabInfo.url}

Content:
${tabData.content}
`);
      });

      prompt = `Based on the following web page content from referenced tabs, please answer the question.

${contextParts.join('\n---\n\n')}

Question: ${query}

Answer:`;
    } else if (includePageContent) {
      try {
        const pageData = await extractActiveTabContent();
        prompt = `Based on the following web page content, please answer the question.

Page Title: ${pageData.title}
URL: ${pageData.url}

Content:
${pageData.content}

Question: ${query}

Answer:`;
      } catch (error) {
        console.warn('Could not extract page content:', error.message);
        prompt = `${query}\n\n[Note: Page content unavailable]`;
      }
    }

    // Generate response
    const result = await generateWithOllama(model, prompt);

    if (result.success) {
      return {
        success: true,
        text: result.text,
        model: result.model
      };
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Error handling query:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle streaming query (sends updates via chrome.runtime messages)
 */
async function handleStreamingQuery(data, tabId) {
  try {
    const { query, model, includePageContent, messageId } = data;

    if (!model) {
      throw new Error('No model selected');
    }

    let prompt = query;

    if (includePageContent) {
      try {
        const pageData = await extractActiveTabContent();
        prompt = `Based on the following web page content, please answer the question.

Page Title: ${pageData.title}
URL: ${pageData.url}

Content:
${pageData.content}

Question: ${query}

Answer:`;
      } catch (error) {
        console.warn('Could not extract page content:', error.message);
        prompt = `${query}\n\n[Note: Page content unavailable]`;
      }
    }

    // Generate response with streaming
    let fullText = '';
    const result = await generateWithOllama(model, prompt, (chunk) => {
      fullText += chunk;
      // Send chunk update to all extension pages
      chrome.runtime.sendMessage({
        action: 'streamChunk',
        messageId: messageId,
        chunk: chunk,
        fullText: fullText
      }).catch(() => {
        // Ignore errors if sidepanel is closed
      });
    });

    if (result.success) {
      // Send final message
      chrome.runtime.sendMessage({
        action: 'streamComplete',
        messageId: messageId,
        text: result.text,
        model: result.model
      }).catch(() => {});

      return {
        success: true,
        text: result.text,
        model: result.model
      };
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Error handling streaming query:', error);
    chrome.runtime.sendMessage({
      action: 'streamError',
      messageId: messageId,
      error: error.message
    }).catch(() => {});

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle extension icon click - open side panel
 */
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.error('Error opening side panel:', error);
  }
});

console.log('AI Assistant background service worker loaded (Ollama mode)');
