import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { AuthContext } from '@/lib/auth/context';
import { grievanceSummary, type Range } from '@/services/campus-evidence';
import { isPlatformOperator } from '@/services/institutions';
import { recordAudit } from '@/services/audit';
import * as t from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NotFoundError } from '@/lib/api';

/**
 * PILOT EVIDENCE (guardian mode)
 * ---------------------------------------------------------------------------
 * The weekly numbers the pilot is judged on (PILOT_GUIDE.md, readiness report
 * §6), for ONE college, computed read-only from records that already exist.
 * No new tracking is added, and nothing here is about an individual:
 * every figure is a count, a rate or a median.
 *
 * Descriptive only. These numbers say what happened. They do not say
 * CampusOS caused it.
 *
 * Definitions:
 *   enrolled         active STUDENT accounts in the college (now)
 *   activated        of those, distinct students with ≥ 1 active day ever
 *   weeklyActive     distinct students active in the week
 *   staffActive      distinct non-student users active in the week
 *   ackNotices       published notices requiring acknowledgement
 *   ackWithin48h     share of their recipients who acknowledged within 48 h of
 *                    publication. Only notices published ≥ 48 h before "now"
 *                    count, so recent notices don't drag the rate down.
 *   medianAckHours   median publication→acknowledgement time, acknowledged only
 *   pendingNow       recipients who still haven't acknowledged (as of now)
 *   remindersSent    notices whose automatic reminder went out in the week
 *   evidencePacks    evidence-pack exports (audit log)
 *   signalViews      attention-signal views (product events)
 */

export interface PilotWeek {
  weekStart: string;
  weeklyActiveStudents: number;
  staffActive: number;
  ackNotices: number;
  ackRecipients: number;
  ackWithin48hRate: number | null;
  medianAckHours: number | null;
  remindersSent: number;
  grievancesOpened: number;
  grievancesResolved: number;
  slaBreached: number;
  appeals: number;
  evidencePacks: number;
  signalViews: number;
}

