const HOVER_DELAY = 0;
const MAX_IMAGE_AREA = 480 * 320;
const POPUP_GAP = 10;
const MIN_POPUP_WIDTH = 200;
const cache = new Map();
const pageCache = new Map();
const pendingRequests = new Map();

let hoverTimer = null;
let popup = null;
let lastTarget = null;
let isPopupShown = false;
let nestedPopups = [];
let loginNotificationShown = false;

const ERROR_MESSAGES = {
  NO_TOKEN: "Please set your GitHub token in extension options.",
  RATE_LIMIT: "API rate limit exceeded. Please wait a moment before trying again.",
  PRIVATE_REPO_NO_ACCESS: "This is a private repository. Please sign in with private repo access enabled in the extension settings.",
  DEFAULT: "An error occurred. Please try again.",
};

// Placeholder function (no longer needed but called in destroyPopup)
function cancelPdfRender() {
  // No-op - PDF rendering happens in iframe now
}

function isPDFFile(path) {
  if (!path) return false;
  return /\.pdf$/i.test(path);
}

async function fetchPDFData(url) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.id) {
      reject(new Error('Extension context invalidated'));
      return;
    }

    chrome.runtime.sendMessage(
      { type: 'FETCH_PDF', url: url },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!response) {
          reject(new Error('No response from background script'));
          return;
        }
        
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Failed to fetch PDF'));
        }
      }
    );
  });
}

// Create PDF preview using iframe
function createPDFPreview(base64Data, options = {}) {
  return new Promise((resolve, reject) => {
    const { maxPages = 2, scale = 1.2, maxWidth = 380 } = options;
    
    // Create container
    const container = document.createElement('div');
    container.className = 'pdf-iframe-container';
    container.style.cssText = 'width: 100%; min-height: 100px;';
    
    // Create iframe pointing to our extension's PDF viewer
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('pdf-viewer.html');
    iframe.style.cssText = `
      width: 100%;
      min-height: 200px;
      border: none;
      background: transparent;
      display: block;
    `;
    iframe.setAttribute('scrolling', 'no');
    
    let timeoutId;
    let resolved = false;
    
    // Handle messages from iframe
    const messageHandler = (event) => {
      // Only accept messages from our iframe
      if (event.source !== iframe.contentWindow) return;
      
      if (event.data.type === 'PDF_VIEWER_READY') {
        // Send PDF data to iframe
        iframe.contentWindow.postMessage({
          type: 'RENDER_PDF',
          base64Data: base64Data,
          options: { maxPages, scale, maxWidth }
        }, '*');
      }
      
      if (event.data.type === 'PDF_RENDERED') {
        clearTimeout(timeoutId);
        window.removeEventListener('message', messageHandler);
        
        if (!resolved) {
          resolved = true;
          
          if (event.data.success) {
            // Adjust iframe height
            if (event.data.height) {
              iframe.style.height = `${event.data.height + 10}px`;
            }
            resolve(container);
          } else {
            reject(new Error(event.data.error || 'Failed to render PDF'));
          }
        }
      }
    };
    
    window.addEventListener('message', messageHandler);
    
    // Timeout after 15 seconds
    timeoutId = setTimeout(() => {
      window.removeEventListener('message', messageHandler);
      if (!resolved) {
        resolved = true;
        reject(new Error('PDF render timeout'));
      }
    }, 15000);
    
    container.appendChild(iframe);
    resolve(container);
  });
}

// ============================================
// Existing Helper Functions
// ============================================

async function checkAndNotifyLogin() {
  if (loginNotificationShown) return;
  
  const result = await new Promise((resolve) => {
    chrome.storage.sync.get(["githubToken", "dismissedLoginNotification"], resolve);
  });
  
  if (!result.githubToken && !result.dismissedLoginNotification) {
    showLoginNotification();
    loginNotificationShown = true;
  }
}

