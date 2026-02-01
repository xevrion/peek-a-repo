const HOVER_DELAY = 0;
const MAX_IMAGE_AREA = 480 * 320;
const POPUP_GAP = 10;
const MIN_POPUP_WIDTH = 200;
const cache = new Map();
const pageCache = new Map(); // Cache for entire page/directory data
const pendingRequests = new Map(); // Track in-flight requests to prevent duplicates

let hoverTimer = null;
let popup = null;
let lastTarget = null;
let isPopupShown = false;
let nestedPopups = []; // Array to track all nested popups
let loginNotificationShown = false; // Track if we've shown the login notification

// Error messages
const ERROR_MESSAGES = {
  NO_TOKEN: "Please set your GitHub token in extension options.",
  RATE_LIMIT: "API rate limit exceeded. Please wait a moment before trying again.",
  PRIVATE_REPO_NO_ACCESS: "This is a private repository. Please sign in with private repo access enabled in the extension settings.",
  DEFAULT: "An error occurred. Please try again.",
};

// Check login status and show notification if needed
async function checkAndNotifyLogin() {
  if (loginNotificationShown) return;
  
  const result = await new Promise((resolve) => {
    chrome.storage.sync.get("githubToken", resolve);
  });
  
  if (!result.githubToken) {
    showLoginNotification();
    loginNotificationShown = true;
  }
}

function showLoginNotification() {
  // Create notification banner
  const notification = document.createElement("div");
  notification.id = "peek-a-repo-login-notification";
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      animation: slideInRight 0.3s ease-out;
    ">
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="flex-shrink: 0; font-size: 24px;">🔍</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px;">
            Peek-a-Repo Extension Detected
          </div>
          <div style="font-size: 13px; line-height: 1.5; opacity: 0.95; margin-bottom: 12px;">
            You have Peek-a-Repo enabled but haven't logged in yet. Sign in to start previewing files and folders on hover!
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="peek-login-btn" style="
              background: white;
              color: #667eea;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 13px;
              font-weight: 600;
              cursor: pointer;
              transition: transform 0.2s;
            ">
              Sign In Now
            </button>
            <button id="peek-dismiss-btn" style="
              background: rgba(255, 255, 255, 0.2);
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.2s;
            ">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add animation keyframes
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
    #peek-login-btn:hover {
      transform: scale(1.05);
    }
    #peek-dismiss-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // Add event listeners
  document.getElementById("peek-login-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    dismissNotification();
  });
  
  document.getElementById("peek-dismiss-btn").addEventListener("click", () => {
    dismissNotification();
  });
  
  // Auto-dismiss after 10 seconds
  setTimeout(dismissNotification, 10000);
  
  function dismissNotification() {
    const notif = document.getElementById("peek-a-repo-login-notification");
    if (notif) {
      notif.firstElementChild.style.animation = "slideOutRight 0.3s ease-out";
      setTimeout(() => notif.remove(), 300);
    }
  }
}

// Check login status when page loads
checkAndNotifyLogin();

const ICONS = {
  folder: `<svg aria-hidden="true" focusable="false" class="octicon octicon-file-directory-fill icon-directory" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" display="inline-block" overflow="visible" style="vertical-align:text-bottom"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"></path></svg>`,
  file: `<svg aria-hidden="true" focusable="false" class="octicon octicon-file color-fg-muted" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" display="inline-block" overflow="visible" style="vertical-align:text-bottom"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"></path></svg>`,
};
function lockBodyScroll() {
  document.body.classList.add("scroll-hidden");
}

function unlockBodyScroll() {
  document.body.classList.remove("scroll-hidden");
}

