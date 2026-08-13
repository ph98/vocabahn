/**
 * Pulling the sign-in token back out of a delivered email.
 *
 * `EmailService.sendMagicLink` sends a multipart message whose text and HTML
 * parts both carry `<FRONTEND_URL>/auth/verify?token=<48 hex chars>`. What
 * arrives at the mailbox is not that string: the transfer encoding an SMTP
 * relay picks is its own business, and the two encodings in practical use both
 * mangle the URL — quoted-printable rewrites `=` as `=3D` and inserts soft line
 * breaks mid-token, base64 hides it entirely.
 *
 * So rather than guess at the MIME structure, try the raw source and each
 * plausible decoding of it, and take the first token that appears. Wrong
 * guesses cost nothing; a missed token costs a false outage alert.
 */

/** `<anything>/auth/verify?token=<hex>` — the token is 24 random bytes, hex-encoded. */
const TOKEN_PATTERN = /\/auth\/verify\?token=([A-Fa-f0-9]{32,})/;

/** Undo quoted-printable: drop soft line breaks, then decode `=XX` escapes. */
function decodeQuotedPrintable(source: string): string {
  return source
    .replace(/=\r?\n/g, '')
    .replace(/=([A-Fa-f0-9]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Decode every run of base64-looking lines in the source. A MIME part encoded
 * base64 is a block of long, alphabet-only lines; decoding each block on its own
 * keeps a failure in one part from hiding the token in another.
 */
function decodeBase64Blocks(source: string): string[] {
  const blocks = source.match(/(?:^[A-Za-z0-9+/=]{60,}\r?\n?)+/gm) ?? [];
  const decoded: string[] = [];
  for (const block of blocks) {
    try {
      decoded.push(Buffer.from(block.replace(/\s+/g, ''), 'base64').toString('utf8'));
    } catch {
      // Not actually base64 — the next candidate encoding may still match.
    }
  }
  return decoded;
}

/**
 * The sign-in token carried by a raw RFC-822 message, or null when the message
 * carries none (a welcome email, an unrelated notification, a stale digest).
 */
export function extractMagicLinkToken(rawMessage: string): string | null {
  const candidates = [
    rawMessage,
    decodeQuotedPrintable(rawMessage),
    ...decodeBase64Blocks(rawMessage),
  ];

  for (const candidate of candidates) {
    const match = TOKEN_PATTERN.exec(candidate);
    if (match) return match[1];
  }
  return null;
}
