import type { OvernightWindow, TripDate } from '../types';

export const JAPAN_TIMEZONE = 'Asia/Tokyo';
const HOUR_MS = 3_600_000;

/** Date-only arithmetic avoids the execution host's timezone and DST. */
export function addDays(date: string, count: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export function japanDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JAPAN_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Two upcoming ski mornings fit a bounded 3-day API response (including today). */
export function getTripDates(now = new Date()): TripDate[] {
  return [1, 2].map((offset) => {
    const date = addDays(japanDate(now), offset);
    const value = new Date(`${date}T12:00:00+09:00`);
    return {
      id: date,
      date,
      label: offset === 1 ? 'Tomorrow' : new Intl.DateTimeFormat('en', {
        timeZone: JAPAN_TIMEZONE, weekday: 'long',
      }).format(value),
      shortLabel: new Intl.DateTimeFormat('en', {
        timeZone: JAPAN_TIMEZONE, month: 'short', day: 'numeric',
      }).format(value),
      weekday: new Intl.DateTimeFormat('en', {
        timeZone: JAPAN_TIMEZONE, weekday: 'short',
      }).format(value),
    };
  });
}

export function overnightWindow(date: string): OvernightWindow {
  return {
    start: `${addDays(date, -1)}T18:00:00+09:00`,
    end: `${date}T08:00:00+09:00`,
    label: '18:00–08:00 JST',
  };
}

/** Snowfall at 19:00 represents 18:00–19:00: include (start, end]. */
export function overnightHourEnds(date: string): string[] {
  const window = overnightWindow(date);
  const start = new Date(window.start).getTime();
  return Array.from({ length: 14 }, (_, index) => {
    // Provider ISO timestamps omit an offset when timezone=Asia/Tokyo.
    return new Date(start + (index + 1) * HOUR_MS + 9 * HOUR_MS)
      .toISOString().slice(0, 16);
  });
}

export function formatJapanTime(iso: string | null): string {
  if (!iso) return 'Not available';
  return `${new Intl.DateTimeFormat('en', {
    timeZone: JAPAN_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))} JST`;
}
