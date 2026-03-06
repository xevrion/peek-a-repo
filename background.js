import { GITHUB_API, GITHUB_CLIENT_ID, GITHUB_AUTHORIZE_URL, GITHUB_LOGIN_OAUTH_ACCESS_TOKEN_URL } from "./consts.js";

// --- Device flow polling (runs in background so it survives popup close) ---

let isPolling = false;

async function pollForToken(deviceCode, pollInterval, expiresAt) {
  isPolling = true;

  if (Date.now() > expiresAt) {
    await chrome.storage.sync.remove("deviceFlowState");
    isPolling = false;
    chrome.alarms.clear("deviceFlowWatchdog");
    chrome.runtime.sendMessage({ type: "DEVICE_FLOW_EXPIRED" }).catch(() => {});
    return;
  }

  try {
    const tokenResponse = await fetch(GITHUB_LOGIN_OAUTH_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error === "authorization_pending") {
      setTimeout(() => pollForToken(deviceCode, pollInterval, expiresAt), pollInterval);
      return;
    }

    if (tokenData.error === "slow_down") {
      const newInterval = pollInterval + 5000;
      setTimeout(() => pollForToken(deviceCode, newInterval, expiresAt), newInterval);
      return;
    }

    if (tokenData.error) {
      await chrome.storage.sync.remove("deviceFlowState");
      isPolling = false;
      chrome.alarms.clear("deviceFlowWatchdog");
      chrome.runtime.sendMessage({ type: "DEVICE_FLOW_ERROR", error: tokenData.error_description || tokenData.error }).catch(() => {});
      return;
    }

    if (tokenData.access_token) {
      await chrome.storage.sync.set({ githubToken: tokenData.access_token });
      await chrome.storage.sync.remove("deviceFlowState");
      isPolling = false;
      chrome.alarms.clear("deviceFlowWatchdog");
      chrome.runtime.sendMessage({ type: "LOGIN_COMPLETE" }).catch(() => {});
    }
  } catch (error) {
    await chrome.storage.sync.remove("deviceFlowState");
    isPolling = false;
    chrome.alarms.clear("deviceFlowWatchdog");
    chrome.runtime.sendMessage({ type: "DEVICE_FLOW_ERROR", error: error.message }).catch(() => {});
  }
}

async function checkAndStartPolling() {
  if (isPolling) return;

  const { deviceFlowState } = await chrome.storage.sync.get("deviceFlowState");
  if (!deviceFlowState) return;

  if (Date.now() > deviceFlowState.expires_at) {
    await chrome.storage.sync.remove("deviceFlowState");
    return;
  }

  const pollInterval = (deviceFlowState.interval || 5) * 1000;
  pollForToken(deviceFlowState.device_code, pollInterval, deviceFlowState.expires_at);

  // Watchdog alarm: if service worker is killed and restarted, resume polling
  chrome.alarms.create("deviceFlowWatchdog", { periodInMinutes: 0.5 });
}

// Resume any in-progress device flow when service worker starts
checkAndStartPolling();

// Watchdog: restart polling if service worker was terminated mid-poll
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "deviceFlowWatchdog") {
    checkAndStartPolling();
  }
});

// Open options page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Check if user has token on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const { githubToken } = await chrome.storage.sync.get("githubToken");
    if (!githubToken) {
      // Open options page for OAuth login
      chrome.runtime.openOptionsPage();
    }
  }
});

// Handle OAuth flow
async function initiateGitHubOAuth(scopes = "read:user") {
  const redirectURL = chrome.identity.getRedirectURL();
  const clientId = GITHUB_CLIENT_ID;
  
  const authURL = new URL(GITHUB_AUTHORIZE_URL)
  authURL.searchParams.set("client_id", GITHUB_CLIENT_ID);
  authURL.searchParams.set("redirect_uri", redirectURL);
  authURL.searchParams.set("scope", scopes);
  
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authURL.toString(),
        interactive: true,
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        // Extract the code from the redirect URL
        const url = new URL(redirectUrl);
        const code = url.searchParams.get("code");
        
        if (code) {
          try {
            // Exchange code for token using GitHub's device flow as a workaround
            // Since we can't directly exchange the code without a client secret in the extension
            // We'll use GitHub's token directly from the auth flow
            // Note: For production, you'd need a backend server to exchange the code
            
            // For now, we'll use a proxy service or direct token method
            // This is a simplified version - you may need to set up a backend
            resolve({ code });
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error("No code found in redirect URL"));
        }
      }
    );
  });
}

