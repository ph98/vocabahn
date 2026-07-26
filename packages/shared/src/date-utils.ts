/**
 * Utility functions for timezone-aware date calculations.
 */

/**
 * Returns YYYY-MM-DD for a given Date in the specified timezone (or UTC).
 */
export function getDateKey(date: Date, timeZone: string = 'UTC'): string {
  if (!timeZone || timeZone === 'UTC') {
    return date.toISOString().slice(0, 10);
  }

  // Handle offset in minutes or numeric string
  if (typeof timeZone === 'number' || /^[+-]?\d+$/.test(String(timeZone))) {
    const offsetMinutes = Number(timeZone);
    const shiftedDate = new Date(date.getTime() - offsetMinutes * 60 * 1000);
    return shiftedDate.toISOString().slice(0, 10);
  }

  // Handle ISO offset string (+02:00 or -05:00)
  if (/^[+-]\d{2}:?\d{2}$/.test(timeZone)) {
    const sign = timeZone[0] === '+' ? 1 : -1;
    const clean = timeZone.replace(/^[+-]/, '').replace(':', '');
    const hours = parseInt(clean.slice(0, 2), 10);
    const mins = parseInt(clean.slice(2, 4), 10);
    const totalMinutes = sign * (hours * 60 + mins);
    const shiftedDate = new Date(date.getTime() + totalMinutes * 60 * 1000);
    return shiftedDate.toISOString().slice(0, 10);
  }

  try {
    // 'sv-SE' outputs ISO format YYYY-MM-DD
    return new Intl.DateTimeFormat('sv-SE', { timeZone }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Returns the UTC Date object representing 00:00:00 on dateStr (YYYY-MM-DD) in timeZone.
 */
export function getLocalMidnightInUtc(dateStr: string, timeZone: string = 'UTC'): Date {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;

  if (!timeZone || timeZone === 'UTC') {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }

  if (/^[+-]\d{2}:?\d{2}$/.test(timeZone)) {
    const sign = timeZone[0] === '+' ? 1 : -1;
    const clean = timeZone.replace(/^[+-]/, '').replace(':', '');
    const hours = parseInt(clean.slice(0, 2), 10);
    const mins = parseInt(clean.slice(2, 4), 10);
    const totalMinutes = sign * (hours * 60 + mins);
    const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - totalMinutes * 60 * 1000;
    return new Date(utcMs);
  }

  try {
    let guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    for (let i = 0; i < 3; i++) {
      const formatted = new Intl.DateTimeFormat('sv-SE', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(guess);

      const [gDate = '', gTime = ''] = formatted.split(' ');
      const [gY = year, gM = month, gD = day] = gDate.split('-').map(Number);
      const [gH = 0, gMin = 0, gS = 0] = gTime.split(':').map(Number);

      const targetMs = Date.UTC(year, month - 1, day, 0, 0, 0);
      const currentMs = Date.UTC(gY, gM - 1, gD, gH, gMin, gS);
      const diffMs = targetMs - currentMs;

      if (diffMs === 0) break;
      guess = new Date(guess.getTime() + diffMs);
    }
    return guess;
  } catch {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }
}

/**
 * Returns YYYY-MM-DD for the previous calendar day.
 */
export function prevDateKey(key: string): string {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  return prev.toISOString().slice(0, 10);
}

/**
 * Returns YYYY-MM-DD for the next calendar day.
 */
export function nextDateKey(key: string): string {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}
