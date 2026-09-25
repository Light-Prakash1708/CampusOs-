import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import {
  advise,
  bestCase,
  buildTrend,
  classesToReach,
  formatPct,
  meetsTarget,
  percentBp,
  project,
  reachableThisTerm,
  riskState,
  safeAbsences,
  simulate,
  toBp,
} from '@/lib/attendance/planner';
import {
  exportAttendanceRows,
  getAttendanceOverview,
  getSubjectAttendance,
  lastWeeks,
  parseAttendancePolicy,
  tallyOf,
  updateAttendancePolicy,
} from '@/services/attendance';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/* =============================== pure maths =============================== */

describe('percentages', () => {
  it('is null with no classes, exact otherwise, rounded only for display', () => {
    expect(percentBp({ held: 0, attended: 0 })).toBeNull();
    expect(percentBp({ held: 10, attended: 10 })).toBe(10_000);
    expect(percentBp({ held: 10, attended: 0 })).toBe(0);
    expect(percentBp({ held: 48, attended: 39 })).toBe(8125); // 81.25%
    expect(formatPct(8125)).toBe('81.3%');
    expect(formatPct(null)).toBe('—');
    expect(toBp(75)).toBe(7500);
    expect(toBp(75.5)).toBe(7550);
    expect(toBp(0)).toBe(1); // a 0% target is clamped, never divides by zero
    expect(toBp(250)).toBe(10_000);
  });

  it('decides "above target" in integers, not floats', () => {
    // 3 of 4 is exactly 75% — at the line counts as meeting it.
    expect(meetsTarget({ held: 4, attended: 3 }, 75)).toBe(true);
    // 2 of 3 = 66.67% < 66.7% target.
    expect(meetsTarget({ held: 3, attended: 2 }, 66.7)).toBe(false);
    expect(meetsTarget({ held: 3, attended: 2 }, 66.66)).toBe(true);
  });
});

describe('safe absences', () => {
  it('matches brute force for every small case', () => {
    for (let held = 0; held <= 40; held++) {
      for (let attended = 0; attended <= held; attended++) {
        for (const target of [50, 60, 66.7, 75, 80, 85.5, 90, 100]) {
          let k = 0;
          while (meetsTarget({ held: held + k + 1, attended }, target)) k++;
          const expected = meetsTarget({ held, attended }, target) ? k : 0;
          expect(safeAbsences({ held, attended }, target), `${attended}/${held} @${target}`).toBe(expected);
        }
      }
    }
  });

  it('handles the named edge cases', () => {
    expect(safeAbsences({ held: 0, attended: 0 }, 75)).toBe(0); // 0 classes
    expect(safeAbsences({ held: 10, attended: 10 }, 75)).toBe(3); // 100%: 10/13 = 76.9%, 10/14 = 71.4%
    expect(safeAbsences({ held: 10, attended: 0 }, 75)).toBe(0); // 0%
    expect(safeAbsences({ held: 4, attended: 3 }, 75)).toBe(0); // target == current
    expect(safeAbsences({ held: 10, attended: 10 }, 50)).toBe(10); // target well below current
    expect(safeAbsences({ held: 20, attended: 20 }, 100)).toBe(0); // 100% target: no absence is safe
  });
});

describe('classes needed to reach a target', () => {
  it('matches brute force and is null only when impossible', () => {
    for (let held = 0; held <= 40; held++) {
      for (let attended = 0; attended <= held; attended++) {
        for (const target of [50, 66.7, 75, 80, 99, 100]) {
          const got = classesToReach({ held, attended }, target);
          if (target === 100 && attended < held) {
            expect(got).toBeNull();
            continue;
          }
          let x = 0;
          while (!meetsTarget({ held: held + x, attended: attended + x }, target)) x++;
          expect(got, `${attended}/${held} → ${target}`).toBe(x);
        }
      }
    }
  });

  it('handles the named edge cases', () => {
    expect(classesToReach({ held: 0, attended: 0 }, 75)).toBe(0);
    expect(classesToReach({ held: 10, attended: 0 }, 75)).toBe(30); // 30/40 = 75%
    expect(classesToReach({ held: 10, attended: 10 }, 100)).toBe(0);
    expect(classesToReach({ held: 10, attended: 9 }, 100)).toBeNull(); // above achievable
    expect(classesToReach({ held: 25, attended: 18 }, 75)).toBe(3); // 72% → 21/28 = 75%
  });

  it('knows when the target is out of reach this term', () => {
    const t = { held: 40, attended: 20 }; // 50%
    expect(classesToReach(t, 75)).toBe(40);
    expect(reachableThisTerm(t, 75, 40)).toBe(true);
    expect(reachableThisTerm(t, 75, 39)).toBe(false);
    expect(reachableThisTerm(t, 75, null)).toBeNull(); // unknown schedule
    expect(bestCase(t, 10)).toBe(6000); // 30/50
  });
});

