const GITHUB_API = "https://api.github.com/graphql";

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
