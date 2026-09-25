import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ForbiddenError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { recomputeAttendanceSummaries } from './rollup';

/**
 * ATTENDANCE POLICY — the rules a college controls.
 *
 * Per-class minimums (course_offerings.min_attendance_percentage) remain the
 * authority for each subject. The policy adds:
 *   defaultMinimumPct    the college's standard minimum; admins can apply it
 *                        to every class of the current term in one audited step
 *   warningMarginPct     how close to the minimum counts as "close to the line"
 *   aggregateMinimumPct  optional minimum across all subjects combined
 */

export interface AttendancePolicy {
  defaultMinimumPct: number;
  warningMarginPct: number;
  aggregateMinimumPct: number | null;
}

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
  defaultMinimumPct: 75,
  warningMarginPct: 5,
  aggregateMinimumPct: null,
};

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;

/** Tolerant parse: anything missing or out of range falls back to the default. */
export function parseAttendancePolicy(raw: unknown): AttendancePolicy {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const agg = r.aggregateMinimumPct;
  return {
    defaultMinimumPct: num(r.defaultMinimumPct, 1, 100, DEFAULT_ATTENDANCE_POLICY.defaultMinimumPct),
    warningMarginPct: num(r.warningMarginPct, 0, 25, DEFAULT_ATTENDANCE_POLICY.warningMarginPct),
    aggregateMinimumPct: typeof agg === 'number' && Number.isFinite(agg) && agg >= 1 && agg <= 100 ? agg : null,
  };
}

export async function getAttendancePolicy(institutionId: string): Promise<AttendancePolicy> {
  const [row] = await db
    .select({ policy: t.institutions.attendancePolicy })
    .from(t.institutions)
    .where(eq(t.institutions.id, institutionId))
    .limit(1);
  return parseAttendancePolicy(row?.policy);
}

export interface PolicyUpdate {
  defaultMinimumPct: number;
  warningMarginPct: number;
  aggregateMinimumPct: number | null;
  /** Also set every class of the current term to defaultMinimumPct and recompute. */
  applyToCurrentTerm?: boolean;
}

/**
 * Update the policy (attendance:configure). With `applyToCurrentTerm`, every
 * active class of the current term gets the new minimum and every affected
 * student's summary is recomputed in the same transaction, so headroom and
 * "below minimum" flags never disagree with the rule.
 */
export async function updateAttendancePolicy(
  ctx: AuthContext,
  input: PolicyUpdate,
  meta: { ipAddress: string | null; userAgent: string | null },
): Promise<{ policy: AttendancePolicy; classesUpdated: number }> {
  if (!ctx.permissions.has('attendance:configure')) throw new ForbiddenError();
  const next = parseAttendancePolicy(input);
  if (next.defaultMinimumPct !== input.defaultMinimumPct || next.warningMarginPct !== input.warningMarginPct) {
    throw new AppError('Minimum must be 1–100% and the warning margin 0–25 points.', 422, 'INVALID_POLICY');
  }
  if (input.aggregateMinimumPct !== null && next.aggregateMinimumPct !== input.aggregateMinimumPct) {
    throw new AppError('Overall minimum must be 1–100%, or empty.', 422, 'INVALID_POLICY');
  }

  const [inst] = await db.select({ policy: t.institutions.attendancePolicy }).from(t.institutions).where(eq(t.institutions.id, ctx.institutionId));
  if (!inst) throw new NotFoundError('Institution');
  const before = parseAttendancePolicy(inst.policy);

  let classesUpdated = 0;
  await db.transaction(async (tx) => {
    await tx.update(t.institutions).set({ attendancePolicy: next }).where(eq(t.institutions.id, ctx.institutionId));
    if (!input.applyToCurrentTerm) return;

    const [term] = await tx
      .select({ id: t.terms.id })
      .from(t.terms)
      .where(and(eq(t.terms.institutionId, ctx.institutionId), eq(t.terms.isCurrent, true)))
      .limit(1);
    if (!term) throw new AppError('There is no current term to apply the minimum to.', 409, 'NO_CURRENT_TERM');

    const offerings = await tx
      .update(t.courseOfferings)
      .set({ minAttendancePercentage: String(next.defaultMinimumPct), updatedAt: new Date() })
      .where(
        and(
          eq(t.courseOfferings.institutionId, ctx.institutionId),
          eq(t.courseOfferings.termId, term.id),
          eq(t.courseOfferings.isActive, true),
          isNull(t.courseOfferings.deletedAt),
        ),
      )
      .returning({ id: t.courseOfferings.id });
    classesUpdated = offerings.length;
    if (!offerings.length) return;

    const summaries = await tx
      .select({ offeringId: t.attendanceSummaries.offeringId, studentId: t.attendanceSummaries.studentId })
      .from(t.attendanceSummaries)
      .where(and(eq(t.attendanceSummaries.institutionId, ctx.institutionId), inArray(t.attendanceSummaries.offeringId, offerings.map((o) => o.id))));
    const byOffering = new Map<string, string[]>();
    for (const s of summaries) byOffering.set(s.offeringId, [...(byOffering.get(s.offeringId) ?? []), s.studentId]);
    for (const [offeringId, studentIds] of byOffering) {
      await recomputeAttendanceSummaries(tx, {
        institutionId: ctx.institutionId,
        offeringId,
        minAttendancePercentage: next.defaultMinimumPct,
        studentIds,
      });
    }
  });

  await recordAudit(ctx, {
    action: 'ATTENDANCE_POLICY_UPDATED',
    entityType: 'institution',
    entityId: ctx.institutionId,
    before: { ...before },
    after: { ...next, appliedToCurrentTerm: !!input.applyToCurrentTerm, classesUpdated },
    ...meta,
  });
  return { policy: next, classesUpdated };
}
