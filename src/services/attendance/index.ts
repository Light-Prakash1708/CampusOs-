import 'server-only';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import {
  advise,
  buildTrend,
  classesToReach,
  percentBp,
  riskState,
  safeAbsences,
  type Advice,
  type RiskState,
  type Tally,
  type TrendPoint,
  type WeekTally,
} from '@/lib/attendance/planner';
import {
  getCurrentTerm,
  getInstitutionTimezone,
  getPublishedTimetable,
  getScheduleExceptions,
  getWeeklyClasses,
} from '@/app/student/_lib/student';
import { getHolidays } from '@/app/student/_lib/campus';
import { occurrencesForDate } from '@/app/student/_lib/schedule';
import { addIsoDays, timeToMinutes, weekStartIso, zonedNow } from '@/app/student/_lib/time';
import { isEnabled } from '@/lib/features';
import { getAttendancePolicy, type AttendancePolicy } from './policy';

export * from './policy';

/**
 * STUDENT ATTENDANCE SERVICE
 * ---------------------------------------------------------------------------
 * Everything a student sees about their own attendance: per-subject tallies,
 * history, weekly trend, risk states, advice and the planner's inputs.
 *
 * Authorisation: every query is keyed by the caller's OWN studentProfileId and
 * institutionId from the session. There is no parameter through which one
 * student could ask for another's attendance; an offering the student is not
 * enrolled in is a 404.
 *
 * Source of truth: attendance_records of SUBMITTED/LOCKED registers, counted
 * with the institution rollup rules (held = PRESENT+ABSENT+LATE+MEDICAL,
 * attended = PRESENT+LATE, EXCUSED not held). A draft register never moves a
 * number. Read-only: nothing here writes attendance.
 */

type StudentCtx = Pick<AuthContext, 'institutionId' | 'userId' | 'sectionId' | 'featureFlags'> & { studentProfileId: string };

export type RecordStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'MEDICAL';
const HELD = new Set<RecordStatus>(['PRESENT', 'ABSENT', 'LATE', 'MEDICAL']);
const ATTENDED = new Set<RecordStatus>(['PRESENT', 'LATE']);

export function tallyOf(statuses: RecordStatus[]): Tally & { excused: number } {
  let held = 0;
  let attended = 0;
  let excused = 0;
  for (const s of statuses) {
    if (HELD.has(s)) held += 1;
    if (ATTENDED.has(s)) attended += 1;
    if (s === 'EXCUSED') excused += 1;
  }
  return { held, attended, excused };
}

export interface SubjectAttendance {
  offeringId: string;
  code: string;
  name: string;
  facultyName: string | null;
  held: number;
  attended: number;
  missed: number;
  excused: number;
  minimumPct: number;
  percentBp: number | null;
  /** Further absences that keep the subject at its minimum. */
  safeAbsences: number;
  /** Consecutive classes to attend to get back to the minimum (0 if at/above). */
  classesToMinimum: number | null;
  /** Classes still scheduled this term on the published timetable; null if unknown. */
  remaining: number | null;
  perWeek: number | null;
  risk: RiskState;
  lastMarkedOn: string | null;
}

export interface AttendanceOverview {
  policy: AttendancePolicy;
  plannerEnabled: boolean;
  term: { id: string; name: string; endDate: string | null } | null;
  subjects: SubjectAttendance[];
  overall: Tally & { missed: number; excused: number; percentBp: number | null; subjectsBelow: number; aggregateRisk: RiskState | null };
  trend: TrendPoint[];
  advice: Advice[];
  /** Today in the college's timezone. */
  today: string;
}

interface Enrolled {
  offeringId: string;
  code: string;
  name: string;
  facultyName: string | null;
  minimumPct: number;
}

async function enrolledOfferings(ctx: StudentCtx, termId: string | null): Promise<Enrolled[]> {
  const conds = [
    eq(t.enrollments.institutionId, ctx.institutionId),
    eq(t.enrollments.studentId, ctx.studentProfileId),
    isNull(t.enrollments.droppedAt),
  ];
  const rows = await db
    .select({
      offeringId: t.courseOfferings.id,
      termId: t.courseOfferings.termId,
      code: t.subjects.code,
      name: t.subjects.name,
      minimum: t.courseOfferings.minAttendancePercentage,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
    })
    .from(t.enrollments)
    .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.enrollments.offeringId))
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.courseOfferings.facultyId))
    .leftJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
    .where(and(...conds))
    .orderBy(asc(t.subjects.code));
  // Scope to the current term when the student has classes in it; otherwise
  // show everything enrolled (colleges that never set a current term).
  const inTerm = termId ? rows.filter((r) => r.termId === termId) : [];
  return (inTerm.length ? inTerm : rows).map((r) => ({
    offeringId: r.offeringId,
    code: r.code,
    name: r.name,
    facultyName: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
    minimumPct: Number(r.minimum),
  }));
}

export interface MarkedClass {
  recordId: string;
  offeringId: string;
  date: string;
  startsAt: Date | null;
  status: RecordStatus;
  topic: string | null;
  corrected: boolean;
  originalStatus: RecordStatus | null;
  correctionReason: string | null;
}

