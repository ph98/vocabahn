import { describe, expect, it } from 'vitest';
import { isDigestHour, localHour } from './digest-schedule';

// 2026-08-12T05:00:00Z. In August: Berlin is UTC+2 (07:00), Tehran UTC+3:30
// (08:30), New York UTC-4 (01:00), Tokyo UTC+9 (14:00).
const NOON_UTC_05 = new Date('2026-08-12T05:00:00Z');

describe('localHour', () => {
  it('converts to the learner’s own clock', () => {
    expect(localHour(NOON_UTC_05, 'Europe/Berlin')).toBe(7);
    expect(localHour(NOON_UTC_05, 'America/New_York')).toBe(1);
    expect(localHour(NOON_UTC_05, 'Asia/Tokyo')).toBe(14);
    expect(localHour(NOON_UTC_05, 'UTC')).toBe(5);
  });

  it('floors a half-hour offset to the hour that contains it', () => {
    // Tehran is UTC+3:30, so 05:00Z is 08:30 local — the 08 hour.
    expect(localHour(NOON_UTC_05, 'Asia/Tehran')).toBe(8);
  });

  it('returns midnight as 0, not 24', () => {
    expect(localHour(new Date('2026-08-12T22:30:00Z'), 'Europe/Berlin')).toBe(0);
  });

  it('returns null for a timezone Intl does not know', () => {
    expect(localHour(NOON_UTC_05, 'Mars/Olympus_Mons')).toBeNull();
    expect(localHour(NOON_UTC_05, 'not a timezone')).toBeNull();
  });

  it('follows daylight saving rather than a fixed offset', () => {
    // Berlin is UTC+2 in August and UTC+1 in January.
    expect(localHour(new Date('2026-08-12T05:00:00Z'), 'Europe/Berlin')).toBe(7);
    expect(localHour(new Date('2026-01-12T05:00:00Z'), 'Europe/Berlin')).toBe(6);
  });
});

describe('isDigestHour', () => {
  it('is true only during the learner’s own digest hour', () => {
    expect(isDigestHour(NOON_UTC_05, 'Europe/Berlin', 7)).toBe(true);
    expect(isDigestHour(NOON_UTC_05, 'Asia/Tokyo', 7)).toBe(false);
  });

  it('fires for each timezone as that hour reaches it', () => {
    // 07:00 local sweeps westward across the day, one timezone at a time.
    expect(isDigestHour(new Date('2026-08-12T05:00:00Z'), 'Europe/Berlin', 7)).toBe(true);
    expect(isDigestHour(new Date('2026-08-12T11:00:00Z'), 'America/New_York', 7)).toBe(true);
    expect(isDigestHour(new Date('2026-08-11T22:00:00Z'), 'Asia/Tokyo', 7)).toBe(true);
  });

  it('treats a missing timezone as UTC rather than skipping the learner', () => {
    expect(isDigestHour(new Date('2026-08-12T07:30:00Z'), null, 7)).toBe(true);
    expect(isDigestHour(new Date('2026-08-12T07:30:00Z'), '', 7)).toBe(true);
  });

  it('skips a learner whose stored timezone is unparseable', () => {
    expect(isDigestHour(NOON_UTC_05, 'Europe/Atlantis', 7)).toBe(false);
  });

  it('is true for the whole hour, not just the top of it', () => {
    expect(isDigestHour(new Date('2026-08-12T05:00:00Z'), 'Europe/Berlin', 7)).toBe(true);
    expect(isDigestHour(new Date('2026-08-12T05:59:59Z'), 'Europe/Berlin', 7)).toBe(true);
    expect(isDigestHour(new Date('2026-08-12T06:00:00Z'), 'Europe/Berlin', 7)).toBe(false);
  });
});
