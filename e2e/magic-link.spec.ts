/**
 * Pure-logic coverage for the one piece of the monitoring path that cannot be
 * exercised without a live mailbox: recovering the sign-in token from whatever
 * encoding the relay chose. Runs in the default (mocked) projects so a PR check
 * catches a regression here without any monitoring credentials.
 */
import { expect, test } from '@playwright/test';
import { extractMagicLinkToken } from './support/magic-link';

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718';
const LINK = `https://vocabahn.app/auth/verify?token=${TOKEN}`;

/** What `EmailService.sendMagicLink` composes, before any transfer encoding. */
const PLAIN_BODY = `Sign in to Vocabahn:\n\nClick the link below to sign in (expires in 15 minutes):\n${LINK}\n\nIf you didn't request this link, you can safely ignore this email.`;

const HEADERS = [
  'From: Vocabahn <noreply@vocabahn.com>',
  'To: monitor@vocabahn.app',
  'Subject: Your Vocabahn sign-in link',
].join('\r\n');

test.describe('magic-link token extraction', () => {
  test('reads the token from an unencoded body', () => {
    const message = `${HEADERS}\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${PLAIN_BODY}`;
    expect(extractMagicLinkToken(message)).toBe(TOKEN);
  });

  test('reads the token through quoted-printable escaping and soft line breaks', () => {
    // `=` becomes `=3D`, and the relay wraps the line inside the token.
    const encoded =
      `https://vocabahn.app/auth/verify?token=3D${TOKEN.slice(0, 20)}=\r\n` +
      `${TOKEN.slice(20)}`;
    const message = `${HEADERS}\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nClick this link:\r\n${encoded}\r\n`;

    expect(extractMagicLinkToken(message)).toBe(TOKEN);
  });

  test('reads the token out of a base64-encoded part', () => {
    const base64 = Buffer.from(PLAIN_BODY, 'utf8')
      .toString('base64')
      .replace(/(.{76})/g, '$1\r\n');
    const message = `${HEADERS}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n`;

    expect(extractMagicLinkToken(message)).toBe(TOKEN);
  });

  test('prefers the first token in a multipart message', () => {
    const html = `<a href="${LINK}">Sign in</a>`;
    const message = [
      HEADERS,
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      '',
      PLAIN_BODY,
      '--b1',
      'Content-Type: text/html; charset=utf-8',
      '',
      html,
      '--b1--',
    ].join('\r\n');

    expect(extractMagicLinkToken(message)).toBe(TOKEN);
  });

  test('returns null for an unrelated email rather than a wrong token', () => {
    const message = `${HEADERS}\r\n\r\nYour weekly Vocabahn streak is 12 days. https://vocabahn.app/dashboard`;
    expect(extractMagicLinkToken(message)).toBeNull();
  });
});