function createPopup() {
  popup = document.createElement("div");

  popup.className = `
    fixed z-[9999]
    rounded-xl
    bg-[rgba(20,20,30,0.75)]
    backdrop-blur-md
    text-white text-xs
    shadow-2xl
    pointer-events-auto
    overflow-auto
    opacity-0 scale-[0.98] translate-y-1
    transition-all duration-150 ease-out
  `;

  popup.style.minWidth = "0px";
  popup.style.minHeight = "0px";
  popup.style.maxWidth = "90vw";

  document.body.appendChild(popup);
  lockBodyScroll();
  isPopupShown = true;

  popup.addEventListener("mouseenter", () => {
    clearTimeout(hoverTimer);
    isPopupShown = true;
  });

  popup.addEventListener("mouseleave", (e) => {
    // Check if mouse is moving to a nested popup
    const movingToNested = nestedPopups.some(np => np.element.contains(e.relatedTarget));
    if (!movingToNested) {
      unlockBodyScroll();
      destroyPopup();
      lastTarget = null;
    }
  });

  popup.addEventListener(
    "wheel",
    (e) => {
      e.stopPropagation();
      // Let the browser handle scrolling naturally, just prevent it from bubbling to body
    },
    { passive: false }
  );
}

function destroyPopup() {
  if (!popup) return;

  popup.classList.remove("opacity-100", "scale-100", "translate-y-0");
  popup.classList.add("opacity-0", "scale-[0.98]", "translate-y-1");

  const el = popup;
  popup = null;
  isPopupShown = false;
  unlockBodyScroll();
  
  // Destroy all nested popups
  nestedPopups.forEach(np => {
    np.element.classList.add("opacity-0", "scale-[0.98]", "translate-y-1");
    setTimeout(() => np.element.remove(), 150);
  });
  nestedPopups = [];
  
  setTimeout(() => {
    el.remove();
  }, 150); // must match transition duration
}

function createNestedPopup(level, parentElement) {
  const nestedPopup = document.createElement("div");
  const zIndex = 10000 + level;
  
  nestedPopup.className = `
    fixed
    rounded-xl
    bg-[rgba(20,20,30,0.75)]
    backdrop-blur-md
    text-white text-xs
    shadow-2xl
    pointer-events-auto
    overflow-auto
    opacity-0 scale-[0.98] translate-y-1
    transition-all duration-150 ease-out
  `;
  
  nestedPopup.style.zIndex = zIndex;
  nestedPopup.style.minWidth = "0px";
  nestedPopup.style.minHeight = "0px";
  nestedPopup.style.maxWidth = "90vw";
  
  document.body.appendChild(nestedPopup);
  
  nestedPopup.addEventListener("wheel", (e) => {
    e.stopPropagation();
  }, { passive: false });
  
  return { element: nestedPopup, level, parentElement };
}

function destroyNestedPopupsFromLevel(level) {
  // Remove all popups at this level and beyond
  const toRemove = nestedPopups.filter(np => np.level >= level);
  nestedPopups = nestedPopups.filter(np => np.level < level);
  
  toRemove.forEach(np => {
    np.element.classList.add("opacity-0", "scale-[0.98]", "translate-y-1");
    setTimeout(() => np.element.remove(), 150);
  });
}

