/** The sweep that decides whose reminder is due. Carries no payload. */
export const REMINDER_QUEUE = 'study-reminder';

export type ReminderJobData = Record<string, never>;

/**
 * Cron for the sweep. Every 15 minutes, so a learner-chosen time with minute
 * granularity is honoured to within a quarter of an hour — the story digest's
 * hourly sweep only ever had to hit an hour.
 */
export const REMINDER_SWEEP_CRON = '*/15 * * * *';

/**
 * How long after the chosen time a reminder may still be sent.
 *
 * The sweep fires on the first tick at or after the learner's time, so in
 * normal operation the delay is under a sweep interval. The window exists for
 * the abnormal cases: a deploy or an outage that swallows a few ticks should
 * produce a slightly late reminder rather than none, and a learner who opts in
 * at 22:00 with a 19:00 time should *not* be pushed at instantly.
 */
export const REMINDER_CATCH_UP_MINUTES = 90;

/** Days of review history read to compute the streak quoted in the copy. */
export const REMINDER_STREAK_WINDOW_DAYS = 60;

/**
 * TTL on the per-learner, per-local-day claim key. Comfortably past the local
 * day (any timezone, either side of UTC) without pinning keys forever.
 */
export const REMINDER_CLAIM_TTL_SECONDS = 129_600; // 36 h

/** Where a tapped reminder lands. */
export const REMINDER_TARGET_PATH = '/review?notif=daily_reminder';

/** Collapse key, so an undelivered reminder is replaced rather than stacked. */
export const REMINDER_TAG = 'vocabahn-daily-reminder';
