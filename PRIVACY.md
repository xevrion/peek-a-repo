# Privacy Policy — Peek-a-Repo

**Last updated:** March 2026

## Summary

Peek-a-Repo does not collect, transmit, or store any personal data on external servers. All data stays on your device.

---

## What data is handled

**GitHub OAuth token**
- When you log in via GitHub OAuth, an access token is obtained using the device authorization flow.
- This token is stored locally in `chrome.storage.sync` (synced only to your own Chrome profile via Google's sync infrastructure — never sent to any server operated by this extension).
- The token is used solely to authenticate GitHub API requests made directly from your browser to `api.github.com`.

**GitHub API responses**
- File contents, folder listings, and image previews fetched from GitHub are cached temporarily in memory while the extension is running.
- No content is persisted to disk or transmitted anywhere beyond the direct GitHub API call.

---

## What is NOT collected

- No analytics or telemetry
- No user identifiers
- No browsing history
- No data is sent to any server operated by this extension

---

## Third-party services

The extension communicates only with:
- `api.github.com` — to fetch repository content
- `raw.githubusercontent.com` — to fetch raw file content
- `github.com` — for OAuth device flow and page interaction

No other third-party services are involved.

---

## How to delete your data

- **Logout:** Open the extension settings and click "Logout" to revoke and remove the stored token.
- **Uninstall:** Removing the extension from Chrome deletes all locally stored data associated with it.

---

## Contact

For questions or concerns, open an issue at: https://github.com/xevrion/peek-a-repo/issues
