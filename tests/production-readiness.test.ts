import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { safeReturnPath } from '@/lib/utils';
import { clientIp } from '@/lib/http';
import { getEvent, getMyCertificate, registerForEvent, signPassToken, setSaved, listEvents } from '@/services/events';
import { checkIn, createEvent, getManagedEvent, issueCertificates, moderateEvent } from '@/services/events/organizer';
import { getLeaderboard, getProgress } from '@/services/gamification';
import { checkInGoal, createGoal, getTrackerOverview } from '@/services/tracker';
import { createBook, issueLoan, myLibrary, renewLoan, reserveBook, returnLoan, searchBooks } from '@/services/library';
import { askInConversation, getConversation } from '@/services/ai/conversations';
import { decideAction } from '@/services/ai/actions';
import { toolsForUser, executeTool } from '@/services/ai/tools';
import { __setAiProvider } from '@/services/ai/providers';
import { listForStudent, setCareerGoal, submitOpportunity, trackOpportunity } from '@/services/opportunities';
import { assignGrievance } from '@/services/grievance';
import { createAnnouncement, publishAnnouncement } from '@/services/communication';
import { resourceVisibilityFor } from '@/services/resources';
import { buildPersonalDataExport } from '@/services/privacy';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/**
 * PRODUCTION-READINESS SUITE
 * End-to-end journeys across modules, tenant isolation, role and flag checks —
 * all through the same services the API routes call.
 */

const ALL_ON = {
  events_enabled: true,
  event_discovery_enabled: true,
  personal_tracker_enabled: true,
  gamification_enabled: true,
  leaderboards_enabled: true,
  library_enabled: true,
  resource_hub_enabled: true,
  ai_assistant_enabled: true,
  opportunity_hub_enabled: true,
  skill_engine_enabled: true,
  grievance_enabled: true,
};

let A: TestTenant;
let B: TestTenant;

beforeAll(async () => {
  __setAiProvider(null);
  A = await createTenant();
  B = await createTenant();
  for (const id of [A.id, B.id]) await db.update(t.institutions).set({ featureFlags: ALL_ON }).where(eq(t.institutions.id, id));
});

afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

const stu = async (tenant: TestTenant = A) => {
  const u = await createUser(tenant);
  return { ctx: await ctxFor(u.id), email: u.email };
};
const admin = async (tenant: TestTenant = A) => ctxFor((await createUser(tenant, { role: 'ADMIN' })).id);

function eventInput(over: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 3 * 86_400_000);
  return {
    title: `Journey ${Math.random().toString(36).slice(2, 8)}`,
    category: 'WORKSHOP',
    visibility: 'INSTITUTION',
    mode: 'OFFLINE',
    startsAt: start,
    endsAt: new Date(start.getTime() + 2 * 3600_000),
    registrationRequired: true,
    registrationMode: 'INSTANT',
    waitlistEnabled: true,
    priceInr: 0,
    certificateOffered: true,
    teamSizeMin: 1,
    teamSizeMax: 1,
    ...over,
  } as Parameters<typeof createEvent>[1];
}

/* -------------------------------- journeys -------------------------------- */

