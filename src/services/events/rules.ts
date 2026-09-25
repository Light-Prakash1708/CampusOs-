import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * EVENTS — pure rules (unit-tested). No database access here.
 */

/** Seeded demo events carry this source name and are labelled "Demo" in the UI. */
export const DEMO_SOURCE = 'CampusOS demo seed';

export const EVENT_CATEGORIES = {
  HACKATHON: 'Hackathon',
  FEST: 'Fest',
  COMPETITION: 'Competition',
  CASE_COMPETITION: 'Case competition',
  DEBATE: 'Debate',
  MUN: 'MUN',
  WORKSHOP: 'Workshop',
  SEMINAR: 'Seminar',
  SPORTS: 'Sports',
  CULTURAL: 'Cultural',
  ENTREPRENEURSHIP: 'Entrepreneurship',
  CLUB: 'Club activity',
  CAREER: 'Career',
  NETWORKING: 'Networking',
  OPEN_MIC: 'Open mic',
  OTHER: 'Event',
} as const;
export type EventCategory = keyof typeof EVENT_CATEGORIES;

/** The tabs on the discovery page and which categories each covers. */
export const DISCOVERY_TABS: { key: string; label: string; categories: EventCategory[] | null }[] = [
  { key: 'all', label: 'All', categories: null },
  { key: 'fests', label: 'Fests', categories: ['FEST'] },
  { key: 'hackathons', label: 'Hackathons', categories: ['HACKATHON'] },
  { key: 'competitions', label: 'Competitions', categories: ['COMPETITION', 'CASE_COMPETITION', 'DEBATE', 'MUN'] },
  { key: 'workshops', label: 'Workshops', categories: ['WORKSHOP'] },
  { key: 'seminars', label: 'Seminars', categories: ['SEMINAR', 'NETWORKING'] },
  { key: 'cultural', label: 'Cultural', categories: ['CULTURAL', 'OPEN_MIC'] },
  { key: 'sports', label: 'Sports', categories: ['SPORTS'] },
  { key: 'career', label: 'Career', categories: ['CAREER', 'ENTREPRENEURSHIP'] },
];

export const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED_COLLEGE: 'Verified college',
  VERIFIED_CLUB: 'Verified club',
  VERIFIED_ORGANIZER: 'Verified organiser',
  COMMUNITY: 'Community submitted',
  PENDING: 'Pending verification',
};

export type RegistrationStatus = 'REGISTERED' | 'WAITLISTED' | 'PENDING_APPROVAL' | 'REJECTED' | 'CANCELLED';

export type RegistrationDecision =
  | { ok: true; status: 'REGISTERED' | 'WAITLISTED' | 'PENDING_APPROVAL' }
  | { ok: false; code: 'NOT_OPEN' | 'CLOSED' | 'ENDED' | 'FULL' | 'INVITE_ONLY' | 'NO_REGISTRATION'; message: string };

/**
 * What happens when someone asks to register. Capacity is re-checked by the
 * database trigger inside the transaction; this function decides intent.
 */
export function decideRegistration(input: {
  eventStatus: string;
  registrationRequired: boolean;
  mode: string;
  capacity: number | null;
  registeredCount: number;
  waitlistEnabled: boolean;
  deadline: Date | null;
  endsAt: Date;
  now: Date;
}): RegistrationDecision {
  if (input.eventStatus !== 'SCHEDULED') {
    return { ok: false, code: 'NOT_OPEN', message: 'This event is not open for registration.' };
  }
  if (input.endsAt <= input.now) return { ok: false, code: 'ENDED', message: 'This event has already ended.' };
  if (input.deadline && input.deadline < input.now) {
    return { ok: false, code: 'CLOSED', message: 'Registration for this event has closed.' };
  }
  if (input.mode === 'INVITE_ONLY') {
    return { ok: false, code: 'INVITE_ONLY', message: 'This event is by invitation only.' };
  }
  const full = input.capacity !== null && input.registeredCount >= input.capacity;
  if (full) {
    return input.waitlistEnabled
      ? { ok: true, status: 'WAITLISTED' }
      : { ok: false, code: 'FULL', message: 'Registration is full.' };
  }
  return { ok: true, status: input.mode === 'APPROVAL' ? 'PENDING_APPROVAL' : 'REGISTERED' };
}

