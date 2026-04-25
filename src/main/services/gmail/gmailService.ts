import { focusStore } from '../store';
import { secureStore } from '../keychain/secureStore';
import { fetchRecent } from './imapClient';
import { triageEmail } from './emailTriage';
import { v4 as uuid } from 'uuid';
import type { EmailDigestItem } from '../../../shared/schema/index';

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export const gmailService = {
  async connect(email: string, appPassword: string): Promise<{ ok: boolean; error?: string }> {
    console.log(`[gmailService] Connecting ${email}...`);
    try {
      // Test connection by fetching 1 email
      await fetchRecent(email, appPassword, 1);
      // Save credentials encrypted
      const encPassword = secureStore.encrypt(appPassword);
      focusStore.updateSettings({
        gmailEnabled: true,
        gmailEmail:   email,
        gmailAppPasswordEncrypted: encPassword,
      });
      console.log(`[gmailService] Connected as ${email}`);
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[gmailService] Connect failed for ${email}:`, msg);
      return { ok: false, error: msg };
    }
  },

  disconnect(): void {
    focusStore.updateSettings({
      gmailEnabled: false,
      gmailEmail:   undefined,
      gmailAppPasswordEncrypted: undefined,
    });
    this.stopPolling();
  },

  async fetchNow(): Promise<EmailDigestItem[]> {
    const settings = focusStore.getSettings();
    if (!settings.gmailEnabled || !settings.gmailEmail || !settings.gmailAppPasswordEncrypted) {
      return [];
    }
    const password = secureStore.decrypt(settings.gmailAppPasswordEncrypted);
    const fetched  = await fetchRecent(
      settings.gmailEmail,
      password,
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
