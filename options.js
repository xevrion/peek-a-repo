import { GITHUB_CLIENT_ID, GITHUB_LOGIN_OAUTH_DEVICE_CODE_URL } from "./consts.js";

const input = document.getElementById("token");
const saveBtn = document.getElementById("save");
const oauthLoginBtn = document.getElementById("oauthLogin");
const logoutBtn = document.getElementById("logout");
const oauthStatus = document.getElementById("oauthStatus");
const tokenStatus = document.getElementById("tokenStatus");
const loggedInStatus = document.getElementById("loggedInStatus");
const loginSection = document.getElementById("loginSection");

// Preview Settings
const enableImagePreviews = document.getElementById("enableImagePreviews");
const enableCodePreviews = document.getElementById("enableCodePreviews");
const enableFolderPreviews = document.getElementById("enableFolderPreviews");
const enableDelay = document.getElementById("enableDelay");
const delayInput = document.getElementById("delayInput");
const delayInputContainer = document.getElementById("delayInputContainer");
const enableModifierKey = document.getElementById("enableModifierKey");
const shortcutRecorder = document.getElementById("shortcutRecorder");
const shortcutDisplay = document.getElementById("shortcutDisplay");
const recordShortcut = document.getElementById("recordShortcut");
const clearShortcut = document.getElementById("clearShortcut");

let isRecording = false;
let recordedKeys = null;

// Default settings
const DEFAULT_SETTINGS = {
  enableImagePreviews: true,
  enableCodePreviews: true,
  enableFolderPreviews: true,
  enableDelay: false,
  previewDelay: 0,
  enableModifierKey: false,
  modifierKey: null
};

// Check if user is already logged in
async function checkLoginStatus() {
  const { githubToken } = await chrome.storage.sync.get("githubToken");
  if (githubToken) {
    loggedInStatus.style.display = "block";
    loginSection.style.display = "none";
  } else {
    loggedInStatus.style.display = "none";
    loginSection.style.display = "block";
  }
  return githubToken;
}

// Load all settings
async function loadSettings() {
  // const settings = null;
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  
  enableImagePreviews.checked = settings.enableImagePreviews;
  enableCodePreviews.checked = settings.enableCodePreviews;
  enableFolderPreviews.checked = settings.enableFolderPreviews;
  enableDelay.checked = settings.enableDelay;
  delayInput.value = settings.previewDelay;
  delayInputContainer.style.display = settings.enableDelay ? "flex" : "none";
  
  enableModifierKey.checked = settings.enableModifierKey;
  shortcutRecorder.style.display = settings.enableModifierKey ? "flex" : "none";
  
  if (settings.modifierKey) {
    shortcutDisplay.textContent = formatShortcut(settings.modifierKey);
    clearShortcut.style.display = "inline-block";
  } else {
    shortcutDisplay.textContent = "None";
    clearShortcut.style.display = "none";
  }
}

// Save settings
async function saveSettings() {
  const settings = {
    enableImagePreviews: enableImagePreviews.checked,
    enableCodePreviews: enableCodePreviews.checked,
    enableFolderPreviews: enableFolderPreviews.checked,
    enableDelay: enableDelay.checked,
    previewDelay: parseInt(delayInput.value) || 0,
    enableModifierKey: enableModifierKey.checked,
    modifierKey: recordedKeys
  };
  
  await chrome.storage.sync.set(settings);
}

// Format shortcut display
function formatShortcut(keys) {
  if (!keys) return "None";
  
  const parts = [];
  if (keys.ctrl) parts.push("Ctrl");
  if (keys.alt) parts.push("Alt");
  if (keys.shift) parts.push("Shift");
  if (keys.meta) parts.push("Meta");
  if (keys.key && keys.key !== "Control" && keys.key !== "Alt" && keys.key !== "Shift" && keys.key !== "Meta") {
    parts.push(keys.key.toUpperCase());
  }
  
  return parts.join(" + ") || "None";
}

// Validate delay input
function validateDelayInput() {
  let value = parseInt(delayInput.value);
  
  // Handle invalid input
  if (isNaN(value)) {
    delayInput.value = 0;
    return;
  }
  
  // Clamp to valid range
  if (value < 0) delayInput.value = 0;
  if (value > 2000) delayInput.value = 2000;
  
  saveSettings();
}

