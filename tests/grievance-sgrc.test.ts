import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { appealGrievance, createGrievance, getGrievance, transitionGrievance } from '@/services/grievance';
import { addCommitteeMember, addWorkingDays, attestComposition, committeeStatus, removeCommitteeMember } from '@/services/grievance-committee';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/**
 * CAMPUSOS-011: an SGRC/Ombudsperson workflow that supports the UGC 2023
 * timelines — without storing anyone's gender or social category.
 */

let A: TestTenant;
let B: TestTenant;
let categoryId: string;

beforeAll(async () => {
  A = await createTenant();
  B = await createTenant();
  await db.update(t.institutions).set({ featureFlags: { grievance_enabled: true } }).where(eq(t.institutions.id, A.id));
  const [c] = await db
    .insert(t.grievanceCategories)
    .values({ institutionId: A.id, name: 'Academic', slug: `academic-${Date.now()}`, availableToRoles: ['STUDENT'], responseSlaHours: 24, resolutionSlaHours: 72 })
    .returning();
  categoryId = c!.id;
});
afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

describe('working days', () => {
  it('skip Sundays and the college’s holidays', async () => {
    // Monday 5 Oct 2026, 10:00 IST.
    const start = new Date('2026-10-05T04:30:00Z');
    await db.insert(t.holidays).values({ institutionId: A.id, name: 'Test holiday', date: '2026-10-07' });
    const due = await addWorkingDays(A.id, start, 15);
    // 15 working days from Mon 5 Oct, skipping 7 Oct (holiday) and Sundays 11 and 18 Oct → Fri 23 Oct.
    expect(new Date(due.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10)).toBe('2026-10-23');
  });
});

describe('committee', () => {
  it('is configured by grievance administrators, in their own college, with sensible positions', async () => {
    const admin = await ctxFor((await createUser(A, { role: 'SUPER_ADMIN' })).id);
    const prof = await createUser(A, { role: 'FACULTY' });
    const student = await createUser(A, { role: 'STUDENT' });
    await addCommitteeMember(admin, { userId: prof.id, body: 'SGRC', position: 'CHAIR' }, meta());
    await expect(addCommitteeMember(admin, { userId: (await createUser(A, { role: 'FACULTY' })).id, body: 'SGRC', position: 'CHAIR' }, meta())).rejects.toMatchObject({ code: 'CHAIR_EXISTS' });
    await expect(addCommitteeMember(admin, { userId: prof.id, body: 'SGRC', position: 'STUDENT_INVITEE' }, meta())).rejects.toMatchObject({ code: 'NOT_A_STUDENT' });
    await expect(addCommitteeMember(admin, { userId: student.id, body: 'SGRC', position: 'MEMBER' }, meta())).rejects.toMatchObject({ code: 'NOT_FACULTY' });
    await expect(addCommitteeMember(admin, { userId: prof.id, body: 'OMBUDSPERSON', position: 'MEMBER' }, meta())).rejects.toMatchObject({ code: 'BAD_POSITION' });
    const foreign = await createUser(B, { role: 'FACULTY' });
    await expect(addCommitteeMember(admin, { userId: foreign.id, body: 'SGRC', position: 'MEMBER' }, meta())).rejects.toMatchObject({ status: 404 });
    const teacher = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    await expect(addCommitteeMember(teacher, { userId: prof.id, body: 'SGRC', position: 'MEMBER' }, meta())).rejects.toMatchObject({ status: 403 });

    let status = await committeeStatus(admin);
    expect(status.checks.find((c) => c.key === 'chair')?.done).toBe(true);
    expect(status.checks.find((c) => c.key === 'attested')?.done).toBe(false);
    await attestComposition(admin, meta());
    status = await committeeStatus(admin);
    expect(status.attestedAt).toBeTruthy();

    // Nothing about gender or category is stored anywhere in the committee rows.
    const [row] = await db.select().from(t.grievanceCommitteeMembers).where(eq(t.grievanceCommitteeMembers.userId, prof.id));
    expect(Object.keys(row!).sort()).toEqual(['body', 'createdAt', 'createdById', 'id', 'institutionId', 'position', 'termEndsOn', 'userId']);
    const [m] = await db.select({ id: t.grievanceCommitteeMembers.id }).from(t.grievanceCommitteeMembers).where(eq(t.grievanceCommitteeMembers.userId, prof.id));
    await removeCommitteeMember(admin, m!.id, meta());
  });
});