describe('what-if simulations', () => {
  it('projects misses and attendance from where you are (mockup example 82% @ 75%)', () => {
    const t = { held: 50, attended: 41 }; // 82%
    const miss = simulate(t, 'miss', [1, 2, 3, 4, 5], 75).map((r) => [r.percentBp, r.meetsTarget]);
    expect(miss).toEqual([
      [8039, true], // 41/51
      [7885, true], // 41/52
      [7736, true], // 41/53
      [7593, true], // 41/54
      [7455, false], // 41/55
    ]);
    expect(safeAbsences(t, 75)).toBe(4);
    const attend = simulate(t, 'attend', [1, 5], 75).map((r) => r.percentBp);
    expect(attend).toEqual([8235, 8364]); // 42/51, 46/55
    expect(project(t, { attend: 2, miss: 3 })).toEqual({ held: 55, attended: 43 });
    expect(project(t, { attend: -3, miss: 1.7 })).toEqual({ held: 51, attended: 41 }); // sanitised
  });

  it('never trusts impossible tallies', () => {
    expect(percentBp({ held: 5, attended: 9 })).toBe(10_000); // attended clamped to held
    expect(percentBp({ held: -3, attended: 0 })).toBeNull();
  });
});

describe('risk states', () => {
  it('classifies every band', () => {
    expect(riskState({ held: 0, attended: 0 }, 75, 5)).toBe('NO_DATA');
    expect(riskState({ held: 20, attended: 20 }, 75, 5)).toBe('SAFE');
  });
  it('uses the margin precisely', () => {
    expect(riskState({ held: 20, attended: 16 }, 75, 5)).toBe('SAFE'); // exactly 80% meets 75+5
    expect(riskState({ held: 100, attended: 79 }, 75, 5)).toBe('WATCH'); // 79%: safe 5, within margin
    expect(riskState({ held: 4, attended: 3 }, 75, 5)).toBe('AT_RISK'); // exactly 75%, next absence drops below
    expect(riskState({ held: 25, attended: 18 }, 75, 5)).toBe('BELOW');
    expect(riskState({ held: 25, attended: 18 }, 75, 5, 3)).toBe('BELOW'); // needs 3, 3 left
    expect(riskState({ held: 25, attended: 18 }, 75, 5, 2)).toBe('CRITICAL'); // needs 3, only 2 left
    expect(riskState({ held: 10, attended: 9 }, 100, 0)).toBe('CRITICAL'); // 100% minimum, one missed
  });
});

