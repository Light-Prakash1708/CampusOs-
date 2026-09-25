/**
 * Minimal RFC 5545 calendar file for one event — no dependency needed.
 * Times are written in UTC (…Z) so every calendar app places them correctly;
 * text is escaped and lines are folded at 75 octets as the spec requires.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  cancelled?: boolean;
  /** Bumped when the event changes so calendars replace the old copy. */
  sequence?: number;
  updatedAt?: Date;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line at 75 octets (UTF-8 safe: never splits a character). */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(e: IcsEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CampusOS//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(e.endsAt)}`,
    `SEQUENCE:${e.sequence ?? 0}`,
    `SUMMARY:${escapeIcsText(e.title)}`,
    e.location ? `LOCATION:${escapeIcsText(e.location)}` : null,
    e.description ? `DESCRIPTION:${escapeIcsText(e.description.slice(0, 2000))}` : null,
    e.url ? `URL:${e.url}` : null,
    e.updatedAt ? `LAST-MODIFIED:${stamp(e.updatedAt)}` : null,
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null);
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