async function setupNestedFolderHandlers(parentElement, owner, repo, branch, basePath, level) {
  const folderElements = parentElement.querySelectorAll("[data-type='tree']");
  
  folderElements.forEach((folderElement) => {
    // Skip if already has listener attached
    if (folderElement.dataset.hasListener) return;
    folderElement.dataset.hasListener = "true";
    
    folderElement.addEventListener("mouseenter", async (e) => {
      const folderName = folderElement.textContent.trim();
      const folderPath = basePath ? `${basePath}/${folderName}` : folderName;
      
      // Calculate available width
      const rect = folderElement.getBoundingClientRect();
      const availableWidth = window.innerWidth - rect.right - POPUP_GAP - 20; // 20px padding from edge
      
      // Only create nested popup if there's enough space
      if (availableWidth < MIN_POPUP_WIDTH) {
        return;
      }
      
      // Always destroy any popups at this level or deeper first
      destroyNestedPopupsFromLevel(level + 1);
      
      // Create new nested popup
      const nestedPopup = createNestedPopup(level + 1, folderElement);
      nestedPopups.push(nestedPopup);
      
      nestedPopup.element.innerHTML = `
        <div class="w-full flex items-center justify-center opacity-80 p-3">
          Loading…
        </div>
      `;
      
      // Position the nested popup
      nestedPopup.element.style.top = `${rect.top}px`;
      nestedPopup.element.style.left = `${rect.right + POPUP_GAP}px`;
      nestedPopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
      
      // Animate in
      requestAnimationFrame(() => {
        if (!nestedPopup.element.parentElement) return;
        nestedPopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
        nestedPopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
      });
      
      // Use deduped fetch to prevent multiple requests
      const result = await fetchPageDeduped(owner, repo, branch, folderPath);
      
      if (!nestedPopup.element.parentElement) return;
      
      if (result?.error) {
        nestedPopup.element.innerHTML = `
          <div class="p-3 opacity-80">
            ${getErrorMessage(result.error)}
          </div>
        `;
        return;
      }
      
      if (result?.empty) {
        nestedPopup.element.innerHTML = `
          <div class="p-3 opacity-60">
            Empty folder
          </div>
        `;
        return;
      }
      
      const pageData = result.data;
      
      // Render folder contents
      const rows = pageData.entries
        .slice(0, 25)
        .map((entry) => {
          const isFile = entry.type === "blob";
          const className = isFile
            ? "cursor-pointer hover:bg-white/20 transition-colors"
            : "hover:bg-white/10 cursor-pointer transition-colors";
          return `
          <div class="flex items-center gap-2 px-2 py-1 rounded ${className}" data-file="${isFile ? entry.name : ""}" data-type="${entry.type}" data-name="${entry.name}">
            <span class="opacity-80">
              ${entry.type === "tree" ? ICONS.folder : ICONS.file}
            </span>
            <span class="truncate">${entry.name}</span>
          </div>
        `;
        })
        .join("");
      
      const html = `
        <div class="flex flex-col gap-1 p-3">
          ${rows}
        </div>
      `;
      
      nestedPopup.element.innerHTML = html;
      
      // Add click handlers for files in nested popup
      nestedPopup.element.querySelectorAll("[data-type='blob']").forEach((fileEl) => {
        fileEl.addEventListener("click", (e) => {
          e.stopPropagation();
          const fileName = fileEl.getAttribute("data-file");
          const filePath = `${folderPath}/${fileName}`;
          const fileUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
          window.open(fileUrl, "_blank");
        });
      });
      
      // Add hover handlers for files to show preview from cached data
      nestedPopup.element.querySelectorAll("[data-type='blob']").forEach((fileEl) => {
        fileEl.addEventListener("mouseenter", (e) => {
          const fileName = fileEl.getAttribute("data-file");
          const fileContent = pageData.files[fileName];
          const filePath = `${folderPath}/${fileName}`;
          
          // Always destroy existing deeper nested popups first
          destroyNestedPopupsFromLevel(level + 2);
          
          // Check if it's an image file
          if (isImageFile(fileName)) {
            const rect = fileEl.getBoundingClientRect();
            const availableWidth = window.innerWidth - rect.right - POPUP_GAP - 20;
            
            if (availableWidth < MIN_POPUP_WIDTH) {
              return;
            }
            
            const filePopup = createNestedPopup(level + 2, fileEl);
            nestedPopups.push(filePopup);
            
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
            
            const previewHtml = `
              <div class="w-full flex items-center justify-center p-3">
                <img src="${rawUrl}" class="rounded-lg max-w-full max-h-full object-contain" style="max-height: 300px;" />
              </div>
            `;
            
            filePopup.element.innerHTML = previewHtml;
            
            // Position the file preview popup
            filePopup.element.style.top = `${rect.top}px`;
            filePopup.element.style.left = `${rect.right + POPUP_GAP}px`;
            filePopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
            
            // Animate in
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!filePopup.element.parentElement) return;
                filePopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
                filePopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
              });
            });
            
            // Handle mouse leave from file preview popup
            filePopup.element.addEventListener("mouseleave", (e) => {
              const movingToParent = nestedPopup.element.contains(e.relatedTarget);
              if (!movingToParent) {
                destroyNestedPopupsFromLevel(level + 2);
              }
            });
            
            return;
          }
          
          if (fileContent) {
            // Create preview popup for file
            const rect = fileEl.getBoundingClientRect();
            const availableWidth = window.innerWidth - rect.right - POPUP_GAP - 20;
            
            if (availableWidth < MIN_POPUP_WIDTH) {
              return;
            }
            
            const filePopup = createNestedPopup(level + 2, fileEl);
            nestedPopups.push(filePopup);
            
            const { code, truncated } = clampCode(fileContent, 30);
            const language = getPrismLanguage(fileName);
            
            const previewHtml = `
              <div class="w-full">
                <pre class="language-${language} text-[11px] leading-relaxed p-3">
<code class="language-${language}">${escapeHtml(code)}</code>
                </pre>
                ${truncated ? `<div class="px-3 pb-2 text-[10px] opacity-60">… truncated</div>` : ""}
              </div>
            `;
            
            filePopup.element.innerHTML = previewHtml;
            
            // Position the file preview popup
            filePopup.element.style.top = `${rect.top}px`;
            filePopup.element.style.left = `${rect.right + POPUP_GAP}px`;
            filePopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
            
            // Animate in - use double rAF to ensure styles are applied first
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!filePopup.element.parentElement) return;
                filePopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
                filePopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
                
                if (window.Prism) {
                  Prism.highlightAllUnder(filePopup.element);
                }
              });
            });
            
            // Handle mouse leave from file preview popup
            filePopup.element.addEventListener("mouseleave", (e) => {
              const movingToParent = nestedPopup.element.contains(e.relatedTarget);
              if (!movingToParent) {
                destroyNestedPopupsFromLevel(level + 2);
              }
            });
          }
        });
        
        fileEl.addEventListener("mouseleave", (e) => {
          // Check if moving to the file preview popup or staying within parent popup
          const movingToNested = nestedPopups.some(np => np.level > level + 1 && np.element.contains(e.relatedTarget));
          const movingToSibling = nestedPopup.element.contains(e.relatedTarget);
          
          // Only destroy if leaving to somewhere outside both
          if (!movingToNested && !movingToSibling) {
            destroyNestedPopupsFromLevel(level + 2);
          }
        });
      });
      
      // Recursively set up handlers for folders in the nested popup
      setupNestedFolderHandlers(nestedPopup.element, owner, repo, branch, folderPath, level + 1);
      
      // Handle mouse leave - only destroy if not moving to a deeper nested popup
      nestedPopup.element.addEventListener("mouseleave", (e) => {
        const movingToDeeper = nestedPopups.some(np => 
          np.level > level + 1 && np.element.contains(e.relatedTarget)
        );
        const movingToParent = parentElement.contains(e.relatedTarget) || 
                               (popup && popup.contains(e.relatedTarget));
        
        if (!movingToDeeper && !movingToParent) {
          destroyNestedPopupsFromLevel(level + 1);
        }
      });
    });
    
    // When leaving the folder element, check if we're going to the nested popup or sibling
    folderElement.addEventListener("mouseleave", (e) => {
      const movingToNested = nestedPopups.some(np => np.level >= level + 1 && np.element.contains(e.relatedTarget));
      const movingToSibling = parentElement.contains(e.relatedTarget);
      
      // Only destroy if leaving to somewhere outside both
      if (!movingToNested && !movingToSibling) {
        destroyNestedPopupsFromLevel(level + 1);
      }
    });
  });
}