describe('advisor', () => {
  const S = (name: string, held: number, attended: number, remaining: number | null = null, perWeek: number | null = 3) => ({
    offeringId: name,
    name,
    tally: { held, attended },
    minimumPct: 75,
    remaining,
    perWeek,
  });

  it('puts the most urgent first and handles several subjects below the minimum', () => {
    const advice = advise([S('Economics', 25, 18, 20), S('Statistics', 20, 5, 10), S('Finance', 4, 3), S('Law', 100, 79), S('Maths', 20, 20)], {
      marginPct: 5,
      aggregateMinimumPct: null,
    });
    expect(advice.map((a) => [a.offeringId, a.state])).toEqual([
      ['Statistics', 'CRITICAL'], // needs 40, only 10 left
      ['Economics', 'BELOW'],
      ['Finance', 'AT_RISK'],
      ['Law', 'WATCH'],
    ]);
    expect(advice[1]!.title).toBe('Attend the next 3 Economics classes');
    expect(advice[1]!.body).toContain('about 1 week');
    expect(advice[0]!.body).toMatch(/remaining scheduled classes takes you to 50\.0%/);
  });

  it('never tells anyone to skip', () => {
    const all = advise([S('A', 100, 100), S('B', 100, 79), S('C', 10, 2, 30)], { marginPct: 5, aggregateMinimumPct: 75 });
    const text = JSON.stringify(all).toLowerCase();
    expect(text).not.toMatch(/\bbunk|\bskip/);
    expect(advise([S('A', 100, 100)], { marginPct: 5, aggregateMinimumPct: null })[0]).toMatchObject({ severity: 'good' });
    expect(text).toContain('emergencies');
  });

  it('adds the overall rule when the college has one', () => {
    const advice = advise([S('A', 10, 10), S('B', 10, 6)], { marginPct: 0, aggregateMinimumPct: 85 });
    expect(advice.some((a) => a.state === 'AGGREGATE')).toBe(true);
  });

  it('says there is nothing yet when nothing is marked', () => {
    expect(advise([S('A', 0, 0)], { marginPct: 5, aggregateMinimumPct: null })).toEqual([expect.objectContaining({ state: 'NO_DATA', severity: 'info' })]);
  });
});

