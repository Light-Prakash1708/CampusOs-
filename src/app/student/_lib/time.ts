/**
 * Timezone-correct date helpers for the student portal.
 *
 * Everything a student sees ("today", "this week", "next class") must be
 * computed in the *institution's* timezone, not the server's. The server here
 * runs in UTC while the demo institution is Asia/Kolkata, so naive
 * `new Date().getDay()` would show the wrong day for several hours a night.
 */

export const DAY_ORDER = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type DayName = (typeof DAY_ORDER)[number];

export const DAY_SHORT: Record<DayName, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

export const DAY_LABEL: Record<DayName, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

export interface ZonedNow {
  /** Calendar date in the institution's timezone, as `YYYY-MM-DD`. */
  today: string;
  day: DayName;
  /** Minutes since midnight, institution-local. */
  minutes: number;
  timeZone: string;
}

/** Current wall-clock date/time inside a given IANA timezone. */
export function zonedNow(timeZone: string, at: Date = new Date()): ZonedNow {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const today = `${get('year')}-${get('month')}-${get('day')}`;

  return {
    today,
    day: dayOfIso(today),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    timeZone,
  };
}

/** `YYYY-MM-DD` → a Date at UTC midday, safe to format in any server timezone. */
export function isoToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

export function dayOfIso(iso: string): DayName {
  // getUTCDay: 0 = Sunday. DAY_ORDER starts at Monday.
  const index = (new Date(`${iso}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  return DAY_ORDER[index] as DayName;
}

export function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekStartIso(iso: string): string {
  const offset = (new Date(`${iso}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  return addIsoDays(iso, -offset);
}

/** `"09:00:00"` → minutes since midnight. Returns null for unparseable input. */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(':');
  const hours = Number(h);
  const minutes = Number(m ?? 0);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

/** Rounded, human phrasing for a positive minute delta: "in 25 min", "in 2 hr". */
export function minutesUntilLabel(delta: number): string {
  if (delta <= 0) return 'now';
  if (delta < 60) return `in ${delta} min`;
  const hours = Math.floor(delta / 60);
  const rest = delta % 60;
  if (rest === 0) return `in ${hours} hr${hours === 1 ? '' : 's'}`;
  return `in ${hours} hr ${rest} min`;
}

/** First day of the month containing `iso`. */
export function monthStartIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addIsoMonths(iso: string, months: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = (y as number) * 12 + ((m as number) - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

export function daysInMonth(iso: string): number {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y as number, m as number, 0)).getUTCDate();
}

export function formatMonthLabel(iso: string): string {
  return isoToDate(iso).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Thu 20 Aug" — compact, unambiguous, timezone-safe. */
export function formatIsoDayLabel(iso: string): string {
  return isoToDate(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