async function init() {
	try {
		const token = await checkLoginStatus();
		if (token) {
			input.value = token;
		}
		await loadSettings();
		await restoreDeviceFlowState();
	} catch (error) {
		console.error("Initialization error:", error);
	}
}

init();

// Polling is handled by background.js so it continues even when the popup is closed

async function restoreDeviceFlowState() {
	const { deviceFlowState } = await chrome.storage.sync.get("deviceFlowState");

	if (!deviceFlowState) return;

	if (Date.now() > deviceFlowState.expires_at) {
		await chrome.storage.sync.remove("deviceFlowState");
		return;
	}

	oauthStatus.textContent = `Enter this code: ${deviceFlowState.user_code}`;
	oauthStatus.classList.add("show", "success");
	oauthLoginBtn.textContent = "Waiting for authorization...";
	oauthLoginBtn.disabled = true;

	// Tell background to poll (it may already be polling if it was running)
	chrome.runtime.sendMessage({ type: "START_DEVICE_POLL" }).catch(() => {});
}

// OAuth Login
oauthLoginBtn.addEventListener("click", async () => {
  oauthLoginBtn.disabled = true;
  oauthLoginBtn.textContent = "Connecting...";
  oauthStatus.textContent = "";
  oauthStatus.classList.remove("show", "success", "error");

  try {
    // Check if user wants private repo access
    const includePrivateRepos = document.getElementById("includePrivateRepos").checked;
    const scope = includePrivateRepos ? "repo read:user" : "read:user";
    
    // For Chrome extensions, we need to use GitHub's device flow instead
    // because we can't securely store client_secret in the extension
    
    // Step 1: Request device code
    const deviceResponse = await fetch(GITHUB_LOGIN_OAUTH_DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: scope,
      }),
    });

    const deviceData = await deviceResponse.json();
    
    if (deviceData.error) {
      throw new Error(deviceData.error_description || "Failed to initiate OAuth");
    }

    const expiresAt = Date.now() + deviceData.expires_in * 1000;
		await chrome.storage.sync.set({
			deviceFlowState: {
				user_code: deviceData.user_code,
				device_code: deviceData.device_code,
				verification_uri: deviceData.verification_uri,
				expires_at: expiresAt,
				interval: deviceData.interval || 5,
			},
		});

    // Copy code to clipboard and signal content script to show toast on the auth page
    navigator.clipboard.writeText(deviceData.user_code).catch(() => {});
    await chrome.storage.local.set({ copiedDeviceCode: deviceData.user_code });

    chrome.tabs.create({ url: deviceData.verification_uri });

		oauthStatus.textContent = `Enter this code: ${deviceData.user_code}`;
		oauthStatus.classList.add("show", "success");
		oauthLoginBtn.textContent = "Waiting for authorization...";

		// Hand off polling to background so it continues even if this popup is closed
		chrome.runtime.sendMessage({ type: "START_DEVICE_POLL" });
  } catch (error) {
    await chrome.storage.sync.remove("deviceFlowState");
    oauthStatus.textContent = `Error: ${error.message}`;
    oauthStatus.classList.remove("success");
    oauthStatus.classList.add("show", "error");
    oauthLoginBtn.disabled = false;
    oauthLoginBtn.textContent = "Sign in with GitHub";
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  await chrome.storage.sync.remove("githubToken");
  input.value = "";
  checkLoginStatus();
  tokenStatus.textContent = "";
  tokenStatus.classList.remove("show");
});

// Manual token save
saveBtn.addEventListener("click", async () => {
  const token = input.value.trim();
  
  if (!token) {
    tokenStatus.textContent = "Please enter a token";
    tokenStatus.classList.remove("success");
    tokenStatus.classList.add("show", "error");
    return;
  }

  await chrome.storage.sync.set({ githubToken: token });
  tokenStatus.textContent = "✓ Token saved successfully!";
  tokenStatus.classList.remove("error");
  tokenStatus.classList.add("show", "success");
  
  setTimeout(() => {
    checkLoginStatus();
  }, 1000);
});

// Toggle switches event listeners
enableImagePreviews.addEventListener("change", saveSettings);
enableCodePreviews.addEventListener("change", saveSettings);
enableFolderPreviews.addEventListener("change", saveSettings);

