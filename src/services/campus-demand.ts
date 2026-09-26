import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ForbiddenError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { isPlatformOperator } from '@/services/institutions';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { actorHash } from '@/services/product-events';

/**
 * CAMPUS DEMAND — the bottom-up referral loop (CAMPUSOS-012).
 *
 * A student in a personal workspace names their college when it isn't on
 * CampusOS. Operators see a "warm campus" once enough different students
 * name the same college. Nobody is contacted automatically, no contacts are
 * read, and individual students are never shown — only counts.
 */

/** Below this, a college is never listed (k-anonymity floor). */
export const MIN_VISIBLE = 5;

export function warmThreshold(): number {
  const n = Number(process.env.CAMPUS_DEMAND_THRESHOLD);
  return Number.isFinite(n) && n >= MIN_VISIBLE ? Math.round(n) : 25;
}

/** Plain-text, single line, no control/bidi characters, bounded. */
function clean(value: string, max: number): string {
  return value
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const STOP = /\b(the|of|college|institute|institution|university|school|and)\b/g;

/** "St. Xavier's College, Kolkata" and "st xaviers college" → same key. */
export function collegeKey(name: string, city?: string | null): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/['’`.]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(STOP, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const n = norm(name);
  const c = city ? norm(city) : '';
  return c ? `${n}|${c}` : n;
}

export async function recordCampusInterest(ctx: AuthContext, input: { name: string; city?: string | null }) {
  if (ctx.role !== 'STUDENT') throw new ForbiddenError('Only students can tell us about their college.');
  const [home] = await db.select({ kind: t.institutions.kind }).from(t.institutions).where(eq(t.institutions.id, ctx.institutionId)).limit(1);
  if (home?.kind !== 'PERSONAL') throw new AppError('Your account already belongs to a college.', 409, 'ALREADY_MEMBER');
  await enforceRateLimit(keyFor('campus-interest', ctx.userId), { limit: 10, windowSec: 86_400 }, 'Try again tomorrow.');

  const displayName = clean(input.name, 120);
  const city = input.city ? clean(input.city, 60) || null : null;
  const key = collegeKey(displayName, city);
  if (displayName.length < 3 || key.replace(/\|.*/, '').length < 2) {
    throw new AppError('Please enter your college’s name.', 422, 'BAD_NAME');
  }
  const now = new Date();
  await db
    .insert(t.campusInterest)
    .values({ institutionId: ctx.institutionId, actorHash: actorHash(ctx.userId), collegeKey: key, displayName, city })
    .onConflictDoUpdate({ target: t.campusInterest.actorHash, set: { collegeKey: key, displayName, city, institutionId: ctx.institutionId, updatedAt: now } });
  return { recorded: true };
}

export async function getMyCampusInterest(ctx: AuthContext) {
  const [row] = await db
    .select({ displayName: t.campusInterest.displayName, city: t.campusInterest.city })
    .from(t.campusInterest)
    .where(eq(t.campusInterest.actorHash, actorHash(ctx.userId)))
    .limit(1);
  return row ?? null;
}

/** Called when a student is verified at a college: their interest is fulfilled. */
export async function clearCampusInterest(userId: string) {
  await db.delete(t.campusInterest).where(eq(t.campusInterest.actorHash, actorHash(userId)));
}

export interface CampusDemand {
  threshold: number;
  tracked: number;
  warm: { key: string; displayName: string; city: string | null; students: number; lastSeen: string }[];
}

/** Operators only. Aggregates, never people. */
export async function getCampusDemand(ctx: AuthContext): Promise<CampusDemand> {
  if (!isPlatformOperator(ctx)) throw new ForbiddenError();
  const threshold = warmThreshold();
  const result = await db.execute(sql`
    SELECT college_key AS key,
           mode() WITHIN GROUP (ORDER BY display_name) AS display_name,
           mode() WITHIN GROUP (ORDER BY city) AS city,
           count(DISTINCT actor_hash) AS students,
           max(updated_at) AS last_seen
    FROM campus_interest
    GROUP BY college_key
    HAVING count(DISTINCT actor_hash) >= ${MIN_VISIBLE}
    ORDER BY students DESC
    LIMIT 100`);
  const rows = result.rows as { key: string; display_name: string; city: string | null; students: string; last_seen: Date | string }[];
  return {
    threshold,
    tracked: rows.length,
    warm: rows
      .filter((r) => Number(r.students) >= threshold)
      .map((r) => ({
        key: r.key,
        displayName: r.display_name,
        city: r.city,
        students: Number(r.students),
        lastSeen: new Date(r.last_seen).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }),
      })),
  };
}
