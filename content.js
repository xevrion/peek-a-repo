const HOVER_DELAY = 0;
const MAX_IMAGE_AREA = 480 * 320;
const cache = new Map();

let hoverTimer = null;
let popup = null;
let lastTarget = null;
let isPopupShown = false;

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

  popup.addEventListener("mouseleave", () => {
    unlockBodyScroll();
    destroyPopup();
    lastTarget = null;
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
  setTimeout(() => {
    el.remove();
  }, 150); // must match transition duration
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

async function handleHover(e, link) {
  const href = link.href;

  if (cache.has(href)) {
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

    const res = await fetchViaBackground({
      type: "FETCH_FOLDER",
      owner,
      repo,
      branch,
      path,
    });

    if (!popup) return;

    if (res?.error === "NO_TOKEN") {
      popup.innerHTML = `
        <div class="p-3 opacity-80">
          Please set your GitHub token in extension options.
        </div>
      `;
      return;
    }

    if (!res?.entries?.length) {
      popup.innerHTML = `
        <div class="p-3 opacity-60">
          Empty folder
        </div>
      `;
      return;
    }

    const rows = res.entries
      .slice(0, 25)
      .map(
        (entry) => `
        <div class="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/10">
          <span class="opacity-80">
            ${entry.type === "tree" ? ICONS.folder : ICONS.file}
          </span>
          <span class="truncate">${entry.name}</span>
        </div>
      `
      )
      .join("");

    const html = `
      <div class="flex flex-col gap-1 p-3">
        ${rows}
      </div>
    `;

    cache.set(href, html);
    popup.innerHTML = html;
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

  if (res?.error === "NO_TOKEN") {
    popup.innerHTML = `
  <div class="p-3 opacity-80">
    Please set your GitHub token in extension options.
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
