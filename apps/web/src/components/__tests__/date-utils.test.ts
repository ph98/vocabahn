import { getDateKey, getLocalMidnightInUtc, nextDateKey, prevDateKey } from '@vocabahn/shared';
import { describe, expect, it } from 'vitest';

describe('date-utils', () => {
  describe('getDateKey', () => {
    it('returns ISO date string in UTC by default', () => {
      const d = new Date('2026-07-26T01:30:00Z');
      expect(getDateKey(d, 'UTC')).toBe('2026-07-26');
    });

    it('formats date key in America/New_York (EDT UTC-4)', () => {
      // 01:30 UTC July 26 is 21:30 July 25 in New York
      const d = new Date('2026-07-26T01:30:00Z');
      expect(getDateKey(d, 'America/New_York')).toBe('2026-07-25');
    });

    it('formats date key in Asia/Tokyo (JST UTC+9)', () => {
      // 21:30 UTC July 25 is 06:30 July 26 in Tokyo
      const d = new Date('2026-07-25T21:30:00Z');
      expect(getDateKey(d, 'Asia/Tokyo')).toBe('2026-07-26');
    });

    it('handles ISO offset format strings like +02:00', () => {
      const d = new Date('2026-07-26T01:30:00Z');
      expect(getDateKey(d, '+02:00')).toBe('2026-07-26');
    });
  });

  describe('getLocalMidnightInUtc', () => {
    it('returns UTC midnight for UTC timezone', () => {
      const date = getLocalMidnightInUtc('2026-07-25', 'UTC');
      expect(date.toISOString()).toBe('2026-07-25T00:00:00.000Z');
    });

    it('returns correct UTC time for America/New_York (UTC-4)', () => {
      const date = getLocalMidnightInUtc('2026-07-25', 'America/New_York');
      expect(date.toISOString()).toBe('2026-07-25T04:00:00.000Z');
    });

    it('returns correct UTC time for Asia/Tokyo (UTC+9)', () => {
      const date = getLocalMidnightInUtc('2026-07-25', 'Asia/Tokyo');
      expect(date.toISOString()).toBe('2026-07-24T15:00:00.000Z');
    });
  });

  describe('prevDateKey and nextDateKey', () => {
    it('steps back one calendar day correctly', () => {
      expect(prevDateKey('2026-07-25')).toBe('2026-07-24');
      expect(prevDateKey('2026-03-01')).toBe('2026-02-28');
      expect(prevDateKey('2026-01-01')).toBe('2025-12-31');
    });

    it('steps forward one calendar day correctly', () => {
      expect(nextDateKey('2026-07-25')).toBe('2026-07-26');
      expect(nextDateKey('2026-02-28')).toBe('2026-03-01');
      expect(nextDateKey('2025-12-31')).toBe('2026-01-01');
    });
  });
});
