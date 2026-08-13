import { describe, expect, it } from 'vitest';
import { buildReminderMessage, formatReminderLine } from './reminder-copy';

describe('buildReminderMessage', () => {
  it('leads with the learner’s own number, not a generic nudge', () => {
    expect(formatReminderLine({ dueToday: 12, streak: 9 })).toBe(
      '12 cards due today — 5 minutes keeps your 9-day streak.',
    );
  });

  it('says “1 card”, not “1 cards”', () => {
    expect(buildReminderMessage({ dueToday: 1, streak: 4 }).title).toBe('1 card due today');
  });

  it('drops the streak when there isn’t one worth protecting', () => {
    // "keeps your 1-day streak" is a weaker reason to open the app than none.
    expect(buildReminderMessage({ dueToday: 6, streak: 0 }).body).toBe(
      "5 minutes and you're back on track.",
    );
    expect(buildReminderMessage({ dueToday: 6, streak: 1 }).body).toBe(
      "5 minutes and you're back on track.",
    );
    expect(buildReminderMessage({ dueToday: 6, streak: 2 }).body).toBe(
      '5 minutes keeps your 2-day streak.',
    );
  });
});
