const GITHUB_API = "https://api.github.com/graphql";
const GITHUB_CLIENT_ID = "Ov23li7jLGhcwdkrnVXS"; // Public client ID for OAuth

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
async function initiateGitHubOAuth() {
  const redirectURL = chrome.identity.getRedirectURL();
  const clientId = GITHUB_CLIENT_ID;
  const scopes = "read:user";
  
  const authURL = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectURL)}&scope=${encodeURIComponent(scopes)}`;
  
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authURL,
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
  
  if (msg.type === "OAUTH_LOGIN") {
    initiateGitHubOAuth()
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
