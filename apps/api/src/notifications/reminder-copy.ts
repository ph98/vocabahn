/**
 * What the reminder actually says.
 *
 * Pure, so the wording is unit-testable without a push service. The rule the
 * copy follows is that it carries the learner's own numbers: a generic "time to
 * study!" is the notification everyone turns off, whereas "12 cards due today"
 * is a fact they can act on or dismiss on its merits.
 */

export interface ReminderStats {
  /** Cards due by the end of the learner's local day. */
  dueToday: number;
  /** Consecutive local days reviewed, up to and including yesterday. */
  streak: number;
}

export interface ReminderMessage {
  title: string;
  body: string;
}

/** How long the copy claims a session takes. Honest for a dozen cards. */
const MINUTES_CLAIM = 5;

export function buildReminderMessage({ dueToday, streak }: ReminderStats): ReminderMessage {
  const cards = dueToday === 1 ? '1 card' : `${dueToday} cards`;
  const title = `${cards} due today`;

  // A streak is only worth naming once it is worth protecting; "keeps your
  // 1-day streak" is a weaker reason to open the app than no reason at all.
  const body =
    streak >= 2
      ? `${MINUTES_CLAIM} minutes keeps your ${streak}-day streak.`
      : `${MINUTES_CLAIM} minutes and you're back on track.`;

  return { title, body };
}

/** The one-line form, for logs and tests: "12 cards due today — 5 minutes …". */
export function formatReminderLine(stats: ReminderStats): string {
  const { title, body } = buildReminderMessage(stats);
  return `${title} — ${body}`;
}
