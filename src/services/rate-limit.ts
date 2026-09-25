import 'server-only';
import { createHash } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rateLimitBuckets } from '@/lib/db/schema';
import { AppError } from '@/lib/api';

/**
 * RATE LIMITING
 * ---------------------------------------------------------------------------
 * Fixed-window counters stored in PostgreSQL. One atomic upsert per check:
 * correct across any number of app instances, no Redis to operate. At CampusOS
 * scale (a college's traffic) this is comfortably cheap; the `RateLimitStore`
 * seam lets a Redis store replace it later without touching call sites.
 *
 * Keys are namespaced, hashed strings built by `keyFor('login:ip', ip)`.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export interface RateLimitRule {
  /** Maximum hits per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

/** Central catalogue so limits are reviewable in one place. */
export const RATE_LIMITS = {
  loginPerIp: { limit: 30, windowSec: 15 * 60 },
  loginPerAccount: { limit: 10, windowSec: 15 * 60 },
  passwordResetPerIp: { limit: 10, windowSec: 60 * 60 },
  passwordResetPerAccount: { limit: 3, windowSec: 60 * 60 },
  registerPerIp: { limit: 10, windowSec: 60 * 60 },
  verifyResendPerUser: { limit: 5, windowSec: 60 * 60 },
  invitePerAdmin: { limit: 200, windowSec: 60 * 60 },
  uploadPerUser: { limit: 60, windowSec: 60 * 60 },
  aiPerUserHour: { limit: 30, windowSec: 60 * 60 },
  dataExportPerUser: { limit: 3, windowSec: 24 * 60 * 60 },
  mutationPerUser: { limit: 300, windowSec: 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitStore {
  hit(key: string, rule: RateLimitRule, now: Date): Promise<{ count: number; windowStart: Date }>;
}

export const postgresStore: RateLimitStore = {
  async hit(key, rule, now) {
    const windowMs = rule.windowSec * 1000;
    const expiresAt = new Date(now.getTime() + windowMs);
    // Atomic: either start a fresh window or increment the current one.
    const result = await db.execute<{ count: number; window_start: string }>(sql`
      INSERT INTO rate_limit_buckets (key, window_start, count, expires_at)
      VALUES (${key}, ${now}, 1, ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit_buckets.expires_at <= ${now} THEN 1
                     ELSE rate_limit_buckets.count + 1 END,
        window_start = CASE WHEN rate_limit_buckets.expires_at <= ${now} THEN ${now}
                            ELSE rate_limit_buckets.window_start END,
        expires_at = CASE WHEN rate_limit_buckets.expires_at <= ${now} THEN ${expiresAt}
                          ELSE rate_limit_buckets.expires_at END
      RETURNING count, window_start
    `);
    const row = result.rows[0]!;
    return { count: Number(row.count), windowStart: new Date(row.window_start) };
  },
};

let store: RateLimitStore = postgresStore;

/** Test seam. */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

export async function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_DISABLED === 'true' && process.env.NODE_ENV !== 'production') {
    return { allowed: true, limit: rule.limit, remaining: rule.limit, retryAfter: 0 };
  }
  const { count, windowStart } = await store.hit(key, rule, now);
  const resetAt = windowStart.getTime() + rule.windowSec * 1000;
  return {
    allowed: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfter: Math.max(0, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

/** Throws a 429 AppError with an actionable message when over the limit. */
export async function enforceRateLimit(
  key: string,
  rule: RateLimitRule,
  message = 'Too many requests.',
): Promise<RateLimitResult> {
  const result = await checkRateLimit(key, rule);
  if (!result.allowed) {
    const minutes = Math.max(1, Math.ceil(result.retryAfter / 60));
    throw new AppError(
      message,
      429,
      'RATE_LIMITED',
      { retryAfter: result.retryAfter },
      `Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
    );
  }
  return result;
}

/** Deletes expired buckets. Called by the job runner. */
export async function sweepRateLimits(now = new Date()): Promise<number> {
  const deleted = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.expiresAt, now))
    .returning({ key: rateLimitBuckets.key });
  return deleted.length;
}

/**
 * Builds a namespaced key. Identifiers are normalised (so casing can't bypass a
 * limit) and hashed (so the table never holds emails or IPs in clear).
 */
export function keyFor(scope: string, ...parts: (string | null | undefined)[]): string {
  const id = parts.map((p) => (p ?? 'unknown').toString().trim().toLowerCase()).join('|');
  return `${scope}:${createHash('sha256').update(id).digest('hex').slice(0, 32)}`;
}
