import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formats a 24h "HH:MM:SS" or "HH:MM" string as "9:00 AM". */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h)) return value;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Timezone used to DISPLAY instants. Explicit so a server running in UTC
 * (Render, most hosts) and the browser render the same wall-clock time —
 * otherwise every server-rendered time is off by 5:30 for Indian colleges and
 * hydration can disagree. Pages that know the college's own timezone pass it.
 */
export const DISPLAY_TIME_ZONE = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || 'Asia/Kolkata';

export function formatDate(value: Date | string | null | undefined, withYear = true): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: DISPLAY_TIME_ZONE,
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(date)}, ${date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  })}`;
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const abs = Math.abs(diffMs);
  const future = diffMs < 0;

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const phrase = (n: number, unit: string) =>
    future ? `in ${n} ${unit}${n === 1 ? '' : 's'}` : `${n} ${unit}${n === 1 ? '' : 's'} ago`;

  if (abs < minute) return future ? 'in a moment' : 'just now';
  if (abs < hour) return phrase(Math.floor(abs / minute), 'minute');
  if (abs < day) return phrase(Math.floor(abs / hour), 'hour');
  if (abs < 7 * day) return phrase(Math.floor(abs / day), 'day');
  return formatDate(date);
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Pretty-prints a decimal string from Postgres numeric columns. */
export function num(value: string | number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return n.toFixed(decimals).replace(/\.0+$/, '');
}

export function percent(bp: number): string {
  return `${(bp / 100).toFixed(1).replace(/\.0$/, '')}%`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Human label from an ENUM_LIKE_VALUE. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function minutesToHuman(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} hr${h === 1 ? '' : 's'}` : `${h} hr ${m} min`;
}

export function truncate(text: string, max = 120): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * A same-origin path to return to after sign-in, or null. Rejects anything a
 * browser could resolve off-site: "//host", "/\host", control characters,
 * or a different origin after URL parsing.
 */
export function safeReturnPath(next: string | null | undefined, origin = 'http://campusos.local'): string | null {
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (!next || !next.startsWith('/') || /^\/[\\/]/.test(next) || /[\u0000-\u001f\\]/.test(next)) return null;
  try {
    const u = new URL(next, origin);
    return u.origin === new URL(origin).origin ? `${u.pathname}${u.search}${u.hash}` : null;
  } catch {
    return null;
  }
}