describe('student journey: event → pass → check-in → certificate → XP → tracker → library → AI → career', () => {
  it('works end to end with real records', async () => {
    const desk = await admin();
    const { ctx: me, email } = await stu();

    // Event: register, pass, check-in at the desk, certificate.
    const { id: eventId } = await createEvent(desk, eventInput({ capacity: 10 }), meta());
    const reg = await registerForEvent(me, eventId);
    expect(reg.status).toBe('REGISTERED');
    const detail = await getEvent(me, eventId);
    const { token } = signPassToken(detail.registration!.id);
    expect((await checkIn(desk, eventId, { token })).status).toBe('CHECKED_IN');
    expect((await checkIn(desk, eventId, { token })).status).toBe('ALREADY_CHECKED_IN');
    expect((await issueCertificates(desk, eventId, {}, meta())).issued).toBe(1);
    const [cert] = await db.select({ id: t.eventCertificates.id }).from(t.eventCertificates).where(eq(t.eventCertificates.userId, me.userId));
    expect(await getMyCertificate(me, cert!.id)).toBeTruthy();

    // Gamification picked it up: verified XP for attendance and certificate.
    const progress = await getProgress(me);
    expect(progress.verifiedXp).toBe(65);

    // Tracker.
    const goal = await createGoal(me, { title: 'Revise accounts', category: 'STUDY', cadence: 'DAILY', targetPerPeriod: 1 });
    expect((await checkInGoal(me, goal.id, {})).xp).toBe(5);
    expect((await getTrackerOverview(me)).summary.activeGoals).toBe(1);

    // Library: reserve when out, issue, renew, return.
    const { id: bookId } = await createBook(desk, { title: 'Journey Book', totalCopies: 1 }, meta());
    const other = await stu();
    const first = await issueLoan(desk, { bookId, borrower: other.email }, meta());
    await reserveBook(me, bookId);
    await returnLoan(desk, first.id, {}, meta());
    const loan = await issueLoan(desk, { bookId, borrower: email }, meta());
    expect((await renewLoan(me, loan.id, meta())).renewals).toBe(1);
    await returnLoan(desk, loan.id, {}, meta());
    expect((await myLibrary(me)).loans[0]!.returnedAt).toBeTruthy();

    // AI: grounded answer, a proposal, confirmation executes and is audited.
    const turn = await askInConversation(me, 'Add a task to collect my certificate');
    expect(turn.actions[0]?.status).toBe('PROPOSED');
    const done = await decideAction(me, turn.actions[0]!.id, 'confirm', meta());
    expect(done.status).toBe('EXECUTED');
    const [audit] = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.entityId, done.id), eq(t.auditLogs.action, 'AI_ACTION_CONFIRMED')));
    expect(audit).toBeTruthy();

    // Career: listing → save → apply → tracker → goal.
    const opp = await submitOpportunity(desk, { kind: 'INTERNSHIP', title: 'Journey intern', organization: 'Test Org', workMode: 'REMOTE', skills: ['Excel'] }, meta());
    await trackOpportunity(me, opp.id, { status: 'SAVED' });
    await trackOpportunity(me, opp.id, { status: 'APPLIED' });
    expect((await listForStudent(me, { tracked: true }))[0]).toMatchObject({ id: opp.id, track: 'APPLIED' });
    const [role] = await db.insert(t.careerRoles).values({ institutionId: A.id, title: 'Analyst', slug: `an-${Date.now()}` } as typeof t.careerRoles.$inferInsert).returning();
    expect((await setCareerGoal(me, role!.id)).careerRoleId).toBe(role!.id);

    // Privacy: the export contains every module's data for this student.
    const exported = await buildPersonalDataExport(me);
    expect(exported.events.certificates.length).toBe(1);
    expect(exported.tracker.goals.length).toBe(1);
    expect(exported.library.loans.length).toBe(1);
    expect(exported.career.applications.length).toBe(1);
    expect(exported.ai.conversations.length).toBeGreaterThan(0);
  });
});

describe('organiser journey: create → approval → registration → capacity → waitlist → check-in → certificate', () => {
  it('holds a student event for approval and fills it honestly', async () => {
    const mod = await admin();
    const lead = (await stu()).ctx;
    const { id } = await createEvent(lead, eventInput({ capacity: 2, waitlistEnabled: true }), meta());
    const attendees = await Promise.all([1, 2, 3].map(async () => (await stu()).ctx));
    await expect(registerForEvent(attendees[0]!, id)).rejects.toThrow();
    await moderateEvent(mod, id, { action: 'APPROVE' }, meta());
    const results = await Promise.all(attendees.map((a) => registerForEvent(a, id)));
    expect(results.map((r) => r.status).sort()).toEqual(['REGISTERED', 'REGISTERED', 'WAITLISTED']);
    const managed = await getManagedEvent(lead, id);
    expect(managed.stats).toMatchObject({ registered: 2, waitlisted: 1 });
    const registered = managed.registrations.find((r) => r.status === 'REGISTERED')!;
    expect((await checkIn(lead, id, { code: registered.code! })).status).toBe('CHECKED_IN');
    expect((await issueCertificates(lead, id, {}, meta())).issued).toBe(1);
  });

  it('lets a check-in volunteer scan passes without managing the event', async () => {
    const mod = await admin();
    const { id } = await createEvent(mod, eventInput(), meta());
    const attendee = (await stu()).ctx;
    await registerForEvent(attendee, id);
    const volunteerUser = await createUser(A);
    await db.update(t.users).set({ secondaryRoles: ['EVENT_ORGANIZER'] }).where(eq(t.users.id, volunteerUser.id));
    const volunteer = await ctxFor(volunteerUser.id);
    const reg = (await getEvent(attendee, id)).registration!;
    expect((await checkIn(volunteer, id, { code: reg.code! })).status).toBe('CHECKED_IN');
    await expect(getManagedEvent(volunteer, id)).rejects.toThrow(/not found/i);
    await expect(issueCertificates(volunteer, id, {}, meta())).rejects.toThrow();
  });
});

/* ---------------------------- tenant isolation ---------------------------- */