function isImageFile(path) {
  return /\.(png|jpe?g|gif|svg|web?p)$/i.test(path);
}

function getRepoInfo() {
  const parts = location.pathname.split("/").filter(Boolean);
  return {
    owner: parts[0],
    repo: parts[1],
  };
}

function buildRawUrl(href) {
  const url = new URL(href);
  const parts = url.pathname.split("/").filter(Boolean);
  const owner = parts[0];
  const repo = parts[1];
  const branch = parts[3];
  const filePath = parts.slice(4).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
}

function positionPopup(e) {
  const offset = 15;
  const padding = 20; // padding from screen edge

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Calculate available height from cursor to bottom of viewport
  const availableHeight = viewportHeight - e.clientY - offset - padding;

  // Set max-height based on available space
  popup.style.maxHeight = `${Math.max(200, availableHeight)}px`;

  let top = e.clientY + offset;
  let left = e.clientX + offset;

  // Set initial position
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  // Adjust position after render if needed
  requestAnimationFrame(() => {
    if (!popup) return;

    const popupWidth = popup.offsetWidth;

    // Adjust if popup goes beyond right edge
    if (left + popupWidth > viewportWidth - padding) {
      left = Math.max(padding, viewportWidth - popupWidth - padding);
      popup.style.left = `${left}px`;
    }
  });
}

