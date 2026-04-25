// ── Pre-registered OAuth client credentials (shipped with the app) ──────────
// Google explicitly allows embedding Client ID + Secret in installed/desktop
// apps — security comes from PKCE, not the secret.
// See: https://developers.google.com/identity/protocols/oauth2/native-app
//
// To bake credentials so end users get one-click sign-in:
//   1. Open https://console.cloud.google.com/projectcreate — name it "Focus OS"
//   2. Enable Gmail API at https://console.cloud.google.com/apis/library/gmail.googleapis.com
//   3. Configure OAuth consent screen at https://console.cloud.google.com/apis/credentials/consent
//      • User Type: External
//      • App name: Focus OS
//      • User support email: your email
//      • Developer contact: your email
//      • Scopes: add `https://mail.google.com/`
//      • Test users: add your own email (and anyone else who'll use the app
//        BEFORE you submit it for verification)
//   4. Create credentials at https://console.cloud.google.com/apis/credentials
//      • Create Credentials → OAuth client ID
//      • Application type: Desktop app
//      • Name: Focus OS Desktop
//      • Click Create — copy the Client ID and Client Secret
//   5. Paste both below, commit, push.
//
// Until you do that, the app falls back to the user-supplied fields in
// Settings → Gmail (set via Settings UI per-user).

export const SHIPPED_OAUTH = {
  clientId:     '',  // e.g. '1234567890-abc...apps.googleusercontent.com'
  clientSecret: '',  // e.g. 'GOCSPX-...'
};

/** True when the app was shipped with bundled OAuth credentials. */
export function hasShippedOAuth(): boolean {
  return !!(SHIPPED_OAUTH.clientId && SHIPPED_OAUTH.clientSecret);
}
