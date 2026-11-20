// Local-Agent Ollama — Browser-Only MCP (Model Context Protocol) Client
// Runs 100% inside the browser with no backend PC dependencies.
// Connects to remote or local HTTP/SSE MCP servers using JSON-RPC 2.0.
// Compatible with Mozilla Firefox and Chromium engines.

const BROWSER_DEMO_URL = 'browser://demo-tools';

const storage = typeof browser !== 'undefined' && browser.storage ? browser.storage.local : (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);

export const MCPClient = {
  /** Retrieve all configured MCP servers from storage */
  async getServers() {
    if (!storage) return [];
    const data = await storage.get('mcpServers');
    return Array.isArray(data.mcpServers) ? data.mcpServers : [];
  },

  /** Save all MCP servers */
  async saveServers(servers) {
    if (!storage) return;
    await storage.set({ mcpServers: servers });
  },

  /** Add or update a server entry */
  async addServer(server) {
    const servers = await this.getServers();
    const idx = servers.findIndex(s => s.id === server.id || s.name.toLowerCase() === server.name.toLowerCase());
    if (idx >= 0) {
      servers[idx] = { ...servers[idx], ...server };
    } else {
      servers.push(server);
    }
    await this.saveServers(servers);
    return server;
  },

  /** Remove a server by ID */
  async removeServer(id) {
    const servers = await this.getServers();
    const updated = servers.filter(s => s.id !== id && s.name !== id);
    await this.saveServers(updated);
    return updated;
  },

  /** Build request headers based on server auth settings */
  buildHeaders(serverConfig) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };

    if (serverConfig.authType === 'bearer' && serverConfig.apiKey) {
      const token = serverConfig.apiKey.trim();
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    } else if (serverConfig.authType === 'oauth' && (serverConfig.accessToken || serverConfig.apiKey)) {
      const token = (serverConfig.accessToken || serverConfig.apiKey).trim();
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    } else if (serverConfig.authType === 'custom' && serverConfig.customHeaderName) {
      headers[serverConfig.customHeaderName.trim()] = (serverConfig.customHeaderValue || '').trim();
    }

    return headers;
  },

  /** Generate PKCE code_verifier (32 random bytes -> 43 base64url chars) */
  generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64UrlEncode(array);
  },

  /** Generate PKCE S256 code_challenge from code_verifier */
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(new Uint8Array(digest));
  },

  base64UrlEncode(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  /** Discover OAuth endpoints (RFC 8414 & server metadata) */
  async discoverOAuthEndpoints(serverUrl) {
    let origin;
    try {
      origin = new URL(serverUrl).origin;
    } catch {
      origin = serverUrl || 'https://mcp.notion.com';
    }

    let authMetadata = null;
    try {
      const metaRes = await fetch(`${origin}/.well-known/oauth-authorization-server`, {
        headers: { 'Accept': 'application/json' }
      });
      if (metaRes.ok) {
        authMetadata = await metaRes.json();
      }
    } catch (e) {
      console.warn('Could not fetch oauth metadata:', e);
    }

    return {
      issuer: authMetadata?.issuer || origin,
      authorizationEndpoint: authMetadata?.authorization_endpoint || `${origin}/authorize`,
      tokenEndpoint: authMetadata?.token_endpoint || `${origin}/token`,
      registrationEndpoint: authMetadata?.registration_endpoint || `${origin}/register`
    };
  },

  /** Dynamic Client Registration (RFC 7591) */
  async registerOAuthClient(registrationEndpoint, redirectUri) {
    if (!registrationEndpoint) return null;
    try {
      const payload = {
        client_name: 'Local-Agent Ollama',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none'
      };

      const res = await fetch(registrationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        return data.client_id || null;
      }
    } catch (e) {
      console.warn('DCR registration note:', e);
    }
    return null;
  },

  /** Perform full interactive OAuth 2.0 PKCE flow for Notion / MCP */
  async startOAuthFlow(serverConfig, onStatus) {
    const rawUrl = serverConfig.url || 'https://mcp.notion.com/mcp';
    onStatus?.('Discovering OAuth endpoints for ' + rawUrl + '…');
    const endpoints = await this.discoverOAuthEndpoints(rawUrl);

    // Extension redirect URI (Firefox or Chrome compatible)
    const identityApi = typeof browser !== 'undefined' && browser.identity
      ? browser.identity
      : (typeof chrome !== 'undefined' ? chrome.identity : null);

    const redirectUri = identityApi?.getRedirectURL
      ? identityApi.getRedirectURL('callback')
      : (typeof chrome !== 'undefined' && chrome.runtime?.id
          ? `https://${chrome.runtime.id}.chromiumapp.org/callback`
          : 'https://localagent-ollama.extensions.allizom.org/callback');

    // 1. Dynamic Client Registration
    let clientId = serverConfig.clientId || null;
    if (!clientId && storage) {
      try {
        const stored = await storage.get('mcp_oauth_client_id');
        if (stored?.mcp_oauth_client_id) clientId = stored.mcp_oauth_client_id;
      } catch {}
    }
    if (!clientId && endpoints.registrationEndpoint) {
      onStatus?.('Registering client identity with OAuth server…');
      clientId = await this.registerOAuthClient(endpoints.registrationEndpoint, redirectUri);
      if (clientId && storage) {
        try {
          await storage.set({ mcp_oauth_client_id: clientId });
        } catch {}
      }
    }

    // 2. PKCE code verifier and challenge
    const verifier = this.generateCodeVerifier();
    const challenge = await this.generateCodeChallenge(verifier);
    const state = Math.random().toString(36).substring(2, 15);

    // 3. Build authorization URL
    const authUrl = new URL(endpoints.authorizationEndpoint);
    authUrl.searchParams.set('response_type', 'code');
    if (clientId) authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    if (!identityApi?.launchWebAuthFlow) {
      throw new Error('Identity API is unavailable. Please verify extension permissions.');
    }

    onStatus?.(`Launching ${serverConfig.name || 'OAuth'} authorization window…`);
    const callbackUrl = await new Promise((resolve, reject) => {
      const authOptions = {
        url: authUrl.toString(),
        interactive: true
      };

      if (typeof browser !== 'undefined' && browser.identity?.launchWebAuthFlow) {
        browser.identity.launchWebAuthFlow(authOptions)
          .then(res => resolve(res))
          .catch(err => reject(err));
      } else if (typeof chrome !== 'undefined' && chrome.identity?.launchWebAuthFlow) {
        chrome.identity.launchWebAuthFlow(authOptions, (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Authorization window closed or dismissed.'));
          } else if (!responseUrl) {
            reject(new Error('Authorization was cancelled.'));
          } else {
            resolve(responseUrl);
          }
        });
      } else {
        reject(new Error('Browser identity API is unavailable.'));
      }
    });

    const parsedCallback = new URL(callbackUrl);
    const code = parsedCallback.searchParams.get('code');
    if (!code) {
      const errDesc = parsedCallback.searchParams.get('error_description') || parsedCallback.searchParams.get('error') || 'No authorization code returned.';
      throw new Error(`OAuth Error: ${errDesc}`);
    }

    // 4. Exchange authorization code for tokens
    onStatus?.('Exchanging authorization code for access token…');
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    });
    if (clientId) tokenBody.set('client_id', clientId);

    const tokenRes = await fetch(endpoints.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: tokenBody
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      throw new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${errText}`);
    }

    const tokenData = await tokenRes.json();
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || '',
      clientId,
      tokenEndpoint: endpoints.tokenEndpoint,
      expiresIn: tokenData.expires_in
    };
  },

  /** Refresh OAuth token if expired */
  async refreshOAuthToken(server) {
    if (!server.refreshToken) return null;
    const tokenEndpoint = server.tokenEndpoint || 'https://mcp.notion.com/token';

    try {
      const tokenBody = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: server.refreshToken
      });
      if (server.clientId) tokenBody.set('client_id', server.clientId);

      const res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: tokenBody
      });

      if (res.ok) {
        const data = await res.json();
        server.accessToken = data.access_token;
        if (data.refresh_token) server.refreshToken = data.refresh_token;
        await this.addServer(server);
        return data.access_token;
      }
    } catch (e) {
      console.warn('OAuth refresh error:', e);
    }
    return null;
  },

  /** Ensure declarativeNetRequest removes browser Origin header to prevent MCP DNS rebinding 403s */
  async ensureOriginBypass(url) {
    const dnr = (typeof browser !== 'undefined' && browser.declarativeNetRequest) || (typeof chrome !== 'undefined' && chrome.declarativeNetRequest);
    if (dnr?.updateDynamicRules) {
      try {
        const u = new URL(url);
        await dnr.updateDynamicRules({
          removeRuleIds: [9999],
          addRules: [{
            id: 9999,
            priority: 10,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [{ header: 'Origin', operation: 'remove' }]
            },
            condition: {
              urlFilter: `||${u.hostname}`,
              resourceTypes: ['xmlhttprequest']
            }
          }]
        });
      } catch (e) {
        console.warn('Origin bypass note:', e);
      }
    }
  },

  /** Helper to send a JSON-RPC 2.0 request to an MCP endpoint */
  async jsonRpcRequest(url, headers, method, params = {}) {
    await this.ensureOriginBypass(url);

    const payload = {
      jsonrpc: '2.0',
      id: Date.now() + Math.floor(Math.random() * 1000),
      method,
      params
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Server returned HTTP ${res.status}: ${errText.slice(0, 150) || res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.replace(/^data:\s*/, '').trim());
            if (data.error) {
              throw new Error(data.error.message || `JSON-RPC error code ${data.error.code}`);
            }
            if (data.result !== undefined) {
              return data.result;
            }
          } catch (e) {
            if (e.message?.startsWith('JSON-RPC error')) throw e;
          }
        }
      }
      throw new Error('No valid JSON-RPC result in Streamable HTTP SSE response.');
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message || `JSON-RPC error code ${data.error.code}`);
    }

    return data.result;
  },

  /** Browser Demo MCP implementation for immediate zero-config testing */
  handleDemoDiscovery() {
    return {
      serverInfo: {
        name: 'Browser Demo Tools',
        version: '1.0.0'
      },
      tools: [
        {
          name: 'get_current_time',
          description: 'Get the current local date, time, and timezone in the browser.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'math_calculate',
          description: 'Evaluate a mathematical expression safely in JavaScript.',
          inputSchema: {
            type: 'object',
            properties: {
              expression: { type: 'string', description: 'Mathematical expression to compute, e.g. 42 * 12 + 100' }
            },
            required: ['expression']
          }
        },
        {
          name: 'fetch_json_api',
          description: 'Make a GET request to an open JSON API directly from the browser.',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Public URL returning JSON data' }
            },
            required: ['url']
          }
        },
        {
          name: 'base64_tool',
          description: 'Encode or decode text to/from Base64.',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Input text' },
              action: { type: 'string', enum: ['encode', 'decode'], description: 'Action to perform' }
            },
            required: ['text', 'action']
          }
        }
      ]
    };
  },

  /** Execute a tool on the Browser Demo server */
  async handleDemoToolCall(toolName, args) {
    if (toolName === 'get_current_time') {
      const now = new Date();
      return {
        content: [
          {
            type: 'text',
            text: `Current time: ${now.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone}) ISO: ${now.toISOString()}`
          }
        ]
      };
    }

    if (toolName === 'math_calculate') {
      const expr = String(args.expression || '');
      if (!/^[0-9+\-*/().\s^%eMathPIE]+$/.test(expr)) {
        throw new Error('Expression contains disallowed characters.');
      }
      const sanitized = expr.replace(/\^/g, '**');
      const result = Function(`"use strict"; return (${sanitized});`)();
      return {
        content: [{ type: 'text', text: `Result of ${expr} = ${result}` }]
      };
    }

    if (toolName === 'fetch_json_api') {
      const url = args.url;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      const json = await res.json();
      return {
        content: [{ type: 'text', text: JSON.stringify(json, null, 2) }]
      };
    }

    if (toolName === 'base64_tool') {
      const text = args.text || '';
      const action = args.action || 'encode';
      const out = action === 'decode' ? atob(text) : btoa(text);
      return {
        content: [{ type: 'text', text: out }]
      };
    }

    throw new Error(`Unknown demo tool: ${toolName}`);
  },

  /**
   * Connect to an MCP server, perform initialize handshake, and discover tools.
   * Auto-configures server capabilities and authentication.
   */
  async connectAndDiscover(serverConfig, onStatus) {
    const rawUrl = (serverConfig.url || '').trim();
    if (!rawUrl) throw new Error('Server URL is required');

    // Check for browser demo pseudo-server
    if (rawUrl === BROWSER_DEMO_URL || rawUrl.toLowerCase() === 'browser://demo') {
      const demo = this.handleDemoDiscovery();
      return {
        id: serverConfig.id || 'srv_demo',
        name: serverConfig.name || 'DemoTools',
        url: BROWSER_DEMO_URL,
        authType: 'none',
        serverInfo: demo.serverInfo,
        tools: demo.tools,
        status: 'connected',
        lastConnected: Date.now()
      };
    }

    // Step 0: If OAuth is required and no access token is set, launch OAuth PKCE flow
    if (serverConfig.authType === 'oauth' && !serverConfig.accessToken && !serverConfig.apiKey) {
      onStatus?.(`Initiating ${serverConfig.name || 'server'} OAuth 2.0 PKCE flow…`);
      const oauthData = await this.startOAuthFlow(serverConfig, onStatus);
      serverConfig.accessToken = oauthData.accessToken;
      serverConfig.refreshToken = oauthData.refreshToken;
      serverConfig.clientId = oauthData.clientId;
      serverConfig.tokenEndpoint = oauthData.tokenEndpoint;
    }

    let headers = this.buildHeaders(serverConfig);
    let targetUrl = rawUrl;

    // Handle SSE handshake if endpoint points to /sse or if initial POST returns SSE requirements
    if (targetUrl.includes('/sse')) {
      try {
        const sseRes = await fetch(targetUrl, {
          method: 'GET',
          headers: { ...headers, 'Accept': 'text/event-stream' }
        });

        if (sseRes.ok) {
          const reader = sseRes.body?.getReader();
          if (reader) {
            const dec = new TextDecoder();
            const { value } = await reader.read();
            const text = dec.decode(value || new Uint8Array());
            reader.cancel();

            const match = text.match(/event:\s*endpoint\s*\ndata:\s*(\S+)/i) ||
                          text.match(/data:\s*(\S+\/messages\S*)/i);
            if (match && match[1]) {
              const endpointPath = match[1];
              targetUrl = new URL(endpointPath, rawUrl).toString();
            }
          }
        }
      } catch (err) {
        console.warn('SSE handshake note, falling back to direct POST:', err);
      }
    }

    onStatus?.('Sending initialize handshake…');

    // Step 1: Initialize handshake (with auto-refresh on 401)
    let initResult;
    try {
      initResult = await this.jsonRpcRequest(targetUrl, headers, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'LocalAgent-Browser-MCP',
          version: '1.0.0'
        }
      });
    } catch (err) {
      if (serverConfig.authType === 'oauth' && /401/i.test(err.message)) {
        if (serverConfig.refreshToken) {
          onStatus?.('Access token expired, refreshing OAuth token…');
          const refreshedToken = await this.refreshOAuthToken(serverConfig);
          if (refreshedToken) {
            serverConfig.accessToken = refreshedToken;
            headers = this.buildHeaders(serverConfig);
            initResult = await this.jsonRpcRequest(targetUrl, headers, 'initialize', {
              protocolVersion: '2024-11-05',
              capabilities: { roots: { listChanged: true }, sampling: {} },
              clientInfo: { name: 'LocalAgent-Browser-MCP', version: '1.0.0' }
            });
          } else {
            onStatus?.(`Token refresh failed, re-authenticating ${serverConfig.name || 'OAuth'}…`);
            const oauthData = await this.startOAuthFlow(serverConfig, onStatus);
            serverConfig.accessToken = oauthData.accessToken;
            serverConfig.refreshToken = oauthData.refreshToken;
            headers = this.buildHeaders(serverConfig);
            initResult = await this.jsonRpcRequest(targetUrl, headers, 'initialize', {
              protocolVersion: '2024-11-05',
              capabilities: { roots: { listChanged: true }, sampling: {} },
              clientInfo: { name: 'LocalAgent-Browser-MCP', version: '1.0.0' }
            });
          }
        } else {
          onStatus?.(`Authentication required, launching ${serverConfig.name || 'OAuth'}…`);
          const oauthData = await this.startOAuthFlow(serverConfig, onStatus);
          serverConfig.accessToken = oauthData.accessToken;
          serverConfig.refreshToken = oauthData.refreshToken;
          headers = this.buildHeaders(serverConfig);
          initResult = await this.jsonRpcRequest(targetUrl, headers, 'initialize', {
            protocolVersion: '2024-11-05',
            capabilities: { roots: { listChanged: true }, sampling: {} },
            clientInfo: { name: 'LocalAgent-Browser-MCP', version: '1.0.0' }
          });
        }
      } else {
        throw err;
      }
    }

    // Optional notification acknowledging initialization
    try {
      await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {}
        })
      });
    } catch {}

    // Step 2: Tool Discovery
    onStatus?.(`Discovering ${serverConfig.name || 'MCP'} tools…`);
    let tools = [];
    try {
      const toolsResult = await this.jsonRpcRequest(targetUrl, headers, 'tools/list', {});
      tools = Array.isArray(toolsResult?.tools) ? toolsResult.tools : [];
    } catch (e) {
      console.warn('Could not list tools:', e);
    }

    return {
      id: serverConfig.id || 'srv_' + Date.now().toString(36),
      name: serverConfig.name.trim() || 'MCP-Server',
      url: targetUrl,
      originalUrl: rawUrl,
      authType: serverConfig.authType || 'none',
      accessToken: serverConfig.accessToken || '',
      refreshToken: serverConfig.refreshToken || '',
      clientId: serverConfig.clientId || '',
      tokenEndpoint: serverConfig.tokenEndpoint || '',
      authUrl: initResult?.authUrl || initResult?.authorizationUrl || serverConfig.authUrl || '',
      apiKey: serverConfig.apiKey || '',
      customHeaderName: serverConfig.customHeaderName || '',
      customHeaderValue: serverConfig.customHeaderValue || '',
      serverInfo: initResult?.serverInfo || { name: serverConfig.name },
      tools,
      status: 'connected',
      lastConnected: Date.now()
    };
  },

  /** Call a specific tool on a configured MCP server with retry on token expiration */
  async callTool(server, toolName, args = {}) {
    if (server.url === BROWSER_DEMO_URL || server.url === 'browser://demo') {
      return this.handleDemoToolCall(toolName, args);
    }

    let headers = this.buildHeaders(server);
    try {
      return await this.jsonRpcRequest(server.url, headers, 'tools/call', {
        name: toolName,
        arguments: args
      });
    } catch (err) {
      // If 401 and we have OAuth refresh token, refresh and retry once
      if (server.authType === 'oauth' && server.refreshToken && /401/i.test(err.message)) {
        console.log('OAuth token expired, attempting refresh…');
        const newToken = await this.refreshOAuthToken(server);
        if (newToken) {
          headers = this.buildHeaders(server);
          return await this.jsonRpcRequest(server.url, headers, 'tools/call', {
            name: toolName,
            arguments: args
          });
        }
      }
      throw err;
    }
  }
};

// Expose globally for sidepanel & settings scripts
if (typeof globalThis !== 'undefined') {
  globalThis.MCPClient = MCPClient;
}
