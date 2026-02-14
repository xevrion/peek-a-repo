// NOTE: add the client id to oauth app
// NOTE: add the github authorization callback url as `https://<extension_id>.chromium.org/`
// NOTE: enable device flow
export const GITHUB_CLIENT_ID = "";
export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_API = "https://api.github.com/graphql";
export const GITHUB_LOGIN_OAUTH_DEVICE_CODE_URL = "https://github.com/login/device/code"
export const GITHUB_LOGIN_OAUTH_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"