async function markedClasses(ctx: StudentCtx, offeringIds: string[]): Promise<MarkedClass[]> {
  if (!offeringIds.length) return [];
  const rows = await db
    .select({
      recordId: t.attendanceRecords.id,
      offeringId: t.attendanceSessions.offeringId,
      date: t.attendanceSessions.date,
      startsAt: t.attendanceSessions.startsAt,
      status: t.attendanceRecords.status,
      topic: t.attendanceSessions.topicCovered,
      originalStatus: t.attendanceRecords.originalStatus,
      correctedAt: t.attendanceRecords.correctedAt,
      correctionReason: t.attendanceRecords.correctionReason,
    })
    .from(t.attendanceRecords)
    .innerJoin(t.attendanceSessions, eq(t.attendanceSessions.id, t.attendanceRecords.sessionId))
    .where(
      and(
        eq(t.attendanceRecords.institutionId, ctx.institutionId),
        eq(t.attendanceRecords.studentId, ctx.studentProfileId),
        inArray(t.attendanceSessions.offeringId, offeringIds),
        inArray(t.attendanceSessions.status, ['SUBMITTED', 'LOCKED']),
      ),
    )
    .orderBy(desc(t.attendanceSessions.date), desc(t.attendanceSessions.startsAt));
  return rows.map((r) => ({
    recordId: r.recordId,
    offeringId: r.offeringId,
    date: r.date,
    startsAt: r.startsAt,
    status: r.status as RecordStatus,
    topic: r.topic,
    corrected: r.correctedAt !== null,
    originalStatus: (r.originalStatus as RecordStatus | null) ?? null,
    correctionReason: r.correctionReason,
  }));
}

/**
 * Classes still scheduled this term, per offering, from the published
 * timetable: today's classes that haven't started, then every day to the end
 * of teaching — skipping holidays and cancelled classes, adding extra classes.
 * Null for everything when there is no timetable or no term end date.
 */
async function scheduleOutlook(ctx: StudentCtx, termId: string | null, termEnd: string | null, today: string, nowMinutes: number) {
  const remaining = new Map<string, number>();
  const perWeek = new Map<string, number>();
  if (!termId || !ctx.sectionId) return { remaining: null, perWeek: null };
  const timetable = await getPublishedTimetable(ctx.institutionId, termId);
  if (!timetable) return { remaining: null, perWeek: null };
  const classes = await getWeeklyClasses(ctx.institutionId, ctx.sectionId, timetable.versionId);
  for (const c of classes) if (!c.isCancelled) perWeek.set(c.offeringId, (perWeek.get(c.offeringId) ?? 0) + 1);
  if (!termEnd || termEnd < today) return { remaining: termEnd ? remaining : null, perWeek };

  // Cap the walk at a year so a mis-entered term end can't make this unbounded.
  const end = termEnd < addIsoDays(today, 366) ? termEnd : addIsoDays(today, 366);
  const [exceptions, holidays] = await Promise.all([
    getScheduleExceptions(ctx.institutionId, [...new Set(classes.map((c) => c.offeringId))], classes.map((c) => c.entryId), today, end),
    getHolidays(ctx.institutionId, today, end),
  ]);
  const off = new Set(holidays.map((h) => h.date));
  for (let d = today; d <= end; d = addIsoDays(d, 1)) {
    if (off.has(d)) continue;
    for (const o of occurrencesForDate(d, classes, exceptions)) {
      if (o.status === 'CANCELLED') continue;
      if (d === today && (timeToMinutes(o.startTime) ?? 0) <= nowMinutes) continue;
      remaining.set(o.offeringId, (remaining.get(o.offeringId) ?? 0) + 1);
    }
  }
  return { remaining, perWeek };
}

/** Mondays of the last `n` weeks ending with this week, oldest first. */
export function lastWeeks(today: string, n: number): string[] {
  const thisWeek = weekStartIso(today);
  return Array.from({ length: n }, (_, i) => addIsoDays(thisWeek, -7 * (n - 1 - i)));
}

function weeklyTally(classes: MarkedClass[], weeks: string[]): { rows: WeekTally[]; before: Tally } {
  const first = weeks[0]!;
  const byWeek = new Map<string, RecordStatus[]>();
  const earlier: RecordStatus[] = [];
  for (const c of classes) {
    const w = weekStartIso(c.date);
    if (w < first) earlier.push(c.status);
    else byWeek.set(w, [...(byWeek.get(w) ?? []), c.status]);
  }
  return {
    rows: [...byWeek].map(([weekStart, s]) => ({ weekStart, ...tallyOf(s) })),
    before: tallyOf(earlier),
  };
}

