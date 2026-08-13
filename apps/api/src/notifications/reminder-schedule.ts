/**
 * Deciding, for a given moment, whose reminder is due — and which of *their*
 * days it counts against.
 *
 * Pure and clock-injected, for the same reason `stories/digest-schedule.ts` is:
 * a scheduler that reads `new Date()` itself cannot be tested, and this one has
 * to be right across the midnight boundary in every timezone at once.
 */

import { getDateKey, prevDateKey } from '../common/date-utils';

const MINUTES_PER_DAY = 24 * 60;

/**
 * The learner's local hour and minute at `now`, or null when the timezone is a
 * string Intl does not recognise — a stale or hand-edited value, which must
 * skip that learner rather than take the whole sweep down.
 */
export function localHourMinute(
  now: Date,
  timeZone: string,
): { hour: number; minute: number } | null {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now);
    const [rawHour, rawMinute] = formatted.split(':');
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    return { hour, minute };
  } catch {
    return null;
  }
}

/**
 * The local date key a reminder due *now* should be attributed to, or null when
 * none is due.
 *
 * Returning the date key rather than a boolean is the point: the caller claims
 * exactly this key in Redis, and the key is what makes the send once-per-day.
 * Near midnight the two can differ — a 23:50 reminder picked up by the 00:05
 * sweep belongs to the day that just ended, not the one that just started, and
 * attributing it to the wrong day would let the learner be pushed twice within
 * twenty minutes.
 *
 * A null timezone falls back to UTC rather than skipping the learner: someone
 * who has never sent one still asked for a reminder, just at a time we guessed.
 */
export function reminderSlot(
  now: Date,
  timeZone: string | null,
  hour: number,
  minute: number,
  catchUpMinutes: number,
): string | null {
  const zone = timeZone || 'UTC';
  const local = localHourMinute(now, zone);
  if (!local) return null;

  const nowMinutes = local.hour * 60 + local.minute;
  const targetMinutes = hour * 60 + minute;

  // Minutes since the target, wrapping across midnight so a target late in the
  // evening is still reachable by a sweep that lands after it.
  const elapsed = (nowMinutes - targetMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (elapsed >= catchUpMinutes) return null;

  const today = getDateKey(now, zone);
  // We wrapped: the target belongs to the local day that has just ended.
  return nowMinutes >= targetMinutes ? today : prevDateKey(today);
}
