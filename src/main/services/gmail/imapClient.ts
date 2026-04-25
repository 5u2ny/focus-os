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

export async function fetchRecent(
  email: string,
  appPassword: string,
  maxResults = 20,
): Promise<FetchedEmail[]> {
  const fetchPromise = new Promise<FetchedEmail[]>((resolve, reject) => {
    const imap = new Imap({
      user: email,
      password: appPassword.replace(/\s+/g, ''), // strip spaces from App Passwords
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

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
