import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { staffSignals, studentSignals } from '@/services/attention-signals';
import { toolsForUser } from '@/services/ai/tools';
import { createTenant, createUser, ctxFor, dropTenant, type TestTenant } from './helpers';

/**
 * CAMPUSOS-013: attention signals are transparent rules, shown to the
 * student first and to staff only for their own classes. No scores.
 */

let A: TestTenant;
let B: TestTenant;
let offeringId: string;
let facultyUserId: string;
const AT = new Date('2026-09-25T06:00:00Z');

beforeAll(async () => {
  A = await createTenant();
  B = await createTenant();
  const [year] = await db.insert(t.academicYears).values({ institutionId: A.id, label: '2026-27', startDate: '2026-07-01', endDate: '2027-06-30', isCurrent: true }).returning();
  const [term] = await db
    .insert(t.terms)
    .values({ institutionId: A.id, academicYearId: year!.id, name: 'Semester 1', semesterNumber: 1, startDate: '2026-07-15', endDate: '2026-12-15', isCurrent: true })
    .returning();
  const [subject] = await db.insert(t.subjects).values({ institutionId: A.id, departmentId: A.departmentId, code: 'DBM201', name: 'DBMS' }).returning();
  const teacher = await createUser(A, { role: 'FACULTY' });
  facultyUserId = teacher.id;
  const [fp] = await db.insert(t.facultyProfiles).values({ institutionId: A.id, userId: teacher.id, employeeCode: `E-${Date.now()}`, departmentId: A.departmentId }).returning();
  const [off] = await db
    .insert(t.courseOfferings)
    .values({ institutionId: A.id, termId: term!.id, subjectId: subject!.id, sectionId: A.sectionId, facultyId: fp!.id, minAttendancePercentage: '75' })
    .returning();
  offeringId = off!.id;
});

afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

async function studentBelowMinimum() {
  const u = await createUser(A);
  const ctx = await ctxFor(u.id);
  await db.insert(t.enrollments).values({ institutionId: A.id, offeringId, studentId: ctx.studentProfileId! });
  const statuses = ['PRESENT', 'ABSENT', 'ABSENT', 'PRESENT', 'ABSENT', 'PRESENT', 'PRESENT', 'ABSENT'] as const;
  for (const [i, st] of statuses.entries()) {
    const [s] = await db.insert(t.attendanceSessions).values({ institutionId: A.id, offeringId, date: `2026-09-0${i + 1}`, status: 'SUBMITTED' }).returning();
    await db.insert(t.attendanceRecords).values({ institutionId: A.id, sessionId: s!.id, studentId: ctx.studentProfileId!, status: st });
  }
  await db.insert(t.attendanceSummaries).values({ institutionId: A.id, studentId: ctx.studentProfileId!, offeringId, heldSessions: 8, attendedSessions: 4, percentageBp: 5000, isBelowThreshold: true });
  return ctx;
}

describe('student signals', () => {
  it('explain what, why, source and action — with no score', async () => {
    const me = await studentBelowMinimum();
    const signals = await studentSignals(me, AT);
    const att = signals.find((s) => s.kind === 'ATTENDANCE')!;
    expect(att).toMatchObject({ severity: 'critical' });
    expect(att.what).toContain('DBMS');
    expect(att.what).toContain('75%');
    expect(att.why).toMatch(/attend your next \d+ classes|may not be able to reach/);
    expect(att.source).toMatch(/Registers/);
    expect(att.action.href).toBe(`/student/attendance/${offeringId}`);
    const text = JSON.stringify(signals).toLowerCase();
    expect(text).not.toMatch(/\bscore\b|\bat risk\b|predict|likely to fail/);
  });

  it('are empty for someone without student records', async () => {
    const teacher = await ctxFor(facultyUserId);
    expect(await studentSignals(teacher, AT)).toEqual([]);
  });
});

describe('staff signals', () => {
  it('show a teacher only students in their own classes, listed by name — never ranked', async () => {
    const s = await studentBelowMinimum();
    const rows = await staffSignals(await ctxFor(facultyUserId));
    const mine = rows.find((r) => r.student.rollNumber === (s as unknown as { rollNumber?: string }).rollNumber) ?? rows[0];
    expect(mine?.signals[0]).toMatchObject({ kind: 'ATTENDANCE' });
    expect(Object.keys(mine!)).toEqual(['student', 'signals']); // no score field
    const names = rows.map((r) => `${r.student.section ?? ''}|${r.student.name}`);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    const otherTeacher = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    expect(await staffSignals(otherTeacher)).toEqual([]); // no classes of their own
    const foreignAdmin = await ctxFor((await createUser(B, { role: 'SUPER_ADMIN' })).id);
    expect(await staffSignals(foreignAdmin)).toEqual([]); // another college sees nothing
    const student = await ctxFor((await createUser(A)).id);
    await expect(staffSignals(student)).rejects.toMatchObject({ status: 403 });
  });
});

describe('AI tools', () => {
  it('no longer offer an "at risk" tool; attention signals are offered by role', async () => {
    const student = await ctxFor((await createUser(A)).id);
    const teacher = await ctxFor(facultyUserId);
    const names = (u: Awaited<ReturnType<typeof ctxFor>>) => toolsForUser(u).map((x) => x.name);
    expect(names(student)).toContain('get_attention_signals');
    expect(names(teacher)).toContain('get_attention_signals');
    expect([...names(student), ...names(teacher)]).not.toContain('get_at_risk_students');
  });
});