function highlightCode(code) {
  return code
    .replace(/"(.*?)"/g, `<span class="str">"$1"</span>`)
    .replace(/'(.*?)'/g, `<span class="str">'$1'</span>`)
    .replace(
      /\b(const|let|var|function|return|if|else|for|while|class|new|import|from)\b/g,
      `<span class="kw">$1</span>`
    );
}

function fetchViaBackground(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, resolve);
  });
}

// Deduped fetch - prevents multiple identical requests
async function fetchPageDeduped(owner, repo, branch, path) {
  const cacheKey = `${owner}/${repo}/${branch}/${path}`;
  
  // Return cached data if available
  if (pageCache.has(cacheKey)) {
    return { data: pageCache.get(cacheKey), fromCache: true };
  }
  
  // If request is already in flight, wait for it
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }
  
  // Create new request promise
  const requestPromise = (async () => {
    const res = await fetchViaBackground({
      type: "FETCH_PAGE",
      owner,
      repo,
      branch,
      path,
    });
    
    // Remove from pending
    pendingRequests.delete(cacheKey);
    
    // Handle errors
    if (res?.error) {
      return { error: res.error };
    }
    
    if (!res?.entries?.length) {
      return { empty: true };
    }
    
    // Cache successful response
    pageCache.set(cacheKey, res);
    return { data: res, fromCache: false };
  })();
  
  // Store pending request
  pendingRequests.set(cacheKey, requestPromise);
  
  return requestPromise;
}

function getErrorMessage(errorCode) {
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.DEFAULT;
}


function getPrismLanguage(path) {
  const ext = path.split(".").pop().toLowerCase();

  const map = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    py: "python",
    go: "go",
    rs: "rust",
    html: "markup",
    css: "css",
    md: "markdown",
    sh: "bash",
    yml: "yaml",
    yaml: "yaml",
  };

  return map[ext] || "none";
}

