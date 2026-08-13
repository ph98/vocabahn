import { describe, expect, it } from 'vitest';
import { localHourMinute, reminderSlot } from './reminder-schedule';

// 2026-08-12T17:00:00Z. In August: Berlin is UTC+2 (19:00), New York UTC-4
// (13:00), Kolkata UTC+5:30 (22:30), Tokyo UTC+9 (02:00 the next day).
const AT_17Z = new Date('2026-08-12T17:00:00Z');

const CATCH_UP = 90;

describe('localHourMinute', () => {
  it('converts to the learner’s own clock', () => {
    expect(localHourMinute(AT_17Z, 'Europe/Berlin')).toEqual({ hour: 19, minute: 0 });
    expect(localHourMinute(AT_17Z, 'America/New_York')).toEqual({ hour: 13, minute: 0 });
    expect(localHourMinute(AT_17Z, 'UTC')).toEqual({ hour: 17, minute: 0 });
  });

  it('keeps the minutes of a half-hour offset', () => {
    // The whole reason this exists rather than reusing `localHour`: a reminder
    // at a chosen minute cannot round the learner's clock to the hour.
    expect(localHourMinute(AT_17Z, 'Asia/Kolkata')).toEqual({ hour: 22, minute: 30 });
    expect(localHourMinute(AT_17Z, 'Asia/Kathmandu')).toEqual({ hour: 22, minute: 45 });
  });

  it('returns midnight as 0, not 24', () => {
    expect(localHourMinute(new Date('2026-08-12T22:05:00Z'), 'Europe/Berlin')).toEqual({
      hour: 0,
      minute: 5,
    });
  });

  it('returns null for a timezone Intl does not know', () => {
    expect(localHourMinute(AT_17Z, 'Mars/Olympus_Mons')).toBeNull();
    expect(localHourMinute(AT_17Z, 'not a timezone')).toBeNull();
  });

  it('follows daylight saving rather than a fixed offset', () => {
    expect(localHourMinute(new Date('2026-08-12T17:00:00Z'), 'Europe/Berlin')?.hour).toBe(19);
    expect(localHourMinute(new Date('2026-01-12T17:00:00Z'), 'Europe/Berlin')?.hour).toBe(18);
  });
});

describe('reminderSlot', () => {
  it('is due at the learner’s chosen local time, in their own zone', () => {
    expect(reminderSlot(AT_17Z, 'Europe/Berlin', 19, 0, CATCH_UP)).toBe('2026-08-12');
    // Same instant, a different learner: 13:00 in New York is not their 19:00.
    expect(reminderSlot(AT_17Z, 'America/New_York', 19, 0, CATCH_UP)).toBeNull();
  });

  it('fires for each timezone as that time reaches it', () => {
    expect(reminderSlot(new Date('2026-08-12T17:00:00Z'), 'Europe/Berlin', 19, 0, CATCH_UP)).toBe(
      '2026-08-12',
    );
    expect(
      reminderSlot(new Date('2026-08-12T23:00:00Z'), 'America/New_York', 19, 0, CATCH_UP),
    ).toBe('2026-08-12');
    expect(reminderSlot(new Date('2026-08-12T10:00:00Z'), 'Asia/Tokyo', 19, 0, CATCH_UP)).toBe(
      '2026-08-12',
    );
  });

  it('is not due before the chosen time', () => {
    expect(
      reminderSlot(new Date('2026-08-12T16:45:00Z'), 'Europe/Berlin', 19, 0, CATCH_UP),
    ).toBeNull();
  });

  it('stays due through the catch-up window, so a missed sweep is late not lost', () => {
    // A deploy that swallows several ticks should still deliver.
    expect(reminderSlot(new Date('2026-08-12T18:29:00Z'), 'Europe/Berlin', 19, 0, CATCH_UP)).toBe(
      '2026-08-12',
    );
    // …but not hours later. Opting in at 22:00 with a 19:00 time must not push.
    expect(
      reminderSlot(new Date('2026-08-12T18:30:00Z'), 'Europe/Berlin', 19, 0, CATCH_UP),
    ).toBeNull();
    expect(
      reminderSlot(new Date('2026-08-12T20:00:00Z'), 'Europe/Berlin', 19, 0, CATCH_UP),
    ).toBeNull();
  });

  it('honours a minute that no UTC-aligned sweep ever lands on', () => {
    // Kolkata is UTC+5:30, so a */15 sweep sees local :00, :15, :30, :45 too —
    // but a learner who picked 22:37 is served by the window, not by equality.
    expect(reminderSlot(AT_17Z, 'Asia/Kolkata', 22, 30, CATCH_UP)).toBe('2026-08-12');
    expect(reminderSlot(AT_17Z, 'Asia/Kolkata', 22, 15, CATCH_UP)).toBe('2026-08-12');
    expect(reminderSlot(AT_17Z, 'Asia/Kolkata', 22, 31, CATCH_UP)).toBeNull();
  });

  it('attributes a reminder picked up after midnight to the day it was for', () => {
    // 23:50 Berlin on the 12th, swept at 00:05 local on the 13th. Claiming the
    // 13th here would let the same learner be pushed again twenty minutes later.
    const justAfterMidnight = new Date('2026-08-12T22:05:00Z'); // 00:05 Berlin, 13 Aug
    expect(reminderSlot(justAfterMidnight, 'Europe/Berlin', 23, 50, CATCH_UP)).toBe('2026-08-12');
  });

  it('treats a missing timezone as UTC rather than skipping the learner', () => {
    expect(reminderSlot(AT_17Z, null, 17, 0, CATCH_UP)).toBe('2026-08-12');
    expect(reminderSlot(AT_17Z, '', 17, 0, CATCH_UP)).toBe('2026-08-12');
  });

  it('skips a learner whose stored timezone is unparseable', () => {
    expect(reminderSlot(AT_17Z, 'Europe/Atlantis', 17, 0, CATCH_UP)).toBeNull();
  });
});
