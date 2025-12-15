const HOVER_DELAY = 0;
const cache = new Map();

let hoverTimer = null;
let popup = null;
let lastTarget = null;

function createPopup() {
  popup = document.createElement("div");

  popup.className = `
    fixed z-[9999]
    w-[480px] h-[320px]
    p-3
    rounded-xl
    bg-[rgba(20,20,30,0.75)]
    backdrop-blur-md
    text-white text-xs
    shadow-2xl
    overflow-hidden
    pointer-events-none

    opacity-0 scale-[0.98] translate-y-1
    transition-all duration-150 ease-out
  `;

  document.body.appendChild(popup);
}

function destroyPopup() {
  if (!popup) return;

  popup.classList.remove("opacity-100", "scale-100", "translate-y-0");
  popup.classList.add("opacity-0", "scale-[0.98]", "translate-y-1");

  const el = popup;
  popup = null;

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
  popup.style.top = `${e.clientY + 15}px`;
  popup.style.left = `${e.clientX + 15}px`;
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
  <div class="w-full h-full flex items-center justify-center opacity-80">
    Loading…
  </div>
`;

  if (isImageFile(href)) {
    const raw = buildRawUrl(href);
    const html = `
  <div class="w-full h-full flex items-center justify-center">
    <img
      src="${raw}"
      class="max-w-full max-h-full object-contain rounded-lg"
      loading="lazy"
    />
  </div>
`;

    cache.set(href, html);
    if (!popup) return;
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
  <div class="w-full h-full overflow-hidden">
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

document.addEventListener("mousemove", (e) => {
  if (popup) positionPopup(e);
});

// mouse out
document.addEventListener("mouseout", (e) => {
  if (
    popup &&
    !popup.contains(e.relatedTarget) &&
    !e.relatedTarget?.closest?.('a[href*="/blob/"], a[href*="/tree/"]')
  ) {
    clearTimeout(hoverTimer);
    destroyPopup();
    lastTarget = null;
  }
});
