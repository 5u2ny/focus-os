import { shell } from 'electron';
import * as http from 'http';
import * as crypto from 'crypto';
import { focusStore } from '../store';
import { secureStore } from '../keychain/secureStore';

// ── Google OAuth2 for Gmail IMAP (XOAUTH2) ───────────────────────────────────
// Loopback redirect flow with PKCE — the modern recommended pattern for
// installed/desktop apps. No client_secret round-trip exposure.
//
// The user provides their own Client ID + Client Secret from Google Cloud
// Console (one-time, ~3 minutes). We then:
//   1. Spin up an http://127.0.0.1:<random>/callback server
//   2. Open the system browser to Google's OAuth consent URL
//   3. User signs in + grants the `https://mail.google.com/` scope
//   4. Google redirects back to our loopback with `code=...`
//   5. We exchange the code for an access_token + refresh_token
//   6. Store both encrypted in the focus store via Keychain
//   7. Future IMAP connects: refresh access_token if expired, then auth
//      via XOAUTH2 SASL (see imapClient.ts)

// Mail scope (full IMAP) PLUS openid+email so we can read the user's
// primary email address back from the userinfo endpoint. Without `email`
// the userinfo call returns 401 / empty.
const SCOPE = 'openid email https://mail.google.com/';
const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function genVerifier(): string {
  return b64url(crypto.randomBytes(32));
}

function challengeFor(verifier: string): string {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}

export interface OAuthResult {
  ok: true;
  email: string;
}
export interface OAuthError {
  ok: false;
  error: string;
}

export async function startOAuthFlow(
  clientId: string,
  clientSecret: string,
): Promise<OAuthResult | OAuthError> {
  if (!clientId.trim() || !clientSecret.trim()) {
    return { ok: false, error: 'Missing Client ID or Client Secret. Get them from Google Cloud Console.' };
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: OAuthResult | OAuthError) => {
      if (resolved) return;
      resolved = true;
      try { server.close(); } catch { /* ignore */ }
      clearTimeout(timer);
      resolve(result);
    };

    const verifier  = genVerifier();
    const challenge = challengeFor(verifier);
    const state     = b64url(crypto.randomBytes(16));
    let redirectUri = '';   // set when the loopback server actually binds

    // Spin up loopback server on a random free port
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') { res.writeHead(404).end('Not found'); return; }
      const code     = url.searchParams.get('code');
      const err      = url.searchParams.get('error');
      const gotState = url.searchParams.get('state');

      const respondHTML = (title: string, body: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html><head><title>${title}</title>
          <style>body{font:16px -apple-system,sans-serif;padding:48px;text-align:center;background:#0a0a10;color:#fff}
                 h1{font-size:22px;margin:0 0 12px}p{color:#888;margin:0}</style></head>
          <body><h1>${title}</h1><p>${body}</p></body></html>`);
      };

      if (err) { respondHTML('Sign-in cancelled', err); finish({ ok: false, error: err }); return; }
      if (!code || gotState !== state) {
        respondHTML('Invalid response', 'Missing code or state mismatch.');
        finish({ ok: false, error: 'Invalid OAuth response (missing code or state mismatch)' });
        return;
      }

      try {
        const tokens = await exchangeCode(clientId, clientSecret, code, verifier, redirectUri);
        if (!tokens.refresh_token) {
          respondHTML('Sign-in incomplete', 'Google did not return a refresh token. Revoke the app at myaccount.google.com/permissions and try again.');
          finish({ ok: false, error: 'Google did not return a refresh_token. Revoke the app at https://myaccount.google.com/permissions, then try again.' });
          return;
        }
        const email = await fetchPrimaryEmail(tokens);
        focusStore.updateSettings({
          gmailEnabled: true,
          gmailEmail: email,
          gmailOauthClientId: clientId,
          gmailOauthClientSecretEncrypted: secureStore.encrypt(clientSecret),
          gmailOauthRefreshTokenEncrypted: secureStore.encrypt(tokens.refresh_token),
          gmailOauthAccessTokenEncrypted:  secureStore.encrypt(tokens.access_token),
          gmailOauthAccessTokenExpiresAt:  Date.now() + (tokens.expires_in - 60) * 1000,
          gmailAppPasswordEncrypted: undefined,  // clear legacy path
        });
        respondHTML('Connected ✓', `You can close this tab and return to Focus OS.<br/><br/>Signed in as ${email}`);
        finish({ ok: true, email });
      } catch (e) {
        const msg = (e as Error).message;
        respondHTML('Sign-in failed', msg);
        finish({ ok: false, error: msg });
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      redirectUri = `http://127.0.0.1:${port}/callback`;

      const params = new URLSearchParams({
        client_id:             clientId,
        redirect_uri:          redirectUri,
        response_type:         'code',
        scope:                 SCOPE,
        code_challenge:        challenge,
        code_challenge_method: 'S256',
        access_type:           'offline',
        prompt:                'consent',
        state,
      });
      const authUrl = `${AUTH_URL}?${params.toString()}`;
      console.log(`[oauth] loopback server on ${redirectUri} — opening browser`);
      shell.openExternal(authUrl);
    });

    server.on('error', (e) => finish({ ok: false, error: `Loopback server error: ${e.message}` }));

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'Sign-in timed out after 5 minutes. Try again.' });
    }, 5 * 60_000);
  });
}