function clampCode(code, maxLines = 30) {
  const lines = code.split("\n");
  const sliced = lines.slice(0, maxLines).join("\n");
  return {
    code: sliced,
    truncated: lines.length > maxLines,
  };
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Helper function to attach event handlers to folder popup elements
function attachFolderPopupHandlers(popupElement, pageData, owner, repo, branch, basePath) {
  // Add click handlers for files
  popupElement.querySelectorAll("[data-type='blob']").forEach((fileElement) => {
    fileElement.addEventListener("click", (e) => {
      e.stopPropagation();
      const fileName = fileElement.getAttribute("data-file");
      const filePath = basePath ? `${basePath}/${fileName}` : fileName;
      const fileUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
      window.open(fileUrl, "_blank");
    });
  });
  
  // Add hover handlers for files to show preview from cached data
  popupElement.querySelectorAll("[data-type='blob']").forEach((fileElement) => {
    fileElement.addEventListener("mouseenter", (e) => {
      const fileName = fileElement.getAttribute("data-file");
      const fileContent = pageData.files ? pageData.files[fileName] : null;
      const filePath = basePath ? `${basePath}/${fileName}` : fileName;
      
      // Always destroy existing nested popups first when entering a new file
      destroyNestedPopupsFromLevel(1);
      
      // Check if it's an image file
      if (isImageFile(fileName)) {
        const rect = fileElement.getBoundingClientRect();
        const availableWidth = window.innerWidth - rect.right - POPUP_GAP - 20;
        
        if (availableWidth < MIN_POPUP_WIDTH) {
          return;
        }
        
        const nestedPopup = createNestedPopup(1, fileElement);
        nestedPopups.push(nestedPopup);
        
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
        
        const previewHtml = `
          <div class="w-full flex items-center justify-center p-3">
            <img src="${rawUrl}" class="rounded-lg max-w-full max-h-full object-contain" style="max-height: 300px;" />
          </div>
        `;
        
        nestedPopup.element.innerHTML = previewHtml;
        
        // Position the nested popup
        nestedPopup.element.style.top = `${rect.top}px`;
        nestedPopup.element.style.left = `${rect.right + POPUP_GAP}px`;
        nestedPopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
        
        // Animate in
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!nestedPopup.element.parentElement) return;
            nestedPopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
            nestedPopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
          });
        });
        
        // Handle mouse leave from nested popup
        nestedPopup.element.addEventListener("mouseleave", (e) => {
          const movingToParent = popupElement.contains(e.relatedTarget);
          if (!movingToParent) {
            destroyNestedPopupsFromLevel(1);
          }
        });
        
        return;
      }
      
      if (fileContent) {
        // Create preview popup for file
        const rect = fileElement.getBoundingClientRect();
        const availableWidth = window.innerWidth - rect.right - POPUP_GAP - 20;
        
        if (availableWidth < MIN_POPUP_WIDTH) {
          return;
        }
        
        const nestedPopup = createNestedPopup(1, fileElement);
        nestedPopups.push(nestedPopup);
        
        const { code, truncated } = clampCode(fileContent, 30);
        const language = getPrismLanguage(fileName);
        
        const previewHtml = `
          <div class="w-full">
            <pre class="language-${language} text-[11px] leading-relaxed p-3">
<code class="language-${language}">${escapeHtml(code)}</code>
            </pre>
            ${truncated ? `<div class="px-3 pb-2 text-[10px] opacity-60">… truncated</div>` : ""}
          </div>
        `;
        
        nestedPopup.element.innerHTML = previewHtml;
        
        // Position the nested popup
        nestedPopup.element.style.top = `${rect.top}px`;
        nestedPopup.element.style.left = `${rect.right + POPUP_GAP}px`;
        nestedPopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
        
        // Animate in - use double rAF to ensure styles are applied first
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!nestedPopup.element.parentElement) return;
            nestedPopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
            nestedPopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
            
            if (window.Prism) {
              Prism.highlightAllUnder(nestedPopup.element);
            }
          });
        });
        
        // Handle mouse leave from nested popup
        nestedPopup.element.addEventListener("mouseleave", (e) => {
          const movingToParent = popupElement.contains(e.relatedTarget);
          if (!movingToParent) {
            destroyNestedPopupsFromLevel(1);
          }
        });
      }
    });
    
    fileElement.addEventListener("mouseleave", (e) => {
      // Check if moving to the nested popup or staying within parent popup
      const movingToNested = nestedPopups.some(np => np.element.contains(e.relatedTarget));
      const movingToSibling = popupElement.contains(e.relatedTarget);
      
      // Only destroy if leaving to somewhere outside both
      if (!movingToNested && !movingToSibling) {
        destroyNestedPopupsFromLevel(1);
      }
    });
  });
  
  // Add hover handlers for folders
  setupNestedFolderHandlers(popupElement, owner, repo, branch, basePath, 0);
}