// Delay toggle
enableDelay.addEventListener("change", () => {
  delayInputContainer.style.display = enableDelay.checked ? "flex" : "none";
  saveSettings();
});

// Delay input
delayInput.addEventListener("input", validateDelayInput);
delayInput.addEventListener("blur", validateDelayInput);

// Modifier key toggle
enableModifierKey.addEventListener("change", () => {
  shortcutRecorder.style.display = enableModifierKey.checked ? "flex" : "none";
  saveSettings();
});

// Record shortcut
recordShortcut.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// Clear shortcut
clearShortcut.addEventListener("click", () => {
  recordedKeys = null;
  shortcutDisplay.textContent = "None";
  clearShortcut.style.display = "none";
  saveSettings();
});

function startRecording() {
  isRecording = true;
  recordShortcut.textContent = "Press keys...";
  recordShortcut.classList.add("recording");
  shortcutDisplay.textContent = "Listening...";
  shortcutDisplay.classList.add("recording");
  
  // Disable all other controls while recording
  disableAllControls(true);
  
  // Add global keyboard listener
  document.addEventListener("keydown", handleRecordKeyDown, true);
  document.addEventListener("keyup", handleRecordKeyUp, true);
}

function stopRecording() {
  isRecording = false;
  recordShortcut.textContent = "Record";
  recordShortcut.classList.remove("recording");
  shortcutDisplay.classList.remove("recording");
  
  // Remove keyboard listeners
  document.removeEventListener("keydown", handleRecordKeyDown, true);
  document.removeEventListener("keyup", handleRecordKeyUp, true);
  
  // Re-enable all controls after recording is done
  disableAllControls(false);
}

function handleRecordKeyDown(e) {
  if (!isRecording) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Record the key combination
  recordedKeys = {
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
    key: e.key
  };
  
  // Update display
  shortcutDisplay.textContent = formatShortcut(recordedKeys);
}

function handleRecordKeyUp(e) {
  if (!isRecording) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Stop recording after key is released
  if (recordedKeys) {
    clearShortcut.style.display = "inline-block";
    saveSettings();
    stopRecording();
  }
}

// Listen for login results sent by background.js polling
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "LOGIN_COMPLETE") {
    oauthStatus.textContent = "Successfully connected to GitHub!";
    oauthStatus.classList.remove("error");
    oauthStatus.classList.add("show", "success");
    setTimeout(() => {
      checkLoginStatus();
      oauthLoginBtn.disabled = false;
      oauthLoginBtn.textContent = "Sign in with GitHub";
    }, 1500);
  }

  if (msg.type === "DEVICE_FLOW_EXPIRED") {
    oauthStatus.textContent = "Authorization expired. Please try again.";
    oauthStatus.classList.remove("success");
    oauthStatus.classList.add("show", "error");
    oauthLoginBtn.disabled = false;
    oauthLoginBtn.textContent = "Sign in with GitHub";
  }

  if (msg.type === "DEVICE_FLOW_ERROR") {
    oauthStatus.textContent = `Error: ${msg.error}`;
    oauthStatus.classList.remove("success");
    oauthStatus.classList.add("show", "error");
    oauthLoginBtn.disabled = false;
    oauthLoginBtn.textContent = "Sign in with GitHub";
  }
});

// Handle login completing while popup was closed — detect token being set in storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  if (changes.githubToken?.newValue && oauthLoginBtn.disabled) {
    oauthStatus.textContent = "Successfully connected to GitHub!";
    oauthStatus.classList.remove("error");
    oauthStatus.classList.add("show", "success");
    setTimeout(() => {
      checkLoginStatus();
      oauthLoginBtn.disabled = false;
      oauthLoginBtn.textContent = "Sign in with GitHub";
    }, 1500);
  }
});

// Disable or enable all controls except the record button so that user can't interact with them while recording
function disableAllControls(disable) {
  const controls = [
    enableImagePreviews,
    enableCodePreviews,
    enableFolderPreviews,
    enableDelay,
    delayInput,
    enableModifierKey,
    clearShortcut
  ];
  
  controls.forEach(control => {
    control.disabled = disable;
  });
  
  // Don't disable the record button itself
}