interface TokenResponse {
  access_token:  string;
  refresh_token?: string;
  expires_in:    number;
  token_type:    string;
  id_token?:     string;
}

async function exchangeCode(
  clientId: string, clientSecret: string,
  code: string, verifier: string, redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri, grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${json.error_description ?? json.error ?? res.statusText}`);
  return json as TokenResponse;
}

/**
 * Get the user's primary Gmail address. Tries two sources in order:
 *  1. The id_token's `email` claim (returned in the token exchange when
 *     `openid email` is in the scope list — no extra HTTP call needed).
 *  2. Fallback: the /oauth2/v2/userinfo endpoint.
 * Throws with the underlying HTTP status so the user sees a useful error
 * if both fail.
 */
async function fetchPrimaryEmail(tokens: TokenResponse): Promise<string> {
  // 1. id_token claim
  if (tokens.id_token) {
    try {
      const payload = tokens.id_token.split('.')[1];
      const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
      if (json.email && typeof json.email === 'string') return json.email;
    } catch { /* fall through to userinfo */ }
  }
  // 2. userinfo
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to fetch user email from Google (HTTP ${res.status}): ${body.slice(0, 120)}`);
  }
  const j = await res.json() as { email?: string };
  if (!j.email) throw new Error('Google did not return an email address (scope `email` missing?)');
  return j.email;
}

/**
 * Get a valid access token. Refreshes via refresh_token if expired.
 * Throws if no OAuth credentials saved or refresh fails.
 */
export async function getValidAccessToken(): Promise<{ email: string; accessToken: string }> {
  const s = focusStore.getSettings();
  if (!s.gmailOauthRefreshTokenEncrypted || !s.gmailOauthClientId
      || !s.gmailOauthClientSecretEncrypted || !s.gmailEmail) {
    throw new Error('Gmail OAuth not connected. Open Settings → Gmail to sign in.');
  }

  const stillValid = s.gmailOauthAccessTokenEncrypted && s.gmailOauthAccessTokenExpiresAt
                     && Date.now() < s.gmailOauthAccessTokenExpiresAt;
  if (stillValid) {
    return { email: s.gmailEmail, accessToken: secureStore.decrypt(s.gmailOauthAccessTokenEncrypted!) };
  }

  // Refresh
  const refreshToken = secureStore.decrypt(s.gmailOauthRefreshTokenEncrypted);
  const clientSecret = secureStore.decrypt(s.gmailOauthClientSecretEncrypted);
  const body = new URLSearchParams({
    client_id: s.gmailOauthClientId, client_secret: clientSecret,
    refresh_token: refreshToken, grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json() as Partial<TokenResponse> & { error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Token refresh failed: ${json.error ?? res.statusText}. You may need to reconnect Gmail.`);
  }
  focusStore.updateSettings({
    gmailOauthAccessTokenEncrypted: secureStore.encrypt(json.access_token),
    gmailOauthAccessTokenExpiresAt: Date.now() + (json.expires_in! - 60) * 1000,
  });
  console.log(`[oauth] refreshed access token (expires in ${json.expires_in}s)`);
  return { email: s.gmailEmail, accessToken: json.access_token };
}

export function disconnectOAuth(): void {
  focusStore.updateSettings({
    gmailEnabled: false,
    gmailOauthRefreshTokenEncrypted: undefined,
    gmailOauthAccessTokenEncrypted: undefined,
    gmailOauthAccessTokenExpiresAt: undefined,
    // Keep clientId/clientSecret so re-connecting doesn't require re-typing them
  });
}