/** Human code printed on passes: 6 unambiguous characters. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function registrationCode(bytes: Buffer = randomBytes(6)): string {
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Certificate verification code: 10 characters, grouped for reading aloud. */
export function certificateCode(bytes: Buffer = randomBytes(10)): string {
  const raw = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/* ------------------------------- QR pass --------------------------------- */

/**
 * The QR on a pass encodes a short-lived signed token, not the registration id,
 * so a screenshot shared in a group chat stops working within minutes and the
 * code reveals nothing about the student.
 *   token = base64url(regId.expSeconds).base64url(HMAC-SHA256)
 */
const PASS_TTL_SECONDS = 10 * 60;

function passKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  return createHmac('sha256', secret).update('campusos:event-pass:v1').digest();
}

export function signPassToken(registrationId: string, now = Date.now(), ttlSeconds = PASS_TTL_SECONDS): { token: string; expiresAt: Date } {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const body = Buffer.from(`${registrationId}.${exp}`).toString('base64url');
  const sig = createHmac('sha256', passKey()).update(body).digest('base64url');
  return { token: `${body}.${sig}`, expiresAt: new Date(exp * 1000) };
}

export function verifyPassToken(token: string, now = Date.now()): { registrationId: string } | { error: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' } {
  const [body, sig] = token.trim().split('.');
  if (!body || !sig) return { error: 'MALFORMED' };
  const expected = createHmac('sha256', passKey()).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return { error: 'MALFORMED' };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { error: 'BAD_SIGNATURE' };
  const [registrationId, expStr] = Buffer.from(body, 'base64url').toString().split('.');
  if (!registrationId || !expStr) return { error: 'MALFORMED' };
  if (Number(expStr) * 1000 < now) return { error: 'EXPIRED' };
  return { registrationId };
}

/* ------------------------------ discovery -------------------------------- */

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Date window for the "When" filter, in the institution's timezone offset. */
export function whenWindow(when: string, now: Date): { from: Date; to: Date | null } {
  const day = 86_400_000;
  const start = new Date(now);
  switch (when) {
    case 'today':
      return { from: now, to: new Date(now.getTime() + day) };
    case 'week':
      return { from: now, to: new Date(now.getTime() + 7 * day) };
    case 'weekend': {
      const dow = now.getUTCDay(); // 0 Sun … 6 Sat
      const toSat = (6 - dow + 7) % 7;
      const sat = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (dow === 0 ? -1 : toSat)));
      const from = dow === 0 || dow === 6 ? now : sat;
      return { from, to: new Date(sat.getTime() + 2 * day) };
    }
    case 'month':
      return { from: now, to: new Date(now.getTime() + 31 * day) };
    default:
      return { from: start, to: null };
  }
}

/**
 * Deterministic relevance — no LLM involved in basic filtering. Higher first:
 * own college, verified organiser, matches the student's interests, sooner.
 */
export function relevanceScore(e: {
  ownCollege: boolean;
  verification: string;
  category: string;
  startsAt: Date;
  interests?: string[];
  distanceKm?: number | null;
}, now: Date): number {
  let score = 0;
  if (e.ownCollege) score += 40;
  if (e.verification.startsWith('VERIFIED')) score += 15;
  if (e.interests?.some((i) => e.category.toLowerCase().includes(i.toLowerCase()))) score += 20;
  const days = Math.max(0, (e.startsAt.getTime() - now.getTime()) / 86_400_000);
  score += Math.max(0, 20 - days); // sooner is more relevant, fading over ~3 weeks
  if (e.distanceKm != null) score += Math.max(0, 10 - e.distanceKm / 3);
  return score;
}

/** Priority for an organiser update's notification. */
export function updatePriority(kind: string): 'CRITICAL' | 'IMPORTANT' | 'NORMAL' {
  if (kind === 'EMERGENCY') return 'CRITICAL';
  if (kind === 'VENUE_CHANGED' || kind === 'TIME_CHANGED' || kind === 'REMINDER') return 'IMPORTANT';
  return 'NORMAL';
}