function expandTruncatedCode(containerElement, fullContent, language) {
  const preElement = containerElement.querySelector('pre');
  const codeElement = containerElement.querySelector('code');
  const truncatedMessage = containerElement.querySelector('.truncated-message');
  
  if (preElement && codeElement) {
    codeElement.textContent = fullContent;
    
    if (window.Prism) {
      Prism.highlightElement(codeElement);
    }
    
    if (truncatedMessage) {
      truncatedMessage.remove();
    }
  }
}

function showLoginNotification() {
  const notification = document.createElement("div");
  notification.id = "peek-a-repo-login-notification";
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 10000;
      background: rgba(20, 20, 30, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #e6edf3;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid rgba(240, 246, 252, 0.1);
      box-shadow: 0 8px 24px rgba(1, 4, 9, 0.8);
      max-width: 360px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      animation: slideInRight 0.2s ease-out;
    ">
      <div style="display: flex; gap: 12px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #e6edf3;">
            Authentication Required
          </div>
          <div style="font-size: 12px; line-height: 1.5; color: #7d8590; margin-bottom: 12px;">
            Sign in to preview files and folders on hover
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="peek-login-btn" style="
              background: #238636;
              color: #ffffff;
              border: none;
              padding: 5px 12px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.2s;
            ">
              Sign in
            </button>
            <button id="peek-dismiss-btn" style="
              background: transparent;
              color: #7d8590;
              border: 1px solid rgba(240, 246, 252, 0.1);
              padding: 5px 12px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
            ">
              Don't show again
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(20px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(20px); opacity: 0; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .animate-spin {
      animation: spin 1s linear infinite;
    }
    #peek-login-btn:hover { background: #2ea043; }
    #peek-dismiss-btn:hover {
      background: rgba(240, 246, 252, 0.1);
      border-color: rgba(240, 246, 252, 0.2);
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  document.getElementById("peek-login-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    dismissNotification();
  });
  
  document.getElementById("peek-dismiss-btn").addEventListener("click", () => {
    dismissNotification(true);
  });
  
  function dismissNotification(saveDismissal = false) {
    if (saveDismissal) {
      chrome.storage.sync.set({ dismissedLoginNotification: true });
    }
    
    const notif = document.getElementById("peek-a-repo-login-notification");
    if (notif) {
      notif.firstElementChild.style.animation = "slideOutRight 0.3s ease-out";
      setTimeout(() => notif.remove(), 300);
    }
  }
}

checkAndNotifyLogin();

const ICONS = {
  folder: `<svg aria-hidden="true" focusable="false" class="octicon octicon-file-directory-fill icon-directory" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" display="inline-block" overflow="visible" style="vertical-align:text-bottom"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"></path></svg>`,
  file: `<svg aria-hidden="true" focusable="false" class="octicon octicon-file color-fg-muted" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" display="inline-block" overflow="visible" style="vertical-align:text-bottom"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"></path></svg>`,
  pdf: `<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="vertical-align:text-bottom"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"></path><path d="M5.5 9a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 2.5a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z"></path></svg>`,
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
    },
    { passive: false }
  );
}