describe('appeal to the Ombudsperson', () => {
  it('records the statutory date, lets the raiser appeal once within 15 days, and only the Ombudsperson decides', async () => {
    const admin = await ctxFor((await createUser(A, { role: 'SUPER_ADMIN' })).id);
    const ombudsUser = await createUser(A, { role: 'MANAGEMENT' });
    await addCommitteeMember(admin, { userId: ombudsUser.id, body: 'OMBUDSPERSON', position: 'OMBUDSPERSON' }, meta());
    const student = await ctxFor((await createUser(A, { role: 'STUDENT' })).id);
    const g = await createGrievance(student, { categoryId, subject: 'Marks not updated', description: 'My internal marks are missing.' });

    const [row] = await db.select().from(t.grievances).where(eq(t.grievances.id, g.id));
    expect(row!.statutoryDueAt!.getTime()).toBeGreaterThan(row!.createdAt.getTime() + 14 * 86_400_000);

    await expect(appealGrievance(student, g.id, { reason: 'Nothing has happened yet at all.' })).rejects.toMatchObject({ code: 'APPEAL_NOT_ALLOWED' });
    await transitionGrievance(admin, g.id, { to: 'ACKNOWLEDGED' });
    await transitionGrievance(admin, g.id, { to: 'UNDER_REVIEW' });
    await transitionGrievance(admin, g.id, { to: 'RESOLVED', resolutionSummary: 'Marks will be updated next term.' });

    const other = await ctxFor((await createUser(A, { role: 'STUDENT' })).id);
    await expect(appealGrievance(other, g.id, { reason: 'I want to appeal someone else’s case.' })).rejects.toMatchObject({ status: 403 });

    const res = await appealGrievance(student, g.id, { reason: 'The marks are needed for my scholarship now.' });
    expect(res.ombudspersonDueAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    await expect(appealGrievance(student, g.id, { reason: 'Appealing a second time please.' })).rejects.toMatchObject({ code: 'APPEAL_NOT_ALLOWED' });

    // The Ombudsperson was notified and can open the case without redressal permissions.
    const notes = await db.select().from(t.notifications).where(and(eq(t.notifications.userId, ombudsUser.id), eq(t.notifications.sourceId, g.id)));
    expect(notes).toHaveLength(1);
    const ombuds = await ctxFor(ombudsUser.id);
    const seen = await getGrievance(ombuds, g.id);
    expect(seen.status).toBe('APPEALED');
    expect(seen.allowedTransitions).toEqual(['RESOLVED', 'CLOSED']);

    // Handlers can no longer decide it; the Ombudsperson can.
    await expect(transitionGrievance(admin, g.id, { to: 'CLOSED' })).rejects.toMatchObject({ status: 403 });
    await transitionGrievance(ombuds, g.id, { to: 'RESOLVED', resolutionSummary: 'Marks updated this week.' });
    const [done] = await db.select().from(t.grievances).where(eq(t.grievances.id, g.id));
    expect(done!.status).toBe('RESOLVED');
    // The appeal is recorded in the immutable timeline.
    const events = await db.select().from(t.grievanceEvents).where(and(eq(t.grievanceEvents.grievanceId, g.id), eq(t.grievanceEvents.kind, 'APPEALED')));
    expect(events).toHaveLength(1);
  });

  it('closes the appeal window after 15 days', async () => {
    const admin = await ctxFor((await createUser(A, { role: 'SUPER_ADMIN' })).id);
    const student = await ctxFor((await createUser(A, { role: 'STUDENT' })).id);
    const g = await createGrievance(student, { categoryId, subject: 'Old case', description: 'Decided long ago.' });
    await transitionGrievance(admin, g.id, { to: 'ACKNOWLEDGED' });
    await transitionGrievance(admin, g.id, { to: 'UNDER_REVIEW' });
    await transitionGrievance(admin, g.id, { to: 'RESOLVED' });
    await db.update(t.grievances).set({ resolvedAt: new Date(Date.now() - 16 * 86_400_000) }).where(eq(t.grievances.id, g.id));
    await expect(appealGrievance(student, g.id, { reason: 'Too late but trying anyway.' })).rejects.toMatchObject({ code: 'APPEAL_NOT_ALLOWED' });
    expect((await getGrievance(student, g.id)).canAppeal).toBe(false);
  });
});