export interface PilotMetrics {
  institutionId: string;
  from: Date;
  to: Date;
  enrolled: number;
  activated: number;
  activationRate: number | null;
  pendingAcknowledgementsNow: number;
  weeks: PilotWeek[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const num = (v: unknown) => Number(v ?? 0);
const round1 = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

type Row = Record<string, unknown>;
async function one(q: ReturnType<typeof sql>): Promise<Row> {
  const r = await db.execute(q);
  return (r.rows[0] ?? {}) as Row;
}

/** Monday 00:00 IST of the week containing `d`, as a UTC instant. */
export function istWeekStart(d: Date): Date {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow);
  return new Date(monday - 330 * 60_000);
}

async function week(institutionId: string, from: Date, to: Date, now: Date): Promise<PilotWeek> {
  const f = from.toISOString();
  const t = to.toISOString();
  const eligibleBefore = new Date(Math.min(to.getTime(), now.getTime() - 48 * 3600_000)).toISOString();

  const [activity, ack, reminders, packs, signals] = await Promise.all([
    one(sql`
      SELECT count(DISTINCT actor_hash) FILTER (WHERE role = 'STUDENT') AS students,
             count(DISTINCT actor_hash) FILTER (WHERE role <> 'STUDENT') AS staff
      FROM product_active_days
      WHERE institution_id = ${institutionId} AND day >= (${f}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
        AND day < (${t}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`),
    one(sql`
      SELECT count(DISTINCT a.id) AS notices,
             count(r.id) FILTER (WHERE a.published_at < ${eligibleBefore}::timestamptz) AS eligible,
             count(r.id) FILTER (WHERE a.published_at < ${eligibleBefore}::timestamptz
                                   AND r.acknowledged_at IS NOT NULL
                                   AND r.acknowledged_at <= a.published_at + interval '48 hours') AS within48,
             count(r.id) AS recipients,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.acknowledged_at - a.published_at) / 3600)
               FILTER (WHERE r.acknowledged_at IS NOT NULL) AS median_hours
      FROM announcements a
      LEFT JOIN announcement_recipients r ON r.announcement_id = a.id
      WHERE a.institution_id = ${institutionId} AND a.requires_acknowledgement AND a.status = 'PUBLISHED'
        AND a.deleted_at IS NULL AND a.published_at >= ${f}::timestamptz AND a.published_at < ${t}::timestamptz`),
    one(sql`
      SELECT count(*) AS n FROM announcements
      WHERE institution_id = ${institutionId} AND ack_reminder_sent_at >= ${f}::timestamptz AND ack_reminder_sent_at < ${t}::timestamptz`),
    one(sql`
      SELECT count(*) AS n FROM audit_logs
      WHERE institution_id = ${institutionId} AND action = 'EVIDENCE_PACK_EXPORTED'
        AND created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz`),
    one(sql`
      SELECT count(*) AS n FROM product_events
      WHERE institution_id = ${institutionId} AND event = 'attention_signal_viewed'
        AND created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz`),
  ]);
  const g = await grievanceSummary(institutionId, { from, to });

  return {
    weekStart: from.toISOString().slice(0, 10),
    weeklyActiveStudents: num(activity.students),
    staffActive: num(activity.staff),
    ackNotices: num(ack.notices),
    ackRecipients: num(ack.recipients),
    ackWithin48hRate: pct(num(ack.within48), num(ack.eligible)),
    medianAckHours: round1(ack.median_hours),
    remindersSent: num(reminders.n),
    grievancesOpened: g.opened,
    grievancesResolved: g.resolved,
    slaBreached: g.slaBreached,
    appeals: g.appeals,
    evidencePacks: num(packs.n),
    signalViews: num(signals.n),
  };
}

/** Weekly pilot metrics for one college, Monday-to-Monday (IST), read-only. */
export async function pilotMetrics(institutionId: string, range: Range, now = new Date()): Promise<PilotMetrics> {
  const [students, pending] = await Promise.all([
    one(sql`
      SELECT count(*) AS enrolled
      FROM users u WHERE u.institution_id = ${institutionId} AND u.role = 'STUDENT' AND u.status = 'ACTIVE'`),
    one(sql`
      SELECT count(*) AS n FROM announcement_recipients r
      JOIN announcements a ON a.id = r.announcement_id
      WHERE a.institution_id = ${institutionId} AND a.requires_acknowledgement AND a.status = 'PUBLISHED'
        AND a.deleted_at IS NULL AND r.acknowledged_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())`),
  ]);
  // Activation: active days are keyed by a one-way actor hash, so "activated"
  // is the number of distinct student hashes ever active in this college,
  // capped at enrolment (a student who left still has a hash).
  const act = await one(sql`
    SELECT count(DISTINCT actor_hash) AS n FROM product_active_days
    WHERE institution_id = ${institutionId} AND role = 'STUDENT'`);
  const enrolled = num(students.enrolled);
  const activated = Math.min(num(act.n), enrolled);

  const weeks: PilotWeek[] = [];
  for (let start = istWeekStart(range.from); start < range.to; start = new Date(start.getTime() + 7 * 86_400_000)) {
    const end = new Date(Math.min(start.getTime() + 7 * 86_400_000, range.to.getTime()));
    weeks.push(await week(institutionId, start, end, now));
  }
  return {
    institutionId,
    from: range.from,
    to: range.to,
    enrolled,
    activated,
    activationRate: pct(activated, enrolled),
    pendingAcknowledgementsNow: num(pending.n),
    weeks,
  };
}

export function pilotMetricsCsv(m: PilotMetrics): string {
  const cols: (keyof PilotWeek)[] = [
    'weekStart', 'weeklyActiveStudents', 'staffActive', 'ackNotices', 'ackRecipients', 'ackWithin48hRate', 'medianAckHours',
    'remindersSent', 'grievancesOpened', 'grievancesResolved', 'slaBreached', 'appeals', 'evidencePacks', 'signalViews',
  ];
  const lines = [
    `# enrolled=${m.enrolled} activated=${m.activated} activationRate=${m.activationRate ?? ''} pendingNow=${m.pendingAcknowledgementsNow}`,
    cols.join(','),
    ...m.weeks.map((w) => cols.map((c) => (w[c] === null ? '' : String(w[c]))).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Operator export: the weekly CSV for one college. Platform operators only
 * (never the college's own staff, never demo accounts). Audited.
 */
export async function exportPilotMetrics(
  ctx: AuthContext,
  institutionId: string,
  range: Range,
  meta: { ipAddress: string | null; userAgent: string | null },
): Promise<{ filename: string; csv: string }> {
  // Not an operator: behave as if the college doesn't exist (no enumeration).
  if (!isPlatformOperator(ctx)) throw new NotFoundError('That institution');
  const [inst] = await db
    .select({ id: t.institutions.id, slug: t.institutions.slug })
    .from(t.institutions)
    .where(eq(t.institutions.id, institutionId))
    .limit(1);
  if (!inst) throw new NotFoundError('That institution');
  const m = await pilotMetrics(inst.id, range);
  await recordAudit(ctx, {
    action: 'PILOT_METRICS_EXPORTED',
    entityType: 'institution',
    entityId: inst.id,
    after: { from: range.from.toISOString(), to: range.to.toISOString() },
    ...meta,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return { filename: `pilot-metrics-${inst.slug}-${stamp}.csv`, csv: pilotMetricsCsv(m) };
}
