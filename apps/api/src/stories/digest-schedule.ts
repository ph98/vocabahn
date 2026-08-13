/**
 * Deciding, for a given moment, whose morning it is.
 *
 * Pure and clock-injected: the scheduler wakes hourly and must answer this the
 * same way regardless of where the server happens to be, which is exactly the
 * kind of thing that is untestable once it reads `new Date()` itself.
 */

/** Local hour a learner's story should be waiting for them. */
export const STORY_DIGEST_HOUR = Number(process.env.STORY_DIGEST_HOUR ?? 7);

/**
 * The learner's local hour (0–23) at `now`, or null when the timezone string is
 * one Intl does not recognise — a stale or hand-edited value, which must not
 * take the whole sweep down with it.
 */
export function localHour(now: Date, timeZone: string): number | null {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now);
    const hour = Number(formatted);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
  } catch {
    return null;
  }
}

/**
 * Whether it is currently the digest hour for this learner.
 *
 * A null timezone falls back to UTC rather than being skipped: a learner who
 * has never sent one still deserves a story, just at a time we guessed. The
 * comparison is on the hour, not a window, because the caller runs hourly —
 * paired with the per-day Redis guard, a duplicate run inside the same hour
 * produces one story, and a missed run produces none rather than a late one.
 */
export function isDigestHour(
  now: Date,
  timeZone: string | null,
  digestHour = STORY_DIGEST_HOUR,
): boolean {
  return localHour(now, timeZone || 'UTC') === digestHour;
}
