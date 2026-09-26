import 'server-only';
import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { ForbiddenError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { formatPct } from '@/lib/attendance/planner';
import { getAttendanceOverview } from '@/services/attendance';
import { pendingAcknowledgementsFor } from '@/services/notice-receipts';

/**
 * ATTENTION SIGNALS (CAMPUSOS-013)
 * ---------------------------------------------------------------------------
 * Transparent, rule-based signals — never a score, a prediction or a label.
 * Each signal says what happened, why it matters, where the data came from
 * and what to do next. Students see their own first; staff see signals only
 * for the classes they teach (or college-wide with attendance:view_all).
 *
 * Deliberately NOT here: any composite number, "probability of failing",
 * ranking of students, or inference from behaviour beyond these records.
 */

export type SignalKind = 'ATTENDANCE' | 'SUBMISSIONS' | 'DEADLINE' | 'NOTICE';

export interface AttentionSignal {
  kind: SignalKind;
  severity: 'critical' | 'warning';
  /** What happened, in one line: "DBMS — 68% attendance, required 75%". */
  what: string;
  /** Why it matters. */
  why: string;
  /** Where the data came from. */
  source: string;
  action: { label: string; href: string };
}

/** Rules, stated once so the UI and docs can show them. */
export const SIGNAL_RULES = {
  missingWindowDays: 14,
  missingThreshold: 1,
  staffMissingThreshold: 3,
  deadlineHours: 48,
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type StudentCtx = Pick<AuthContext, 'institutionId' | 'userId' | 'sectionId' | 'featureFlags' | 'permissions'> & { studentProfileId: string | null };

/** A student's own signals. */
export async function studentSignals(ctx: StudentCtx, now = new Date()): Promise<AttentionSignal[]> {
  if (!ctx.studentProfileId) return [];
  const sctx = { ...ctx, studentProfileId: ctx.studentProfileId };
  const signals: AttentionSignal[] = [];

  if (ctx.permissions.has('attendance:view_own')) {
    const overview = await getAttendanceOverview(sctx, { at: now });
    for (const s of overview.subjects) {
      if (s.held === 0 || s.percentBp === null) continue;
      const below = s.percentBp < s.minimumPct * 100;
      const edge = !below && s.safeAbsences === 0;
      if (!below && !edge) continue;
      signals.push({
        kind: 'ATTENDANCE',
        severity: below ? 'critical' : 'warning',
        what: `${s.name} — ${formatPct(s.percentBp, 1)} attendance, required ${s.minimumPct}%`,
        why: below
          ? s.classesToMinimum !== null && (s.remaining === null || s.classesToMinimum <= s.remaining)
            ? `You may need to attend your next ${plural(s.classesToMinimum, 'class', 'classes')} in a row to get back to ${s.minimumPct}%.`
            : `You may not be able to reach ${s.minimumPct}% with the classes left this term — talk to your faculty or HOD about your college’s rules.`
          : `One more absence takes ${s.name} below ${s.minimumPct}%.`,
        source: `Registers submitted by ${s.facultyName ?? 'your faculty'}${s.lastMarkedOn ? `, last marked ${s.lastMarkedOn}` : ''}`,
        action: { label: 'Open attendance planner', href: `/student/attendance/${s.offeringId}` },
      });
    }
  }

  // Coursework: missing in the last 14 days, and due within 48 hours.
  const offeringIds = (
    await db
      .select({ id: t.enrollments.offeringId })
      .from(t.enrollments)
      .where(and(eq(t.enrollments.institutionId, ctx.institutionId), eq(t.enrollments.studentId, ctx.studentProfileId), isNull(t.enrollments.droppedAt)))
  ).map((r) => r.id);
  if (offeringIds.length) {
    const since = new Date(now.getTime() - SIGNAL_RULES.missingWindowDays * 86_400_000);
    const soon = new Date(now.getTime() + SIGNAL_RULES.deadlineHours * 3_600_000);
    const rows = await db
      .select({
        id: t.assignments.id,
        title: t.assignments.title,
        dueAt: t.assignments.dueAt,
        submitted: sql<boolean>`exists (select 1 from ${t.submissions} s where s.assignment_id = ${t.assignments.id} and s.student_id = ${ctx.studentProfileId} and s.status <> 'NOT_SUBMITTED')`,
      })
      .from(t.assignments)
      .where(
        and(
          eq(t.assignments.institutionId, ctx.institutionId),
          inArray(t.assignments.offeringId, offeringIds),
          eq(t.assignments.status, 'PUBLISHED'),
          isNull(t.assignments.deletedAt),
          gte(t.assignments.dueAt, since),
          lt(t.assignments.dueAt, soon),
        ),
      )
      .orderBy(asc(t.assignments.dueAt));
    const missing = rows.filter((r) => !r.submitted && r.dueAt && r.dueAt < now);
    const dueSoon = rows.filter((r) => !r.submitted && r.dueAt && r.dueAt >= now);
    if (missing.length >= SIGNAL_RULES.missingThreshold) {
      signals.push({
        kind: 'SUBMISSIONS',
        severity: missing.length >= 3 ? 'critical' : 'warning',
        what: `${plural(missing.length, 'assignment')} not submitted in the last ${SIGNAL_RULES.missingWindowDays} days`,
        why: 'Late or missing work usually affects internal marks. Some assignments still accept late submissions.',
        source: `Assignments your faculty published: ${missing.slice(0, 3).map((m) => m.title).join(', ')}${missing.length > 3 ? '…' : ''}`,
        action: { label: 'See assignments', href: '/student/assignments' },
      });
    }
    for (const d of dueSoon.slice(0, 3)) {
      const hours = Math.max(1, Math.round((d.dueAt!.getTime() - now.getTime()) / 3_600_000));
      signals.push({
        kind: 'DEADLINE',
        severity: 'warning',
        what: `${d.title} is due in ${hours < 24 ? plural(hours, 'hour') : plural(Math.round(hours / 24), 'day')}`,
        why: 'You haven’t submitted it yet.',
        source: 'Assignment due date set by your faculty',
        action: { label: 'Open assignment', href: `/student/assignments#${d.id}` },
      });
    }
  }

  const acks = await pendingAcknowledgementsFor(ctx);
  for (const a of acks.slice(0, 3)) {
    signals.push({
      kind: 'NOTICE',
      severity: a.deadline && a.deadline.getTime() - now.getTime() < 86_400_000 ? 'critical' : 'warning',
      what: `Your college asked you to acknowledge “${a.title}”`,
      why: a.deadline ? `Please confirm by ${a.deadline.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.` : 'Your college needs to know you have read it.',
      source: 'Official notice',
      action: { label: 'Read and acknowledge', href: `/announcements/${a.id}` },
    });
  }

  const order: Record<SignalKind, number> = { ATTENDANCE: 0, NOTICE: 1, DEADLINE: 2, SUBMISSIONS: 3 };
  return signals.sort((a, b) => (a.severity === b.severity ? order[a.kind] - order[b.kind] : a.severity === 'critical' ? -1 : 1));
}

export interface StaffSignalRow {
  student: { name: string; rollNumber: string; section: string | null };
  signals: AttentionSignal[];
}

/**
 * Signals for staff: only students in classes the caller teaches (or the
 * whole college with attendance:view_all). Listed by section and name —
 * never ranked.
 */
export async function staffSignals(ctx: AuthContext, opts: { limit?: number } = {}): Promise<StaffSignalRow[]> {
  if (!ctx.permissions.has('attendance:view_section')) throw new ForbiddenError();
  const collegeWide = ctx.permissions.has('attendance:view_all');
  if (!collegeWide && !ctx.facultyProfileId) return [];
  const scope = collegeWide ? sql`true` : eq(t.courseOfferings.facultyId, ctx.facultyProfileId!);
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200));

  const below = await db
    .select({
      studentId: t.studentProfiles.id,
      rollNumber: t.studentProfiles.rollNumber,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      section: t.sections.code,
      subject: t.subjects.name,
      offeringId: t.courseOfferings.id,
      percentageBp: t.attendanceSummaries.percentageBp,
      attended: t.attendanceSummaries.attendedSessions,
      held: t.attendanceSummaries.heldSessions,
      minimumPct: t.courseOfferings.minAttendancePercentage,
    })
    .from(t.attendanceSummaries)
    .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.attendanceSummaries.studentId))
    .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
    .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.attendanceSummaries.offeringId))
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .leftJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
    .where(and(eq(t.attendanceSummaries.institutionId, ctx.institutionId), eq(t.attendanceSummaries.isBelowThreshold, true), scope))
    .limit(2000);

  const since = new Date(Date.now() - SIGNAL_RULES.missingWindowDays * 86_400_000);
  const missing = await db
    .select({
      studentId: t.studentProfiles.id,
      rollNumber: t.studentProfiles.rollNumber,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      section: t.sections.code,
      n: sql<number>`count(*)::int`,
    })
    .from(t.assignments)
    .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.assignments.offeringId))
    .innerJoin(t.enrollments, and(eq(t.enrollments.offeringId, t.courseOfferings.id), isNull(t.enrollments.droppedAt)))
    .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.enrollments.studentId))
    .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
    .leftJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
    .where(
      and(
        eq(t.assignments.institutionId, ctx.institutionId),
        eq(t.assignments.status, 'PUBLISHED'),
        isNull(t.assignments.deletedAt),
        gte(t.assignments.dueAt, since),
        lt(t.assignments.dueAt, new Date()),
        scope,
        sql`not exists (select 1 from ${t.submissions} s where s.assignment_id = ${t.assignments.id} and s.student_id = ${t.studentProfiles.id} and s.status <> 'NOT_SUBMITTED')`,
      ),
    )
    .groupBy(t.studentProfiles.id, t.studentProfiles.rollNumber, t.users.firstName, t.users.lastName, t.sections.code)
    .having(sql`count(*) >= ${SIGNAL_RULES.staffMissingThreshold}`);

  const byStudent = new Map<string, StaffSignalRow>();
  const row = (id: string, r: { rollNumber: string; firstName: string; lastName: string; section: string | null }) => {
    if (!byStudent.has(id)) byStudent.set(id, { student: { name: `${r.firstName} ${r.lastName}`.trim(), rollNumber: r.rollNumber, section: r.section }, signals: [] });
    return byStudent.get(id)!;
  };
  for (const b of below) {
    row(b.studentId, b).signals.push({
      kind: 'ATTENDANCE',
      severity: 'critical',
      what: `${b.subject} — ${formatPct(b.percentageBp, 1)} attendance (${b.attended}/${b.held})${b.minimumPct ? `, required ${Number(b.minimumPct)}%` : ''}`,
      why: 'Below your college’s attendance requirement for this subject.',
      source: 'Attendance registers',
      action: { label: 'Open class', href: `/faculty/classes/${b.offeringId}` },
    });
  }
  for (const m of missing) {
    row(m.studentId, m).signals.push({
      kind: 'SUBMISSIONS',
      severity: 'warning',
      what: `${plural(Number(m.n), 'assignment')} not submitted in the last ${SIGNAL_RULES.missingWindowDays} days`,
      why: `${SIGNAL_RULES.staffMissingThreshold} or more missing submissions in your classes.`,
      source: 'Assignments and submissions',
      action: { label: 'Open assignments', href: '/faculty/assignments' },
    });
  }
  return [...byStudent.values()]
    .sort((a, b) => (a.student.section ?? '').localeCompare(b.student.section ?? '') || a.student.name.localeCompare(b.student.name))
    .slice(0, limit);
}