describe('trend', () => {
  it('keeps empty weeks as gaps and carries the running total', () => {
    const weeks = ['2026-09-07', '2026-09-14', '2026-09-21'];
    const trend = buildTrend(weeks, [
      { weekStart: '2026-09-07', held: 4, attended: 4 },
      { weekStart: '2026-09-21', held: 4, attended: 2 },
    ], { held: 10, attended: 5 });
    expect(trend.map((p) => p.weekBp)).toEqual([10_000, null, 5000]);
    expect(trend.map((p) => p.cumulativeBp)).toEqual([6429, 6429, 6111]); // 9/14, 9/14, 11/18
  });
  it('builds week windows ending this week', () => {
    expect(lastWeeks('2026-09-25', 3)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });
});

describe('counting rules', () => {
  it('present/late attended; absent/medical held; excused not held', () => {
    expect(tallyOf(['PRESENT', 'LATE', 'ABSENT', 'MEDICAL', 'EXCUSED'])).toEqual({ held: 4, attended: 2, excused: 1 });
  });
  it('parses policy tolerantly', () => {
    expect(parseAttendancePolicy({})).toEqual({ defaultMinimumPct: 75, warningMarginPct: 5, aggregateMinimumPct: null });
    expect(parseAttendancePolicy({ defaultMinimumPct: 999, warningMarginPct: -1, aggregateMinimumPct: 'x' })).toEqual({
      defaultMinimumPct: 75,
      warningMarginPct: 5,
      aggregateMinimumPct: null,
    });
    expect(parseAttendancePolicy({ defaultMinimumPct: 80, warningMarginPct: 0, aggregateMinimumPct: 70 })).toEqual({
      defaultMinimumPct: 80,
      warningMarginPct: 0,
      aggregateMinimumPct: 70,
    });
  });
});

/* ============================== integration =============================== */

let A: TestTenant;
let offeringId: string;
let offering2: string;

async function addSession(tenantId: string, offering: string, date: string, status: 'SUBMITTED' | 'LOCKED' | 'OPEN' = 'SUBMITTED') {
  const [s] = await db.insert(t.attendanceSessions).values({ institutionId: tenantId, offeringId: offering, date, status }).returning();
  return s!.id;
}

async function mark(tenantId: string, sessionId: string, studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'MEDICAL') {
  await db.insert(t.attendanceRecords).values({ institutionId: tenantId, sessionId, studentId, status });
}

beforeAll(async () => {
  A = await createTenant();
  const [year] = await db.insert(t.academicYears).values({ institutionId: A.id, label: '2026-27', startDate: '2026-07-01', endDate: '2027-06-30', isCurrent: true }).returning();
  const [term] = await db
    .insert(t.terms)
    .values({ institutionId: A.id, academicYearId: year!.id, name: 'Semester 1', semesterNumber: 1, startDate: '2026-07-15', endDate: '2026-12-15', isCurrent: true })
    .returning();
  const subjects = await db
    .insert(t.subjects)
    .values([
      { institutionId: A.id, departmentId: A.departmentId, code: 'ECO101', name: 'Economics' },
      { institutionId: A.id, departmentId: A.departmentId, code: 'STA101', name: 'Statistics' },
    ])
    .returning();
  const offs = await db
    .insert(t.courseOfferings)
    .values(subjects.map((s) => ({ institutionId: A.id, termId: term!.id, subjectId: s.id, sectionId: A.sectionId, minAttendancePercentage: '75' })))
    .returning();
  offeringId = offs.find((o) => o.subjectId === subjects[0]!.id)!.id;
  offering2 = offs.find((o) => o.subjectId === subjects[1]!.id)!.id;
});

afterAll(async () => {
  await dropTenant(A.id);
  await pool.end();
});

async function enrolledStudent() {
  const ctx = await ctxFor((await createUser(A)).id);
  await db.insert(t.enrollments).values([
    { institutionId: A.id, offeringId, studentId: ctx.studentProfileId! },
    { institutionId: A.id, offeringId: offering2, studentId: ctx.studentProfileId! },
  ]);
  return { ...ctx, studentProfileId: ctx.studentProfileId! };
}

describe('student attendance service', () => {
  it('counts only submitted registers, applies the rules, and shows only my own records', async () => {
    const me = await enrolledStudent();
    const other = await enrolledStudent();
    const statuses = ['PRESENT', 'PRESENT', 'LATE', 'ABSENT', 'MEDICAL', 'EXCUSED'] as const;
    for (const [i, st] of statuses.entries()) {
      const sid = await addSession(A.id, offeringId, `2026-09-0${i + 1}`);
      await mark(A.id, sid, me.studentProfileId, st);
      await mark(A.id, sid, other.studentProfileId, 'ABSENT');
    }
    // A draft register must not move anything.
    const draft = await addSession(A.id, offeringId, '2026-09-10', 'OPEN');
    await mark(A.id, draft, me.studentProfileId, 'ABSENT');

    const ov = await getAttendanceOverview(me, { at: new Date('2026-09-25T06:00:00Z') });
    const eco = ov.subjects.find((s) => s.offeringId === offeringId)!;
    expect(eco).toMatchObject({ held: 5, attended: 3, missed: 2, excused: 1, percentBp: 6000, minimumPct: 75 });
    expect(eco.classesToMinimum).toBe(3); // 6/8 = 75%
    expect(eco.risk).toBe('BELOW'); // no timetable → remaining unknown, so never "critical" by guess
    expect(eco.remaining).toBeNull();
    const sta = ov.subjects.find((s) => s.offeringId === offering2)!;
    expect(sta).toMatchObject({ held: 0, risk: 'NO_DATA', percentBp: null });
    expect(ov.overall).toMatchObject({ held: 5, attended: 3, subjectsBelow: 1 });
    expect(ov.advice[0]).toMatchObject({ offeringId, state: 'BELOW' });
    expect(ov.trend.at(-4)!.held + ov.trend.at(-3)!.held).toBeGreaterThanOrEqual(0);

    const otherView = await getAttendanceOverview(other, { at: new Date('2026-09-25T06:00:00Z') });
    expect(otherView.subjects.find((s) => s.offeringId === offeringId)).toMatchObject({ held: 6, attended: 0 });

    const detail = await getSubjectAttendance(me, offeringId, { at: new Date('2026-09-25T06:00:00Z') });
    expect(detail.history).toHaveLength(6); // draft excluded, excused listed
    expect(detail.history.map((h) => h.status)).toContain('EXCUSED');

    const rows = await exportAttendanceRows(me);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.subjectCode === 'ECO101')).toBe(true);
  });

  it('refuses a subject the student is not enrolled in', async () => {
    const outsider = await ctxFor((await createUser(A)).id);
    await expect(getSubjectAttendance({ ...outsider, studentProfileId: outsider.studentProfileId! }, offeringId)).rejects.toMatchObject({ status: 404 });
  });
});

