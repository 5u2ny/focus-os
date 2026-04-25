import Imap from 'imap';
import { simpleParser } from 'mailparser';

export interface FetchedEmail {
  uid: number;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
  flags: string[];
}

const TIMEOUT_MS = 30_000;

/**
 * Build the XOAUTH2 SASL string per RFC 5050:
 *   "user=<email>\x01auth=Bearer <accessToken>\x01\x01"
 * then base64-encoded. The `imap` library accepts this directly via the
 * `xoauth2` constructor option.
 */
function buildXOAuth2(email: string, accessToken: string): string {
  const raw = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(raw).toString('base64');
}

/**
 * Connect to Gmail IMAP and fetch the latest N messages. Auth method is
 * decided by the auth arg: pass `{ password }` for App Password (legacy)
 * or `{ accessToken }` for OAuth2 (XOAUTH2).
 */
export async function fetchRecent(
  email: string,
  auth: string | { password?: string; accessToken?: string },
  maxResults = 20,
): Promise<FetchedEmail[]> {
  const fetchPromise = new Promise<FetchedEmail[]>((resolve, reject) => {
    // Backward-compat: if `auth` is a string, treat it as App Password
    const a = typeof auth === 'string' ? { password: auth } : auth;
    const imapOpts: any = {
      user: email,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    };
    if (a.accessToken) {
      imapOpts.xoauth2 = buildXOAuth2(email, a.accessToken);
    } else if (a.password) {
      imapOpts.password = a.password.replace(/\s+/g, '');
    } else {
      reject(new Error('IMAP auth requires either a password (App Password) or accessToken (OAuth2)'));
      return;
    }
    const imap = new Imap(imapOpts);

    const results: FetchedEmail[] = [];
    const parsePromises: Promise<void>[] = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) return reject(err);
        if (box.messages.total === 0) { imap.end(); return; }

        const start = Math.max(1, box.messages.total - maxResults + 1);
        const f = imap.seq.fetch(`${start}:*`, { bodies: '', struct: true });

        f.on('message', (msg) => {
          let uid   = 0;
          let flags: string[] = [];

          msg.on('attributes', (attrs) => {
            uid   = attrs.uid;
            flags = attrs.flags;
          });

          msg.on('body', (stream) => {
            const p = simpleParser(stream as any).then((parsed) => {
              results.push({
                uid,
                from:       parsed.from?.text ?? '',
                subject:    parsed.subject ?? '(no subject)',
                body:       parsed.text ?? '',
                receivedAt: parsed.date ?? new Date(),
                flags,
              });
            }).catch(() => { /* skip malformed */ });
            parsePromises.push(p);
          });
        });

        f.once('end', () => imap.end());
        f.once('error', reject);
      });
    });

    imap.once('error', reject);
    imap.once('end', async () => {
      await Promise.all(parsePromises);
      resolve(results);
    });

    imap.connect();
  });

  return Promise.race([
    fetchPromise,
    new Promise<FetchedEmail[]>((_, reject) =>
      setTimeout(() => reject(new Error('IMAP timeout')), TIMEOUT_MS),
    ),
  ]);
}