// Single unified message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_FILE") {
    fetchFile(msg).then(sendResponse);
    return true;
  }

  if (msg.type === "FETCH_FOLDER") {
    fetchFolder(msg).then(sendResponse);
    return true;
  }

  if (msg.type === "FETCH_PAGE") {
    fetchPage(msg).then(sendResponse);
    return true;
  }
  
  if (msg.type === "START_DEVICE_POLL") {
    checkAndStartPolling()
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (msg.type === "OAUTH_LOGIN") {
    initiateGitHubOAuth(msg.scope)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (msg.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return true;
  }
});

async function fetchFile({ owner, repo, branch, path }) {
  const { githubToken } = await chrome.storage.sync.get("githubToken");
  if (!githubToken) return { error: "NO_TOKEN" };

  const query = `
    query ($owner: String!, $repo: String!, $expression: String!) {
      repository(owner: $owner, name: $repo) {
        object(expression: $expression) {
          ... on Blob {
            text
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          owner,
          repo,
          expression: `${branch}:${path}`,
        },
      }),
    });

    // Check for rate limiting
    if (res.status === 403 || res.status === 429) {
      return { error: "RATE_LIMIT" };
    }

    const json = await res.json();

    if (json.errors) {
      // Check for rate limit in GraphQL errors
      const rateLimitError = json.errors.find(e => 
        e.message?.toLowerCase().includes('rate limit') || 
        e.type === 'RATE_LIMITED'
      );
      if (rateLimitError) {
        return { error: "RATE_LIMIT" };
      }
      
      // Check for private repo access errors (NOT_FOUND usually means no permission)
      const privateRepoError = json.errors.find(e =>
        e.type === 'NOT_FOUND' ||
        e.message?.toLowerCase().includes('not found') ||
        e.message?.toLowerCase().includes('permission')
      );
      if (privateRepoError) {
        return { error: "PRIVATE_REPO_NO_ACCESS" };
      }
      
      return { error: json.errors[0].message };
    }

    return {
      content: json?.data?.repository?.object?.text || null,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchPage({ owner, repo, branch, path }) {
  const { githubToken } = await chrome.storage.sync.get("githubToken");
  if (!githubToken) return { error: "NO_TOKEN" };

  // Fetch all entries with their content in a single API call
  const query = `
    query ($owner: String!, $repo: String!, $expression: String!) {
      repository(owner: $owner, name: $repo) {
        object(expression: $expression) {
          ... on Tree {
            entries {
              name
              type
              object {
                ... on Blob {
                  text
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          owner,
          repo,
          expression: `${branch}:${path}`,
        },
      }),
    });

    // Check for rate limiting
    if (res.status === 403 || res.status === 429) {
      return { error: "RATE_LIMIT" };
    }

    const json = await res.json();

    if (json.errors) {
      // Check for rate limit in GraphQL errors
      const rateLimitError = json.errors.find(e => 
        e.message?.toLowerCase().includes('rate limit') || 
        e.type === 'RATE_LIMITED'
      );
      if (rateLimitError) {
        return { error: "RATE_LIMIT" };
      }
      
      // Check for private repo access errors
      const privateRepoError = json.errors.find(e =>
        e.type === 'NOT_FOUND' ||
        e.message?.toLowerCase().includes('not found') ||
        e.message?.toLowerCase().includes('permission')
      );
      if (privateRepoError) {
        return { error: "PRIVATE_REPO_NO_ACCESS" };
      }
      
      return { error: json.errors[0].message };
    }

    const entries = json?.data?.repository?.object?.entries || [];

    // Transform the data to include file contents
    const filesWithContent = {};
    entries.forEach((entry) => {
      if (entry.type === "blob" && entry.object?.text) {
        filesWithContent[entry.name] = entry.object.text;
      }
    });

    return {
      entries: entries.map((e) => ({ name: e.name, type: e.type })),
      files: filesWithContent,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchFolder({ owner, repo, branch, path }) {
  const { githubToken } = await chrome.storage.sync.get("githubToken");
  if (!githubToken) return { error: "NO_TOKEN" };

  const query = `
    query ($owner: String!, $repo: String!, $expression: String!) {
      repository(owner: $owner, name: $repo) {
        object(expression: $expression) {
          ... on Tree {
            entries {
              name
              type
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          owner,
          repo,
          expression: `${branch}:${path}`,
        },
      }),
    });

    // Check for rate limiting
    if (res.status === 403 || res.status === 429) {
      return { error: "RATE_LIMIT" };
    }

    const json = await res.json();

    if (json.errors) {
      // Check for rate limit in GraphQL errors
      const rateLimitError = json.errors.find(e => 
        e.message?.toLowerCase().includes('rate limit') || 
        e.type === 'RATE_LIMITED'
      );
      if (rateLimitError) {
        return { error: "RATE_LIMIT" };
      }
      return { error: json.errors[0].message };
    }

    return {
      entries: json?.data?.repository?.object?.entries || [],
    };
  } catch (err) {
    return { error: err.message };
  }
}