describe('college A cannot reach college B', () => {
  it('events, certificates, library, applications, AI, tracker, leaderboards', async () => {
    const deskA = await admin(A);
    const { ctx: a } = await stu(A);
    const { ctx: b } = await stu(B);

    const { id: eventId } = await createEvent(deskA, eventInput(), meta());
    await registerForEvent(a, eventId);
    await expect(getEvent(b, eventId)).rejects.toThrow(/not found/i);
    await expect(registerForEvent(b, eventId)).rejects.toThrow(/not found/i);
    await expect(setSaved(b, eventId, true)).rejects.toThrow(/not found/i);
    expect((await listEvents(b)).map((e) => e.id)).not.toContain(eventId);

    const { token } = signPassToken((await getEvent(a, eventId)).registration!.id);
    await expect(checkIn(await admin(B), eventId, { token })).rejects.toThrow(/not found/i);

    const { id: bookId } = await createBook(deskA, { title: 'Isolation book', totalCopies: 1 }, meta());
    expect((await searchBooks(b, { q: 'Isolation book' })).length).toBe(0);
    await expect(reserveBook(b, bookId)).rejects.toThrow(/not found/i);

    const opp = await submitOpportunity(deskA, { kind: 'JOB', title: 'A-only', organization: 'X', workMode: 'ONSITE' }, meta());
    await expect(trackOpportunity(b, opp.id, { status: 'SAVED' })).rejects.toThrow(/not found/i);

    const turn = await askInConversation(a, 'What is due this week?');
    await expect(getConversation(b, turn.conversationId)).rejects.toThrow(/not found/i);
    await expect(decideAction(b, (await askInConversation(a, 'Add a task to test isolation')).actions[0]!.id, 'confirm', meta())).rejects.toThrow(/not found/i);

    const g = await createGoal(a, { title: 'A goal', category: 'STUDY', cadence: 'DAILY', targetPerPeriod: 1 });
    await expect(checkInGoal(b, g.id, {})).rejects.toThrow(/not found/i);

    await db.insert(t.privacyPreferences).values({ institutionId: A.id, userId: a.userId, leaderboardVisibility: 'PUBLIC' });
    expect(JSON.stringify(await getLeaderboard(b, 'college', 'all'))).not.toContain(a.userId);

    const [cert] = await db
      .insert(t.eventCertificates)
      .values({ institutionId: A.id, eventId, registrationId: (await getEvent(a, eventId)).registration!.id, userId: a.userId, verificationCode: `T${Date.now()}`.slice(0, 11), kind: 'PARTICIPATION', recipientName: 'A' } as typeof t.eventCertificates.$inferInsert)
      .returning({ id: t.eventCertificates.id });
    await expect(getMyCertificate(b, cert!.id)).rejects.toThrow();
  });

  it('notifications never cross colleges (grievance assignee, named notice recipient)', async () => {
    const adminA = await admin(A);
    const outsider = await createUser(B, { role: 'ADMIN' });
    const [cat] = await db.insert(t.grievanceCategories).values({ institutionId: A.id, name: 'General', slug: `g-${Date.now()}` } as typeof t.grievanceCategories.$inferInsert).returning();
    const [case1] = await db
      .insert(t.grievances)
      .values({ institutionId: A.id, caseNumber: `T-${Date.now()}`, categoryId: cat!.id, raisedById: (await stu(A)).ctx.userId, subject: 'Test', description: 'Test case', status: 'SUBMITTED' } as typeof t.grievances.$inferInsert)
      .returning();
    await expect(assignGrievance(adminA, case1!.id, outsider.id)).rejects.toThrow(/not found at your college/);
    const student = await createUser(A);
    await expect(assignGrievance(adminA, case1!.id, student.id)).rejects.toThrow(/staff who handle/);

    await expect(
      createAnnouncement(adminA, { title: 'Cross-college test', body: 'Should reach nobody outside A.', category: 'GENERAL', priority: 'NORMAL', kind: 'OFFICIAL', targets: [{ scope: 'USER', userId: outsider.id }] }),
    ).rejects.toThrow(/do not reach anyone/);
  });
});

/* --------------------------- roles, flags, AI ----------------------------- */

describe('roles and flags', () => {
  it('students cannot run staff actions', async () => {
    const { ctx: s } = await stu();
    await expect(createBook(s, { title: 'x', totalCopies: 1 }, meta())).rejects.toThrow(/library staff/);
    await expect(moderateEvent(s, '00000000-0000-4000-8000-000000000000', { action: 'APPROVE' }, meta())).rejects.toThrow();
    await expect(
      createAnnouncement(s, { title: 'Nope nope', body: 'Students cannot publish.', category: 'GENERAL', priority: 'NORMAL', kind: 'OFFICIAL', targets: [{ scope: 'INSTITUTION' }] }),
    ).rejects.toThrow();
  });

  it('only official publishers can send CRITICAL notices', async () => {
    const faculty = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    if (!faculty.permissions.has('announcement:create_official')) {
      await expect(
        createAnnouncement(faculty, { title: 'Urgent-ish', body: 'Trying critical priority.', category: 'GENERAL', priority: 'CRITICAL', kind: 'INFORMATIONAL', targets: [{ scope: 'INSTITUTION' }] }),
      ).rejects.toThrow(/critical/);
    }
  });

  it('switched-off modules refuse services and AI tools', async () => {
    const { ctx } = await stu();
    const off = { ...ctx, featureFlags: { ai_assistant_enabled: true, resource_hub_enabled: false, skill_engine_enabled: false, grievance_enabled: false } };
    await expect(getTrackerOverview(off)).rejects.toThrow(/switched off/);
    await expect(searchBooks(off, {})).rejects.toThrow(/not switched on/);
    await expect(listForStudent(off)).rejects.toThrow(/not switched on/);
    const names = toolsForUser(off).map((x) => x.name);
    for (const n of ['search_resources', 'get_skill_profile', 'get_grievances', 'propose_task', 'propose_library_renewal']) expect(names).not.toContain(n);
    expect((await executeTool('search_resources', { query: 'x' }, { user: off })).isError).toBe(true);
  });
});

