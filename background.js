chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle PDF fetch
  if (request.type === "FETCH_PDF") {
    handlePDFFetch(request.url)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true; // CRITICAL: keeps message port open for async response
  }

  // Handle file fetch
  if (request.type === "FETCH_FILE") {
    handleFileFetch(request.owner, request.repo, request.branch, request.path)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    
    return true;
  }

  // Handle page/directory fetch
  if (request.type === "FETCH_PAGE") {
    handlePageFetch(request.owner, request.repo, request.branch, request.path)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    
    return true;
  }

  // Handle options page open
  if (request.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return false;
  }

  // Unknown message type
  sendResponse({ error: "Unknown message type" });
  return false;
});

// ============================================
// PDF Functions
// ============================================

async function handlePDFFetch(url) {
  try {
    const rawUrl = convertToRawUrl(url);
    
    const response = await fetch(rawUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    
    return { success: true, data: base64 };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function convertToRawUrl(url) {
  // GitHub blob: https://github.com/user/repo/blob/main/file.pdf
  // Raw URL:     https://raw.githubusercontent.com/user/repo/main/file.pdf
  
  const blobPattern = /github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)/;
  const match = url.match(blobPattern);
  
  if (match) {
    const [, user, repo, path] = match;
    return `https://raw.githubusercontent.com/${user}/${repo}/${path}`;
  }
  
  return url;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  
  return btoa(binary);
}

// ============================================
// GitHub API Functions
// ============================================

async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["githubToken"], (result) => {
      resolve(result.githubToken || null);
    });
  });
}

async function handleFileFetch(owner, repo, branch, path) {
  try {
    const token = await getToken();
    
    const headers = {
      'Accept': 'application/vnd.github.v3.raw'
    };
    
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
    
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    
    const response = await fetch(url, { headers });
    
    if (response.status === 401 || response.status === 403) {
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      if (rateLimitRemaining === '0') {
        return { error: 'RATE_LIMIT' };
      }
      return { error: 'NO_TOKEN' };
    }
    
    if (response.status === 404) {
      return { error: 'PRIVATE_REPO_NO_ACCESS' };
    }
    
    if (!response.ok) {
      return { error: 'DEFAULT' };
    }
    
    const content = await response.text();
    return { content };
  } catch (error) {
    return { error: error.message };
  }
}

async function handlePageFetch(owner, repo, branch, path) {
  try {
    const token = await getToken();
    
    const headers = {
      'Accept': 'application/vnd.github.v3+json'
    };
    
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
    
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    
    const response = await fetch(url, { headers });
    
    if (response.status === 401 || response.status === 403) {
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      if (rateLimitRemaining === '0') {
        return { error: 'RATE_LIMIT' };
      }
      return { error: 'NO_TOKEN' };
    }
    
    if (response.status === 404) {
      return { error: 'PRIVATE_REPO_NO_ACCESS' };
    }
    
    if (!response.ok) {
      return { error: 'DEFAULT' };
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      return { entries: [] };
    }
    
    // Sort: folders first, then files
    const entries = data
      .map(item => ({
        name: item.name,
        type: item.type === 'dir' ? 'tree' : 'blob',
        size: item.size
      }))
      .sort((a, b) => {
        if (a.type === 'tree' && b.type !== 'tree') return -1;
        if (a.type !== 'tree' && b.type === 'tree') return 1;
        return a.name.localeCompare(b.name);
      });
    
    // Fetch file contents for small text files
    const files = {};
    const textExtensions = ['js', 'ts', 'jsx', 'tsx', 'json', 'md', 'txt', 'css', 'html', 'py', 'go', 'rs', 'yaml', 'yml', 'sh', 'bash'];
    
    const fileEntries = entries.filter(e => 
      e.type === 'blob' && 
      e.size < 50000 &&
      textExtensions.some(ext => e.name.toLowerCase().endsWith('.' + ext))
    ).slice(0, 10);
    
    await Promise.all(fileEntries.map(async (entry) => {
      const filePath = path ? `${path}/${entry.name}` : entry.name;
      const result = await handleFileFetch(owner, repo, branch, filePath);
      if (result.content) {
        files[entry.name] = result.content;
      }
    }));
    
    return { entries, files };
  } catch (error) {
    return { error: error.message };
  }
}