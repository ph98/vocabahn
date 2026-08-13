/**
 * Configuration for the live-monitoring project, and the one place that decides
 * a run cannot proceed.
 *
 * A monitoring suite whose credentials are missing must fail, loudly, naming
 * what is missing. The failure mode we are guarding against is a workflow that
 * reports green because an unset secret expanded to an empty string and every
 * meaningful assertion was skipped.
 */

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
}

export interface MonitorConfig {
  /** The deployed environment under test. */
  baseUrl: string;
  /** The disposable monitoring account's address. */
  email: string;
  /** Where its magic links are delivered. */
  imap: ImapConfig;
  /** Course to enrol the account in when it has no cards due (`''` disables). */
  seedCourseSlug: string;
}

function trimmed(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Reads and validates the monitoring environment, or throws listing every
 * variable that is absent. Called from a `beforeAll` so the whole project fails
 * at once with a single readable message instead of once per assertion.
 */
export function requireMonitorConfig(): MonitorConfig {
  const missing: string[] = [];
  const need = (name: string): string => {
    const value = trimmed(name);
    if (!value) missing.push(name);
    return value ?? '';
  };

  const baseUrl = need('E2E_BASE_URL');
  const email = need('MONITOR_EMAIL');
  const host = need('MONITOR_IMAP_HOST');
  const pass = need('MONITOR_IMAP_PASSWORD');
  const user = trimmed('MONITOR_IMAP_USER') ?? email;

  if (missing.length > 0) {
    throw new Error(
      [
        'Live monitoring cannot run: the following environment variables are unset.',
        ...missing.map((name) => `  - ${name}`),
        '',
        'See docs/system/monitoring.md for what each one is and how to obtain it.',
        'This is a hard failure on purpose — a monitoring run that silently skips',
        'its assertions is worse than no monitoring at all.',
      ].join('\n'),
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    email,
    imap: {
      host,
      port: Number(trimmed('MONITOR_IMAP_PORT') ?? 993),
      secure: (trimmed('MONITOR_IMAP_SECURE') ?? 'true') !== 'false',
      user,
      pass,
      mailbox: trimmed('MONITOR_IMAP_MAILBOX') ?? 'INBOX',
    },
    seedCourseSlug: process.env.MONITOR_COURSE_SLUG?.trim() ?? 'cefr-a1',
  };
}
