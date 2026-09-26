import 'server-only';
import { createHmac } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { logger } from '@/lib/logger';

/**
 * PRIVACY-SAFE PRODUCT ANALYTICS (CAMPUSOS-003)
 * ---------------------------------------------------------------------------
 * `track()` records that something meaningful happened: never who did it
 * (only a keyed hash), never what they wrote. Every event name and property
 * is allowlisted below; anything else is dropped. Tracking can never fail
 * the request that triggered it.
 *
 * Adding an event: add it to EVENTS with its allowed properties, call
 * track() at the point the action succeeds, and document it in
 * docs/ANALYTICS.md.
 */

type PropSpec = 'number' | 'boolean' | readonly string[];

export const EVENTS = {
  // Acquisition
  student_signup: {},
  college_join_requested: { with_id: 'boolean' },
  college_verified: {},
  invite_link_copied: {},
  invite_accepted: { role: ['STUDENT', 'FACULTY', 'ADMIN', 'OTHER'] },
  // Activation / engagement
  career_goal_set: {},
  notice_viewed: {},
  notice_acknowledged: { on_time: 'boolean' },
  attendance_viewed: {},
  attendance_planner_used: { surface: ['public', 'student'] },
  attention_signal_viewed: { kind: ['ATTENDANCE', 'SUBMISSIONS', 'DEADLINE', 'NOTICE', 'GRIEVANCE'] },
  grievance_created: { anonymous: 'boolean' },
  opportunity_opened: {},
  opportunity_saved: {},
  tracker_goal_created: {},
  ai_query: { provider: ['anthropic', 'openai', 'local'] },
  // Institutional
  notice_created: { requires_ack: 'boolean', emergency: 'boolean' },
  grievance_resolved: { within_sla: 'boolean' },
  grievance_escalated: { level: 'number' },
  evidence_pack_generated: { individual: 'boolean' },
  attendance_marked: {},
} as const satisfies Record<string, Record<string, PropSpec>>;

export type ProductEvent = keyof typeof EVENTS;

/** Events that count as "meaningful" for activation. */
export const ACTIVATION_EVENTS: ProductEvent[] = [
  'notice_acknowledged',
  'attendance_viewed',
  'attendance_planner_used',
  'opportunity_saved',
  'tracker_goal_created',
  'grievance_created',
  'career_goal_set',
];

/** Feature → events that show the feature was used (for adoption). */
export const FEATURE_EVENTS: Record<string, ProductEvent[]> = {
  Attendance: ['attendance_viewed', 'attendance_planner_used'],
  Notices: ['notice_viewed', 'notice_acknowledged'],
  Opportunities: ['opportunity_opened', 'opportunity_saved'],
  'AI assistant': ['ai_query'],
  Tracker: ['tracker_goal_created'],
  Grievances: ['grievance_created'],
};

export const ANALYTICS_RETENTION_DAYS = 400;

export interface Actor {
  userId: string;
  institutionId: string;
  role: string;
  /** Demo activity is never counted as product usage. */
  isDemo?: boolean;
}

let cachedKey: string | null = null;
function hashKey(): string {
  if (cachedKey) return cachedKey;
  const explicit = process.env.ANALYTICS_HASH_KEY;
  const base = explicit && explicit.length >= 32 ? explicit : process.env.AUTH_SECRET ?? 'campusos-dev-analytics-key';
  // Derived, so the raw secret is never used directly as the analytics key.
  cachedKey = createHmac('sha256', base).update('campusos:product-analytics:v1').digest('hex');
  return cachedKey;
}

/** Stable, non-reversible actor id. Same user → same hash across tenants. */
export function actorHash(userId: string): string {
  return createHmac('sha256', hashKey()).update(userId).digest('base64url').slice(0, 32);
}

const COARSE_ROLES = new Set(['STUDENT', 'FACULTY', 'HOD', 'ADMIN', 'SUPER_ADMIN']);
export function coarseRole(role: string): string {
  return COARSE_ROLES.has(role) ? role : 'OTHER';
}

/** Keeps only allowlisted keys with values of the allowed shape. */
export function sanitizeProps(event: ProductEvent, props: Record<string, unknown> = {}): Record<string, string | number | boolean> {
  const spec = EVENTS[event] as Record<string, PropSpec>;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    const rule = spec[key];
    if (!rule) continue;
    if (rule === 'number' && typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value);
    else if (rule === 'boolean' && typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(rule) && typeof value === 'string' && rule.includes(value)) out[key] = value;
  }
  return out;
}

export function isProductEvent(name: string): name is ProductEvent {
  return Object.prototype.hasOwnProperty.call(EVENTS, name);
}

/** Record an event. Never throws. */
export async function track(actor: Actor, event: ProductEvent, props?: Record<string, unknown>): Promise<void> {
  try {
    if (!isProductEvent(event) || actor.isDemo) return;
    await db.insert(t.productEvents).values({
      institutionId: actor.institutionId,
      actorHash: actorHash(actor.userId),
      role: coarseRole(actor.role),
      event,
      props: sanitizeProps(event, props),
    });
  } catch (error) {
    logger.warn('product_event_failed', { event, error: error instanceof Error ? error.message : 'unknown' });
  }
}

/** Mark the actor active today (idempotent). Never throws. */
export async function markActive(actor: Actor): Promise<void> {
  if (actor.isDemo) return;
  try {
    await db
      .insert(t.productActiveDays)
      .values({
        actorHash: actorHash(actor.userId),
        day: sql`(now() AT TIME ZONE 'Asia/Kolkata')::date` as unknown as string,
        institutionId: actor.institutionId,
        role: coarseRole(actor.role),
      })
      .onConflictDoNothing();
  } catch (error) {
    logger.warn('product_active_failed', { error: error instanceof Error ? error.message : 'unknown' });
  }
}

/** Retention sweep, called from the jobs `sweep`. */
export async function purgeOldProductEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - ANALYTICS_RETENTION_DAYS * 86_400_000);
  const events = await db.delete(t.productEvents).where(lt(t.productEvents.createdAt, cutoff)).returning({ id: t.productEvents.id });
  await db.delete(t.productActiveDays).where(lt(t.productActiveDays.day, cutoff.toISOString().slice(0, 10)));
  return events.length;
}
