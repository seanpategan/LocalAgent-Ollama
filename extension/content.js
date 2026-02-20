// Content script for extracting readable page content

/**
 * Extract main content from the page
 */
function extractPageContent() {
  try {
    // Get page title
    const title = document.title;

    // Get page URL
    const url = window.location.href;

    // Try to find main content area
    let mainContent = '';

    // Look for common content containers
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.main-content',
      '.content',
      '#content',
      '.post-content',
      '.entry-content'
    ];

    let contentElement = null;
    for (const selector of contentSelectors) {
      contentElement = document.querySelector(selector);
      if (contentElement) break;
    }

    // If no main content found, use body
    if (!contentElement) {
      contentElement = document.body;
    }

    // Clone the element to avoid modifying the page
    const cloned = contentElement.cloneNode(true);

    // Remove unwanted elements
    const unwantedSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'nav',
      'header',
      'footer',
      '.nav',
      '.navigation',
      '.menu',
      '.sidebar',
      '.advertisement',
      '.ads',
      '.comments',
      '.social-share',
      '[role="navigation"]',
      '[role="complementary"]',
      '[role="banner"]',
      '[role="contentinfo"]'
    ];

    unwantedSelectors.forEach(selector => {
      cloned.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Extract text content
    mainContent = cloned.textContent || cloned.innerText || '';

    // Clean up whitespace
    mainContent = mainContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // Limit content size (max 10000 characters for context window)
    if (mainContent.length > 10000) {
      mainContent = mainContent.substring(0, 10000) + '...';
    }

    return {
      success: true,
      data: {
        title,
        url,
        content: mainContent,
        contentLength: mainContent.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContent') {
    const result = extractPageContent();
    sendResponse(result);
  }
  return true; // Keep channel open for async response
});

// Signal that content script is ready
console.log('AI Assistant content script loaded');