export async function getAttendanceOverview(ctx: StudentCtx, opts: { weeks?: number; at?: Date } = {}): Promise<AttendanceOverview> {
  const [policy, term, tz] = await Promise.all([
    getAttendancePolicy(ctx.institutionId),
    getCurrentTerm(ctx.institutionId),
    getInstitutionTimezone(ctx.institutionId),
  ]);
  const now = zonedNow(tz, opts.at);
  const termEnd = term ? (term.teachingEndDate ?? term.endDate) : null;
  const offerings = await enrolledOfferings(ctx, term?.id ?? null);
  const [classes, outlook] = await Promise.all([
    markedClasses(ctx, offerings.map((o) => o.offeringId)),
    scheduleOutlook(ctx, term?.id ?? null, termEnd, now.today, now.minutes),
  ]);

  const byOffering = new Map<string, MarkedClass[]>();
  for (const c of classes) byOffering.set(c.offeringId, [...(byOffering.get(c.offeringId) ?? []), c]);

  const subjects: SubjectAttendance[] = offerings.map((o) => {
    const mine = byOffering.get(o.offeringId) ?? [];
    const tally = tallyOf(mine.map((c) => c.status));
    // Only subjects that are actually on the timetable get a remaining count;
    // an unscheduled subject's future is unknown, not zero.
    const scheduled = outlook.perWeek?.has(o.offeringId) ?? false;
    const remaining = outlook.remaining && scheduled ? (outlook.remaining.get(o.offeringId) ?? 0) : null;
    return {
      ...o,
      held: tally.held,
      attended: tally.attended,
      missed: tally.held - tally.attended,
      excused: tally.excused,
      percentBp: percentBp(tally),
      safeAbsences: safeAbsences(tally, o.minimumPct),
      classesToMinimum: classesToReach(tally, o.minimumPct),
      remaining,
      perWeek: outlook.perWeek ? (outlook.perWeek.get(o.offeringId) ?? 0) || null : null,
      risk: riskState(tally, o.minimumPct, policy.warningMarginPct, remaining),
      lastMarkedOn: mine[0]?.date ?? null,
    };
  });

  const overallTally = subjects.reduce<Tally & { excused: number }>(
    (a, s) => ({ held: a.held + s.held, attended: a.attended + s.attended, excused: a.excused + s.excused }),
    { held: 0, attended: 0, excused: 0 },
  );
  const weeks = lastWeeks(now.today, opts.weeks ?? 8);
  const wk = weeklyTally(classes, weeks);

  return {
    policy,
    plannerEnabled: isEnabled(ctx.featureFlags, 'attendance_planner_enabled'),
    term: term ? { id: term.id, name: term.name, endDate: termEnd } : null,
    subjects,
    overall: {
      ...overallTally,
      missed: overallTally.held - overallTally.attended,
      percentBp: percentBp(overallTally),
      subjectsBelow: subjects.filter((s) => s.risk === 'BELOW' || s.risk === 'CRITICAL').length,
      aggregateRisk:
        policy.aggregateMinimumPct !== null ? riskState(overallTally, policy.aggregateMinimumPct, policy.warningMarginPct, null) : null,
    },
    trend: buildTrend(weeks, wk.rows, wk.before),
    advice: advise(
      subjects.map((s) => ({
        offeringId: s.offeringId,
        name: s.name,
        tally: { held: s.held, attended: s.attended },
        minimumPct: s.minimumPct,
        remaining: s.remaining,
        perWeek: s.perWeek,
      })),
      { marginPct: policy.warningMarginPct, aggregateMinimumPct: policy.aggregateMinimumPct },
    ),
    today: now.today,
  };
}

export interface SubjectDetail {
  subject: SubjectAttendance;
  policy: AttendancePolicy;
  history: MarkedClass[];
  trend: TrendPoint[];
  advice: Advice[];
  plannerEnabled: boolean;
}

/** One subject, only if the student is enrolled in it (else 404). */
export async function getSubjectAttendance(ctx: StudentCtx, offeringId: string, opts: { at?: Date } = {}): Promise<SubjectDetail> {
  const overview = await getAttendanceOverview(ctx, { weeks: 10, at: opts.at });
  const subject = overview.subjects.find((s) => s.offeringId === offeringId);
  if (!subject) throw new NotFoundError('That subject');
  const history = (await markedClasses(ctx, [offeringId])).slice(0, 200);
  const weeks = lastWeeks(overview.today, 10);
  const wk = weeklyTally(history, weeks);
  return {
    subject,
    policy: overview.policy,
    history,
    trend: buildTrend(weeks, wk.rows, wk.before),
    advice: overview.advice.filter((a) => a.offeringId === offeringId),
    plannerEnabled: overview.plannerEnabled,
  };
}

/** Every marked class, for the student's own CSV export. */
export async function exportAttendanceRows(ctx: StudentCtx) {
  const term = await getCurrentTerm(ctx.institutionId);
  const offerings = await enrolledOfferings(ctx, term?.id ?? null);
  const names = new Map(offerings.map((o) => [o.offeringId, o]));
  const rows = await markedClasses(ctx, offerings.map((o) => o.offeringId));
  return rows.map((r) => ({
    date: r.date,
    subjectCode: names.get(r.offeringId)?.code ?? '',
    subject: names.get(r.offeringId)?.name ?? '',
    status: r.status,
    countsAsHeld: HELD.has(r.status),
    countsAsAttended: ATTENDED.has(r.status),
    topic: r.topic ?? '',
    corrected: r.corrected,
  }));
}