function destroyPopup() {
  if (!popup) return;

  cancelPdfRender();

  popup.classList.remove("opacity-100", "scale-100", "translate-y-0");
  popup.classList.add("opacity-0", "scale-[0.98]", "translate-y-1");

  const el = popup;
  popup = null;
  isPopupShown = false;
  unlockBodyScroll();
  
  nestedPopups.forEach(np => {
    np.element.classList.add("opacity-0", "scale-[0.98]", "translate-y-1");
    setTimeout(() => np.element.remove(), 150);
  });
  nestedPopups = [];
  
  setTimeout(() => {
    el.remove();
  }, 150);
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
    if (folderElement.dataset.hasListener) return;
    folderElement.dataset.hasListener = "true";
    
    folderElement.addEventListener("mouseenter", async (e) => {
      const folderName = folderElement.textContent.trim();
      const folderPath = basePath ? `${basePath}/${folderName}` : folderName;
      
      const rect = folderElement.getBoundingClientRect();
      const availableWidth = window.innerWidth - rect.right - POPUP_GAP - 20;
      
      if (availableWidth < MIN_POPUP_WIDTH) {
        return;
      }
      
      destroyNestedPopupsFromLevel(level + 1);
      
      const nestedPopup = createNestedPopup(level + 1, folderElement);
      nestedPopups.push(nestedPopup);
      
      nestedPopup.element.innerHTML = `
        <div class="w-full flex items-center justify-center opacity-80 p-3">
          Loading…
        </div>
      `;
      
      nestedPopup.element.style.top = `${rect.top}px`;
      nestedPopup.element.style.left = `${rect.right + POPUP_GAP}px`;
      nestedPopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
      
      requestAnimationFrame(() => {
        if (!nestedPopup.element.parentElement) return;
        nestedPopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
        nestedPopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
      });
      
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
      
      nestedPopup.element.querySelectorAll("[data-type='blob']").forEach((fileEl) => {
        fileEl.addEventListener("click", (e) => {
          e.stopPropagation();
          const fileName = fileEl.getAttribute("data-file");
          const filePath = `${folderPath}/${fileName}`;
          const fileUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
          window.open(fileUrl, "_blank");
        });
      });
      
      nestedPopup.element.querySelectorAll("[data-type='blob']").forEach((fileEl) => {
        fileEl.addEventListener("mouseenter", async (e) => {
          const fileName = fileEl.getAttribute("data-file");
          const fileContent = pageData.files[fileName];
          const filePath = `${folderPath}/${fileName}`;
          
          destroyNestedPopupsFromLevel(level + 2);
          
          // ===== FIX #1: Changed renderPDFPreview to createPDFPreview =====
          if (isPDFFile(fileName)) {
            const rect = fileEl.getBoundingClientRect();
            const availableWidth = window.innerWidth - rect.right - POPUP_GAP - 20;
            
            if (availableWidth < MIN_POPUP_WIDTH) {
              return;
            }
            
            const filePopup = createNestedPopup(level + 2, fileEl);
            nestedPopups.push(filePopup);
            
            filePopup.element.innerHTML = `
              <div class="w-full flex flex-col items-center justify-center p-4 gap-2">
                <div class="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
                <span class="text-[10px] opacity-60">Loading PDF…</span>
              </div>
            `;
            
            filePopup.element.style.top = `${rect.top}px`;
            filePopup.element.style.left = `${rect.right + POPUP_GAP}px`;
            filePopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
            
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!filePopup.element.parentElement) return;
                filePopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
                filePopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
              });
            });
            
            try {
              const pdfUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
              const base64Data = await fetchPDFData(pdfUrl);
              
              if (!filePopup.element.parentElement) return;
              
              // FIX: Use createPDFPreview instead of renderPDFPreview
              const container = await createPDFPreview(base64Data, {
                maxPages: 1,
                scale: 1.0,
                maxWidth: 300
              });
              
              filePopup.element.innerHTML = '';
              filePopup.element.appendChild(container);
              
            } catch (error) {
              if (!filePopup.element.parentElement) return;
              filePopup.element.innerHTML = `
                <div class="p-3 flex flex-col items-center gap-2">
                  <div class="text-xl">📄</div>
                  <div class="text-[10px] opacity-60 text-center">Unable to preview</div>
                </div>
              `;
            }
            
            filePopup.element.addEventListener("mouseleave", (e) => {
              const movingToParent = nestedPopup.element.contains(e.relatedTarget);
              if (!movingToParent) {
                destroyNestedPopupsFromLevel(level + 2);
              }
            });
            
            return;
          }
          // ===== END FIX #1 =====
          
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
            
            filePopup.element.style.top = `${rect.top}px`;
            filePopup.element.style.left = `${rect.right + POPUP_GAP}px`;
            filePopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
            
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!filePopup.element.parentElement) return;
                filePopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
                filePopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
              });
            });
            
            filePopup.element.addEventListener("mouseleave", (e) => {
              const movingToParent = nestedPopup.element.contains(e.relatedTarget);
              if (!movingToParent) {
                destroyNestedPopupsFromLevel(level + 2);
              }
            });
            
            return;
          }
          
          if (fileContent) {
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
              <div class="w-full code-preview-container">
                <pre class="language-${language} text-[11px] leading-relaxed p-3">
<code class="language-${language}">${escapeHtml(code)}</code>
                </pre>
                ${truncated ? `<div class="truncated-message px-3 pb-2 text-[10px] opacity-60">… truncated <button class="view-more-btn underline hover:opacity-80 cursor-pointer">View more</button></div>` : ""}
              </div>
            `;
            
            filePopup.element.innerHTML = previewHtml;
            
            if (truncated) {
              const viewMoreBtn = filePopup.element.querySelector('.view-more-btn');
              if (viewMoreBtn) {
                viewMoreBtn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const container = filePopup.element.querySelector('.code-preview-container');
                  expandTruncatedCode(container, fileContent, language);
                });
              }
            }
            
            filePopup.element.style.top = `${rect.top}px`;
            filePopup.element.style.left = `${rect.right + POPUP_GAP}px`;
            filePopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
            
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
            
            filePopup.element.addEventListener("mouseleave", (e) => {
              const movingToParent = nestedPopup.element.contains(e.relatedTarget);
              if (!movingToParent) {
                destroyNestedPopupsFromLevel(level + 2);
              }
            });
          }
        });
        
        fileEl.addEventListener("mouseleave", (e) => {
          const movingToNested = nestedPopups.some(np => np.level > level + 1 && np.element.contains(e.relatedTarget));
          const movingToSibling = nestedPopup.element.contains(e.relatedTarget);
          
          if (!movingToNested && !movingToSibling) {
            destroyNestedPopupsFromLevel(level + 2);
          }
        });
      });
      
      setupNestedFolderHandlers(nestedPopup.element, owner, repo, branch, folderPath, level + 1);
      
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
    
    folderElement.addEventListener("mouseleave", (e) => {
      const movingToNested = nestedPopups.some(np => np.level >= level + 1 && np.element.contains(e.relatedTarget));
      const movingToSibling = parentElement.contains(e.relatedTarget);
      
      if (!movingToNested && !movingToSibling) {
        destroyNestedPopupsFromLevel(level + 1);
      }
    });
  });
}

function isImageFile(path) {
  return /\.(png|jpe?g|gif|svg|webp)$/i.test(path);
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
  const padding = 20;

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  const availableHeight = viewportHeight - e.clientY - offset - padding;

  popup.style.maxHeight = `${Math.max(200, availableHeight)}px`;

  let top = e.clientY + offset;
  let left = e.clientX + offset;

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  requestAnimationFrame(() => {
    if (!popup) return;

    const popupWidth = popup.offsetWidth;

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

async function fetchPageDeduped(owner, repo, branch, path) {
  const cacheKey = `${owner}/${repo}/${branch}/${path}`;
  
  if (pageCache.has(cacheKey)) {
    return { data: pageCache.get(cacheKey), fromCache: true };
  }
  
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }
  
  const requestPromise = (async () => {
    const res = await fetchViaBackground({
      type: "FETCH_PAGE",
      owner,
      repo,
      branch,
      path,
    });
    
    pendingRequests.delete(cacheKey);
    
    if (res?.error) {
      return { error: res.error };
    }
    
    if (!res?.entries?.length) {
      return { empty: true };
    }
    
    pageCache.set(cacheKey, res);
    return { data: res, fromCache: false };
  })();
  
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

function attachFolderPopupHandlers(popupElement, pageData, owner, repo, branch, basePath) {
  popupElement.querySelectorAll("[data-type='blob']").forEach((fileElement) => {
    fileElement.addEventListener("click", (e) => {
      e.stopPropagation();
      const fileName = fileElement.getAttribute("data-file");
      const filePath = basePath ? `${basePath}/${fileName}` : fileName;
      const fileUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
      window.open(fileUrl, "_blank");
    });
  });
  
  popupElement.querySelectorAll("[data-type='blob']").forEach((fileElement) => {
    fileElement.addEventListener("mouseenter", async (e) => {
      const fileName = fileElement.getAttribute("data-file");
      const fileContent = pageData.files ? pageData.files[fileName] : null;
      const filePath = basePath ? `${basePath}/${fileName}` : fileName;
      
      destroyNestedPopupsFromLevel(1);
      
      if (isPDFFile(fileName)) {
        const rect = fileElement.getBoundingClientRect();
        const availableWidth = window.innerWidth - rect.right - POPUP_GAP - 20;
        
        if (availableWidth < MIN_POPUP_WIDTH) {
          return;
        }
        
        const nestedPopup = createNestedPopup(1, fileElement);
        nestedPopups.push(nestedPopup);
        
        nestedPopup.element.innerHTML = `
          <div class="w-full flex flex-col items-center justify-center p-4 gap-2">
            <div class="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
            <span class="text-[10px] opacity-60">Loading PDF…</span>
          </div>
        `;
        
        nestedPopup.element.style.top = `${rect.top}px`;
        nestedPopup.element.style.left = `${rect.right + POPUP_GAP}px`;
        nestedPopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
        
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!nestedPopup.element.parentElement) return;
            nestedPopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
            nestedPopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
          });
        });
        
        try {
          const pdfUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
          const base64Data = await fetchPDFData(pdfUrl);
          
          if (!nestedPopup.element.parentElement) return;
          
          const container = await createPDFPreview(base64Data, {
            maxPages: 1,
            scale: 1.0,
            maxWidth: 300
          });
          
          nestedPopup.element.innerHTML = '';
          nestedPopup.element.appendChild(container);
          
        } catch (error) {
          if (!nestedPopup.element.parentElement) return;
          nestedPopup.element.innerHTML = `
            <div class="p-3 flex flex-col items-center gap-2">
              <div class="text-xl">📄</div>
              <div class="text-[10px] opacity-60 text-center">Unable to preview</div>
            </div>
          `;
        }
        
        nestedPopup.element.addEventListener("mouseleave", (e) => {
          const movingToParent = popupElement.contains(e.relatedTarget);
          if (!movingToParent) {
            destroyNestedPopupsFromLevel(1);
          }
        });
        
        return;
      }
        
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
        
        nestedPopup.element.style.top = `${rect.top}px`;
        nestedPopup.element.style.left = `${rect.right + POPUP_GAP}px`;
        nestedPopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
        
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!nestedPopup.element.parentElement) return;
            nestedPopup.element.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
            nestedPopup.element.classList.add("opacity-100", "scale-100", "translate-y-0");
          });
        });
        
        nestedPopup.element.addEventListener("mouseleave", (e) => {
          const movingToParent = popupElement.contains(e.relatedTarget);
          if (!movingToParent) {
            destroyNestedPopupsFromLevel(1);
          }
        });
        
        return;
      }
      
      if (fileContent) {
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
          <div class="w-full code-preview-container">
            <pre class="language-${language} text-[11px] leading-relaxed p-3">
<code class="language-${language}">${escapeHtml(code)}</code>
            </pre>
            ${truncated ? `<div class="truncated-message px-3 pb-2 text-[10px] opacity-60">… truncated <button class="view-more-btn underline hover:opacity-80 cursor-pointer">View more</button></div>` : ""}
          </div>
        `;
        
        nestedPopup.element.innerHTML = previewHtml;
        
        if (truncated) {
          const viewMoreBtn = nestedPopup.element.querySelector('.view-more-btn');
          if (viewMoreBtn) {
            viewMoreBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const container = nestedPopup.element.querySelector('.code-preview-container');
              expandTruncatedCode(container, fileContent, language);
            });
          }
        }
        
        nestedPopup.element.style.top = `${rect.top}px`;
        nestedPopup.element.style.left = `${rect.right + POPUP_GAP}px`;
        nestedPopup.element.style.maxHeight = `${window.innerHeight - rect.top - 20}px`;
        
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
        
        nestedPopup.element.addEventListener("mouseleave", (e) => {
          const movingToParent = popupElement.contains(e.relatedTarget);
          if (!movingToParent) {
            destroyNestedPopupsFromLevel(1);
          }
        });
      }
    });
    
    fileElement.addEventListener("mouseleave", (e) => {
      const movingToNested = nestedPopups.some(np => np.element.contains(e.relatedTarget));
      const movingToSibling = popupElement.contains(e.relatedTarget);
      
      if (!movingToNested && !movingToSibling) {
        destroyNestedPopupsFromLevel(1);
      }
    });
  });
  
  setupNestedFolderHandlers(popupElement, owner, repo, branch, basePath, 0);
}

