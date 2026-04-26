import { focusStore } from '../store';
import { secureStore } from '../keychain/secureStore';
import { fetchRecent } from './imapClient';
import { triageEmail } from './emailTriage';
import { startOAuthFlow, getValidAccessToken, disconnectOAuth } from './oauth';
import { SHIPPED_OAUTH, hasShippedOAuth } from './oauthConfig';
import { v4 as uuid } from 'uuid';
import type { EmailDigestItem } from '../../../shared/schema/index';

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export const gmailService = {
  async connect(email: string, appPassword: string): Promise<{ ok: boolean; error?: string }> {
    console.log(`[gmailService] Connecting ${email}...`);
    // Quick client-side sanity checks before hitting the network
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: `That doesn't look like a valid email address.` };
    }
    const cleanPwd = appPassword.replace(/\s+/g, '');
    if (cleanPwd.length !== 16) {
      return { ok: false, error: `App Passwords are exactly 16 characters (you entered ${cleanPwd.length}). Generate one at https://myaccount.google.com/apppasswords — your regular Gmail password will NOT work.` };
    }

    try {
      await fetchRecent(email, appPassword, 1);
      const encPassword = secureStore.encrypt(appPassword);
      focusStore.updateSettings({
        gmailEnabled: true,
        gmailEmail:   email,
        gmailAppPasswordEncrypted: encPassword,
      });
      console.log(`[gmailService] Connected as ${email}`);
      return { ok: true };
    } catch (err) {
      const raw = (err as Error).message || String(err);
      console.error(`[gmailService] Connect failed for ${email}:`, raw);
      // Translate cryptic IMAP errors into actionable guidance
      const lower = raw.toLowerCase();
      let friendly = raw;
      if (lower.includes('invalid credentials') || lower.includes('authentication') || lower.includes('lookup failed')) {
        friendly =
          'Gmail rejected the password. Three things to check: ' +
          '(1) 2-factor auth must be ON for your Google account; ' +
          '(2) generate a fresh App Password at myaccount.google.com/apppasswords (not your regular Gmail password); ' +
          '(3) IMAP must be enabled in Gmail → Settings → Forwarding and POP/IMAP.';
      } else if (lower.includes('timeout')) {
        friendly = 'Connection to imap.gmail.com timed out. Check your network or firewall.';
      } else if (lower.includes('enotfound') || lower.includes('econnrefused')) {
        friendly = `Couldn't reach imap.gmail.com. Check your internet connection.`;
      }
      return { ok: false, error: friendly };
    }
  },

  disconnect(): void {
    disconnectOAuth();
    focusStore.updateSettings({
      gmailEnabled: false,
      gmailEmail:   undefined,
      gmailAppPasswordEncrypted: undefined,
    });
    this.stopPolling();
  },

  /**
   * OAuth2 entry point. Prefers credentials shipped with the app (so the
   * end user gets a true one-click experience). Falls back to user-supplied
   * values if no shipped credentials are baked in yet.
   */
  async oauthConnect(userClientId?: string, userClientSecret?: string) {
    const id     = hasShippedOAuth() ? SHIPPED_OAUTH.clientId     : (userClientId     ?? '').trim();
    const secret = hasShippedOAuth() ? SHIPPED_OAUTH.clientSecret : (userClientSecret ?? '').trim();
    if (!id || !secret) {
      return { ok: false as const,
        error: 'No OAuth credentials available. Either bake them into oauthConfig.ts (one-click for everyone) or paste them in Settings → Gmail.' };
    }
    return startOAuthFlow(id, secret);
  },

  /** True when the app has its own OAuth credentials embedded — UI hides the Client ID/Secret fields when so. */
  hasShippedOAuth(): boolean {
    return hasShippedOAuth();
  },

  async fetchNow(): Promise<EmailDigestItem[]> {
    const settings = focusStore.getSettings();
    if (!settings.gmailEnabled || !settings.gmailEmail) return [];

    // Prefer OAuth (works for Workspace), fall back to App Password.
    // If token refresh fails (revoked credentials, expired refresh token,
    // rotated client secret), mark Gmail as disconnected so the UI surfaces
    // a "Reconnect Gmail" prompt instead of swallowing the error silently.
    let auth: string | { accessToken: string };
    if (settings.gmailOauthRefreshTokenEncrypted) {
      try {
        const { accessToken } = await getValidAccessToken();
        auth = { accessToken };
      } catch (err) {
        const msg = (err as Error).message;
        console.error('[gmailService] Token refresh failed — disconnecting Gmail:', msg);
        focusStore.updateSettings({
          gmailEnabled: false,
          gmailOauthAccessTokenEncrypted: undefined,
          gmailOauthAccessTokenExpiresAt: undefined,
        });
        // Re-throw so the caller's catch block can show the user a banner
        throw new Error(`Gmail disconnected: ${msg}. Open Settings → Gmail to reconnect.`);
      }
    } else if (settings.gmailAppPasswordEncrypted) {
      auth = secureStore.decrypt(settings.gmailAppPasswordEncrypted);
    } else {
      return [];
    }

    const fetched  = await fetchRecent(
      settings.gmailEmail,
      auth,
      settings.gmailMaxResultsPerFetch,
    );

    const items: EmailDigestItem[] = fetched.map(e => ({
      id:         String(e.uid),
      from:       e.from,
      subject:    e.subject,
      preview:    e.body.slice(0, 200),
      receivedAt: e.receivedAt.getTime(),
      importance: 'medium' as const,
      read:       e.flags.includes('\\Seen'),
      archived:   false,
    }));

    // Save base items immediately
    items.forEach(item => focusStore.upsertEmail(item));

    // Triage with LLM in background (don't block)
    (async () => {
      for (let i = 0; i < fetched.length; i++) {
        try {
          const triage = await triageEmail(fetched[i]);
          const updated = { ...items[i], ...triage };
          focusStore.upsertEmail(updated);
        } catch { /* LLM triage is optional */ }
      }
    })();

    return items;
  },

  list(): EmailDigestItem[] {
    return focusStore.get('emails').filter(e => !e.archived);
  },

  archive(id: string): void {
    const emails = focusStore.get('emails').map(e =>
      e.id === id ? { ...e, archived: true } : e,
    );
    focusStore.set('emails', emails);
  },

  startPolling(onFetch?: (items: EmailDigestItem[]) => void): void {
    this.stopPolling();
    const intervalMin = focusStore.getSettings().gmailFetchIntervalMin;
    pollingInterval = setInterval(async () => {
      try {
        const items = await this.fetchNow();
        onFetch?.(items);
      } catch (err) {
        console.error('[gmailService] Poll failed:', err);
      }
    }, intervalMin * 60 * 1000);
  },

  stopPolling(): void {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  },
};