async function handleHover(e, link) {
  const href = link.href;

  // For non-folder items (files), we can use simple HTML cache
  if (cache.has(href) && !href.includes("/tree/")) {
    popup.innerHTML = cache.get(href);
    positionPopup(e);

    if (window.Prism) {
      Prism.highlightAllUnder(popup);
    }

    return;
  }

  popup.innerHTML = `
  <div class="w-full flex items-center justify-center opacity-80 p-3">
    Loading…
  </div>
`;

  if (isImageFile(href)) {
    const raw = buildRawUrl(href);

    popup.innerHTML = `
    <div class="w-full flex items-center justify-center p-3">
      <img id="peek-img" src="${raw}" class="rounded-lg max-w-full max-h-full object-contain" />
      </div>
    `;

    const img = popup.querySelector("#peek-img");

    img.onload = () => {
      if (!popup) return;
      cache.set(href, popup.innerHTML);
    };
    return;
  }

  const isFolder = href.includes("/tree/");

  if (isFolder) {
    const { owner, repo } = getRepoInfo();
    const parts = new URL(href).pathname.split("/").filter(Boolean);
    const branch = parts[3];
    const path = parts.slice(4).join("/");

    // Use deduped fetch to prevent multiple requests (also checks pageCache)
    const result = await fetchPageDeduped(owner, repo, branch, path);

    if (!popup) return;

    if (result?.error) {
      popup.innerHTML = `
        <div class="p-3 opacity-80">
          ${getErrorMessage(result.error)}
        </div>
      `;
      return;
    }

    if (result?.empty) {
      popup.innerHTML = `
        <div class="p-3 opacity-60">
          Empty folder
        </div>
      `;
      return;
    }

    const pageData = result.data;
    
    const rows = pageData.entries
      .slice(0, 25)
      .map(
        (entry) => {
          const isFile = entry.type === "blob";
          const className = isFile
            ? "cursor-pointer hover:bg-white/20 transition-colors"
            : "hover:bg-white/10";
          return `
        <div class="flex items-center gap-2 px-2 py-1 rounded ${className}" data-file="${isFile ? entry.name : ""}" data-type="${entry.type}">
          <span class="opacity-80">
            ${entry.type === "tree" ? ICONS.folder : ICONS.file}
          </span>
          <span class="truncate">${entry.name}</span>
        </div>
      `;
        }
      )
      .join("");

    const html = `
      <div class="flex flex-col gap-1 p-3">
        ${rows}
      </div>
    `;

    popup.innerHTML = html;
    
    // Always attach event handlers (this is the key fix!)
    attachFolderPopupHandlers(popup, pageData, owner, repo, branch, path);
    return;
  }

  const { owner, repo } = getRepoInfo();
  const parts = new URL(href).pathname.split("/").filter(Boolean);
  const branch = parts[3];
  const path = parts.slice(4).join("/");

  const res = await fetchViaBackground({
    type: "FETCH_FILE",
    owner,
    repo,
    branch,
    path,
  });
  if (!popup) return;

  if (res?.error) {
    popup.innerHTML = `
      <div class="p-3 opacity-80">
        ${getErrorMessage(res.error)}
      </div>
    `;
    return;
  }

  if (!res?.content) {
    popup.innerHTML = `<div class="p-3 opacity-85">Preview unavailable.</div>`;
    return;
  }

  const { code, truncated } = clampCode(res.content, 30);
  const language = getPrismLanguage(path);

  const html = `
  <div class="w-full">
    <pre class="language-${language} text-[11px] leading-relaxed p-3">
<code class="language-${language}">${escapeHtml(code)}</code>
    </pre>
    ${
      truncated
        ? `<div class="px-3 pb-2 text-[10px] opacity-60">… truncated</div>`
        : ""
    }
  </div>
`;

  cache.set(href, html);
  if (!popup) return;
  popup.innerHTML = html;
  Prism.highlightAllUnder(popup);
}

// mouse over
document.addEventListener("mouseover", (e) => {
  const link = e.target.closest('a[href*="/blob/"], a[href*="/tree/"]');
  if (!link || link === lastTarget) return;

  lastTarget = link;
  clearTimeout(hoverTimer);

  hoverTimer = setTimeout(() => {
    if (!popup) createPopup();
    positionPopup(e);

    // wait one frame so initial styles apply
    requestAnimationFrame(() => {
      if (!popup) return;
      popup.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
      popup.classList.add("opacity-100", "scale-100", "translate-y-0");
    });

    handleHover(e, link);
  }, HOVER_DELAY);
});

// mouse out
document.addEventListener("mouseout", (e) => {
  const link = e.target.closest('a[href*="/blob/"], a[href*="/tree/"]');

  // Only destroy if leaving both the link and popup
  if (link && link === lastTarget) {
    const relatedIsPopup = popup && popup.contains(e.relatedTarget);
    if (!relatedIsPopup) {
      hoverTimer = setTimeout(() => {
        if (!isPopupShown || (popup && !popup.matches(":hover"))) {
          clearTimeout(hoverTimer);
          unlockBodyScroll();
          destroyPopup();
          lastTarget = null;
        }
      }, 100);
    }
  }
});