async function handleHover(e, link) {
  const href = link.href;

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

  // PDF Preview Handler
  if (isPDFFile(href)) {
    popup.innerHTML = `
      <div class="w-full flex flex-col items-center justify-center p-4 gap-2">
        <div class="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
        <span class="text-[11px] opacity-60">Loading PDF preview…</span>
      </div>
    `;

    try {
      const base64Data = await fetchPDFData(href);
      
      if (!popup) return;

      const container = await createPDFPreview(base64Data, {
        maxPages: 2,
        scale: 1.2,
        maxWidth: 380
      });

      if (!popup) return;
      
      popup.innerHTML = '';
      popup.appendChild(container);

    } catch (error) {
      if (!popup) return;
      
      console.error('PDF preview error:', error);
      popup.innerHTML = `
        <div class="p-4 flex flex-col items-center gap-2">
          <div class="text-2xl">📄</div>
          <div class="text-[11px] opacity-60 text-center">
            ${error.message === 'Extension context invalidated' 
              ? 'Please refresh the page' 
              : 'Unable to preview PDF'}
          </div>
          <a href="${href}" target="_blank" 
             class="text-[10px] text-blue-400 hover:text-blue-300 underline mt-1">
            Open in new tab
          </a>
        </div>
      `;
    }
    return;
  }

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
  <div class="w-full code-preview-container">
    <pre class="language-${language} text-[11px] leading-relaxed p-3">
<code class="language-${language}">${escapeHtml(code)}</code>
    </pre>
    ${
      truncated
        ? `<div class="truncated-message px-3 pb-2 text-[10px] opacity-60">… truncated <button class="view-more-btn underline hover:opacity-80 cursor-pointer">View more</button></div>`
        : ""
    }
  </div>
`;

  cache.set(href, html);
  if (!popup) return;
  popup.innerHTML = html;
  
  if (truncated) {
    const viewMoreBtn = popup.querySelector('.view-more-btn');
    if (viewMoreBtn) {
      viewMoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const container = popup.querySelector('.code-preview-container');
        expandTruncatedCode(container, res.content, language);
      });
    }
  }
  
  // ===== FIX #2: Added window.Prism check =====
  if (window.Prism) {
    Prism.highlightAllUnder(popup);
  }
  // ===== END FIX #2 =====
}

// Event Listeners
document.addEventListener("mouseover", (e) => {
  const link = e.target.closest('a[href*="/blob/"], a[href*="/tree/"]');
  if (!link || link === lastTarget) return;

  lastTarget = link;
  clearTimeout(hoverTimer);

  hoverTimer = setTimeout(() => {
    if (!popup) createPopup();
    positionPopup(e);

    requestAnimationFrame(() => {
      if (!popup) return;
      popup.classList.remove("opacity-0", "scale-[0.98]", "translate-y-1");
      popup.classList.add("opacity-100", "scale-100", "translate-y-0");
    });

    handleHover(e, link);
  }, HOVER_DELAY);
});

document.addEventListener("mouseout", (e) => {
  const link = e.target.closest('a[href*="/blob/"], a[href*="/tree/"]');

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