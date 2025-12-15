const HOVER_DELAY = 300;
const cache = new Map();

let hoverTimer = null;
let popup = null;
let lastTarget = null;

function createPopup() {
  popup = document.createElement("div");
  popup.id = "peek-popup";
  document.body.appendChild(popup);
}

function destroyPopup() {
  if (popup) popup.remove();
  popup = null;
}

function isImageFile(path) {
  return /\.(png|jpe?g|gif|svg)$/i.test(path);
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

async function handleHover(e, link) {
  const href = link.href;

  if (cache.has(href)) {
    popup.innerHTML = cache.get(href);
    positionPopup(e);
    return;
  }

  popup.innerHTML = `<div class="peek-loading">Loading…</div>`;

  if (isImageFile(href)) {
    const raw = buildRawUrl(href);
    const html = `<img src="${raw}" class="peek-image" />`;
    cache.set(href, html);
    popup.innerHTML = html;
    return;
  }

  const { owner, repo } = getRepoInfo();
  const path = new URL(href).pathname.split("/").slice(4).join("/");

  const res = await fetchViaBackground({
    type: "FETCH_FILE",
    owner,
    repo,
    path,
  });

  if (res?.error === "NO_TOKEN") {
    popup.innerHTML = `<div class="peek-message">Please set your GitHub token in extension options.</div>`;
    return;
  }

  if (!res?.content) {
    popup.innerHTML = `<div class="peek-message">Preview unavailable.</div>`;
    return;
  }

  const html = `<pre class="peek-code">${highlightCode(res.content)}</pre>`;
  cache.set(href, html);
  popup.innerHTML = html;
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
