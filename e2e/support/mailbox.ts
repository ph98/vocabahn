/**
 * Reading the monitoring account's magic link out of a real mailbox over IMAP.
 *
 * The alternative was querying `EmailOtp.token` straight out of Postgres. Two
 * things rule it out. Postgres is on an internal Docker network with no host
 * port and no public listener (`docker-compose.prod.yml`), so a CI runner can
 * only reach it by being handed shell access to the VPS — a much larger grant
 * than a monitoring job should hold. And reading the row proves only that a
 * token was minted: an SMTP relay that has stopped delivering would leave the
 * check green while no learner in the world could sign in.
 *
 * IMAP costs delivery latency (hence the polling) and cannot distinguish "the
 * API never issued a token" from "the mail was slow", but it exercises the
 * chain a learner actually depends on, and it needs nothing but an outbound
 * mailbox credential.
 */
import { ImapFlow } from 'imapflow';
import type { ImapConfig } from './monitor-config';
import { extractMagicLinkToken } from './magic-link';

/** The subject `EmailService.sendMagicLink` sends under. */
const MAGIC_LINK_SUBJECT = 'Your Vocabahn sign-in link';

/** Clock skew allowance between the runner and the mail server. */
const SKEW_MS = 120_000;

export interface WaitOptions {
  /** Ignore anything delivered before this instant — i.e. before we asked. */
  requestedAt: Date;
  /** Give up after this long. Delivery is usually seconds; slow relays exist. */
  timeoutMs?: number;
  /** Gap between mailbox polls. */
  pollIntervalMs?: number;
}

async function withMailbox<T>(
  imap: ImapConfig,
  run: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock(imap.mailbox);
    try {
      return await run(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/**
 * Deletes every sign-in email already sitting in the mailbox.
 *
 * Call this *before* asking for a link. Without it the first poll can find a
 * leftover message from an earlier run — already spent, since `requestEmailOtp`
 * invalidates an address's previous unused token — and the run fails at the
 * redirect with nothing to explain why. Best effort: a read-only mailbox is
 * still usable, just noisier.
 */
export async function purgeMagicLinks(imap: ImapConfig, address: string): Promise<void> {
  try {
    await withMailbox(imap, async (client) => {
      const matches = await client.search({ to: address, subject: MAGIC_LINK_SUBJECT });
      if (matches && matches.length > 0) {
        await client.messageDelete(matches.map(String).join(','), { uid: false });
      }
    });
  } catch {
    /* the wait below still filters on delivery time */
  }
}

async function findToken(client: ImapFlow, address: string, since: Date): Promise<string | null> {
  const matches = await client.search({ since, to: address, subject: MAGIC_LINK_SUBJECT });
  if (!matches || matches.length === 0) return null;

  // Newest first: an earlier link has already been invalidated by this request.
  for (const seq of [...matches].reverse()) {
    const message = await client.fetchOne(String(seq), { source: true });
    if (!message || !message.source) continue;

    const token = extractMagicLinkToken(message.source.toString('utf8'));
    if (!token) continue;

    // Consume it, so the next run cannot be fooled by a token already spent.
    try {
      await client.messageDelete(String(seq), { uid: false });
    } catch {
      /* mailbox is read-only or the server refuses expunge; not fatal */
    }
    return token;
  }
  return null;
}

/**
 * Waits for the sign-in email triggered at `requestedAt` and returns its token.
 * Throws with the elapsed time when none arrives — which is itself a finding:
 * either the API stopped issuing links or the mail path is broken.
 */
export async function waitForMagicLinkToken(
  imap: ImapConfig,
  address: string,
  { requestedAt, timeoutMs = 120_000, pollIntervalMs = 5_000 }: WaitOptions,
): Promise<string> {
  const since = new Date(requestedAt.getTime() - SKEW_MS);
  const deadline = Date.now() + timeoutMs;

  const token = await withMailbox(imap, async (client) => {
    for (;;) {
      const found = await findToken(client, address, since);
      if (found) return found;
      if (Date.now() >= deadline) return null;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  });

  if (token) return token;

  throw new Error(
    `No "${MAGIC_LINK_SUBJECT}" email reached ${address} within ${Math.round(timeoutMs / 1000)}s. ` +
      'Either POST /auth/email/request did not issue a link, or SMTP delivery is broken.',
  );
}