/* --------------------------- notices & resources -------------------------- */

describe('scheduled notices are delivered when published', () => {
  it('resolves the audience at publish time and notifies each recipient once', async () => {
    const a = await admin();
    const r = await createAnnouncement(a, {
      title: 'Scheduled notice',
      body: 'This goes out later, to everyone.',
      category: 'GENERAL',
      priority: 'NORMAL',
      kind: 'OFFICIAL',
      publishAt: new Date(Date.now() + 3600_000),
      targets: [{ scope: 'INSTITUTION' }],
    });
    expect(r.status).toBe('SCHEDULED');
    const late = await stu(); // joined after scheduling
    const delivered = await publishAnnouncement(r.id, A.id);
    expect(delivered).toBeGreaterThan(0);
    const n = await db.select().from(t.notifications).where(and(eq(t.notifications.userId, late.ctx.userId), eq(t.notifications.sourceId, r.id)));
    expect(n).toHaveLength(1);
    expect(n[0]!.actionUrl).toBe(`/announcements/${r.id}`);
    expect(await publishAnnouncement(r.id, A.id)).toBe(0); // already published
    expect(await publishAnnouncement(r.id, B.id)).toBe(0); // wrong college
  });
});

describe('resource visibility for staff', () => {
  it('staff never see private or draft material; department-only staff stay in their department', async () => {
    const owner = await createUser(A, { role: 'FACULTY' });
    const [otherDept] = await db.insert(t.departments).values({ institutionId: A.id, name: 'Other', code: `OT${Date.now() % 10000}` }).returning();
    const rows = await db
      .insert(t.resources)
      .values([
        { institutionId: A.id, ownerId: owner.id, title: 'Private note', kind: 'NOTES', visibility: 'PRIVATE', status: 'PUBLISHED' },
        { institutionId: A.id, ownerId: owner.id, title: 'Other dept', kind: 'NOTES', visibility: 'DEPARTMENT', departmentId: otherDept!.id, status: 'PUBLISHED' },
        { institutionId: A.id, ownerId: owner.id, title: 'Everyone', kind: 'NOTES', visibility: 'INSTITUTION', status: 'PUBLISHED' },
      ] as (typeof t.resources.$inferInsert)[])
      .returning({ id: t.resources.id, title: t.resources.title });
    const titlesFor = async (c: Awaited<ReturnType<typeof ctxFor>>) =>
      (await db.select({ title: t.resources.title }).from(t.resources).where(and(resourceVisibilityFor(c)))).map((x) => x.title);
    // Faculty hold resource:view_institution: every published, non-private item.
    const faculty = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    const f = await titlesFor(faculty);
    expect(f).toEqual(expect.arrayContaining(['Everyone', 'Other dept']));
    expect(f).not.toContain('Private note');
    // A staff member with only department-level access.
    const narrow = { ...faculty, permissions: new Set(['resource:view_department']) as typeof faculty.permissions };
    const n = await titlesFor(narrow);
    expect(n).toContain('Everyone');
    expect(n).not.toContain('Other dept');
    expect(n).not.toContain('Private note');
    expect(rows).toHaveLength(3);
  });
});

/* ------------------------------ web hardening ----------------------------- */

describe('web hardening', () => {
  it('post-login redirects stay on this site', () => {
    expect(safeReturnPath('/student/events?x=1')).toBe('/student/events?x=1');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', '/%5Cevil', '\\evil', '/\u0000x', '']) {
      const r = safeReturnPath(bad);
      expect(r === null || r.startsWith('/%5C')).toBe(true);
    }
    expect(safeReturnPath('/\\evil.com')).toBeNull();
  });
  it('client IP comes from the trusted right-hand hop', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' });
    expect(clientIp(h)).toBe('203.0.113.9');
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(clientIp(h)).toBe('6.6.6.6');
    delete process.env.TRUSTED_PROXY_HOPS;
  });
});