describe('attendance policy', () => {
  it('only attendance:configure may change it; applying the minimum recomputes summaries', async () => {
    const student = await ctxFor((await createUser(A)).id);
    await expect(updateAttendancePolicy(student, { defaultMinimumPct: 60, warningMarginPct: 5, aggregateMinimumPct: null }, meta())).rejects.toMatchObject({ status: 403 });

    const me = await enrolledStudent();
    for (const [i, st] of (['PRESENT', 'PRESENT', 'ABSENT'] as const).entries()) {
      const sid = await addSession(A.id, offering2, `2026-08-1${i}`);
      await mark(A.id, sid, me.studentProfileId, st);
    }
    // Seed the cache the way faculty submission does, at 75%.
    await db.insert(t.attendanceSummaries).values({ institutionId: A.id, studentId: me.studentProfileId, offeringId: offering2, heldSessions: 3, attendedSessions: 2, percentageBp: 6667, isBelowThreshold: true, absenceHeadroom: 0 });

    const admin = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    await expect(updateAttendancePolicy(admin, { defaultMinimumPct: 150, warningMarginPct: 5, aggregateMinimumPct: null }, meta())).rejects.toMatchObject({ status: 422 });
    const res = await updateAttendancePolicy(admin, { defaultMinimumPct: 60, warningMarginPct: 3, aggregateMinimumPct: 65, applyToCurrentTerm: true }, meta());
    expect(res.classesUpdated).toBe(2);
    expect(res.policy).toEqual({ defaultMinimumPct: 60, warningMarginPct: 3, aggregateMinimumPct: 65 });

    const [sum] = await db
      .select()
      .from(t.attendanceSummaries)
      .where(and(eq(t.attendanceSummaries.studentId, me.studentProfileId), eq(t.attendanceSummaries.offeringId, offering2)));
    expect(sum).toMatchObject({ isBelowThreshold: false, absenceHeadroom: 0 }); // 2/3 = 66.7% ≥ 60%; 2/4 = 50% < 60%

    const ov = await getAttendanceOverview(me);
    expect(ov.policy.aggregateMinimumPct).toBe(65);
    expect(ov.subjects.find((s) => s.offeringId === offering2)).toMatchObject({ minimumPct: 60, risk: 'AT_RISK' });

    const audit = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.institutionId, A.id), eq(t.auditLogs.action, 'ATTENDANCE_POLICY_UPDATED')));
    expect(audit).toHaveLength(1);
  });
});

describe('faculty rollup (regression: array binding)', () => {
  it('recomputes summaries for several students in one call', async () => {
    const { recomputeAttendanceSummaries } = await import('@/services/attendance/rollup');
    const s1 = await enrolledStudent();
    const s2 = await enrolledStudent();
    const sid = await addSession(A.id, offering2, '2026-07-20');
    await mark(A.id, sid, s1.studentProfileId, 'PRESENT');
    await mark(A.id, sid, s2.studentProfileId, 'ABSENT');
    await db.transaction((tx) =>
      recomputeAttendanceSummaries(tx, { institutionId: A.id, offeringId: offering2, minAttendancePercentage: 75, studentIds: [s1.studentProfileId, s2.studentProfileId] }),
    );
    const rows = await db.select().from(t.attendanceSummaries).where(eq(t.attendanceSummaries.offeringId, offering2));
    const by = new Map(rows.map((r) => [r.studentId, r]));
    expect(by.get(s1.studentProfileId)).toMatchObject({ heldSessions: 1, attendedSessions: 1, percentageBp: 10_000, isBelowThreshold: false, absenceHeadroom: 0 });
    expect(by.get(s2.studentProfileId)).toMatchObject({ heldSessions: 1, attendedSessions: 0, percentageBp: 0, isBelowThreshold: true });
  });
});
