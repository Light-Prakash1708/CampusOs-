import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { authenticate, registerIndependentStudent } from '@/services/auth/accounts';
import {
  createMembershipRequest,
  decideMembershipRequest,
  expireStaleMembershipRequests,
  getMyMembership,
  listMembershipRequests,
  readVerificationDocument,
  sanitizeNote,
  searchJoinableInstitutions,
  startReview,
  TRANSFER_KEEP_TABLES,
  TRANSFER_MOVE_TABLES,
  withdrawMembershipRequest,
} from '@/services/membership';
import { authorizeFileRead, uploadFile } from '@/services/storage';
import { LocalStorageProvider, setStorageProvider } from '@/services/storage/providers';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/**
 * Verified membership: a self-registered student asks a college to take them
 * in, with a synthetic college ID; reviewers decide; approval moves the SAME
 * account into the college. No real documents are used.
 */

// A valid 1×1 PNG — synthetic, no personal data.
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const PASSWORD = 'Independent2026x';

let college: TestTenant;
let otherCollege: TestTenant;
let closedCollege: TestTenant;
let storageDir: string;
const personalWorkspaces: string[] = [];

async function personalStudent(tag: string) {
  vi.stubEnv('SELF_REGISTRATION_ENABLED', 'true');
  const email = `${tag}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await registerIndependentStudent({ firstName: 'Priya', lastName: tag, email, password: PASSWORD, meta: meta() });
  personalWorkspaces.push(res.user.institutionId);
  return { ctx: await ctxFor(res.user.id), email, userId: res.user.id, personalId: res.user.institutionId };
}

async function uploadId(ctx: Awaited<ReturnType<typeof ctxFor>>) {
  const f = await uploadFile(ctx, { name: 'college-id.png', bytes: PNG, purpose: 'VERIFICATION_ID', meta: meta() });
  return f.id;
}

function request(overrides: Partial<Parameters<typeof createMembershipRequest>[1]> = {}) {
  return {
    institutionSlug: college.slug,
    departmentId: college.departmentId,
    programId: college.programId,
    sectionId: college.sectionId,
    year: 1,
    rollNumber: `BBA-${Math.random().toString(36).slice(2, 7)}`,
    meta: meta(),
    ...overrides,
  };
}

beforeAll(async () => {
  college = await createTenant({ mode: 'ADMIN_APPROVAL', domains: ['demo.edu'] });
  otherCollege = await createTenant({ mode: 'ADMIN_APPROVAL' });
  closedCollege = await createTenant({ mode: 'DISABLED' });
  storageDir = await mkdtemp(path.join(os.tmpdir(), 'campusos-ids-'));
  setStorageProvider(new LocalStorageProvider(storageDir));
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  setStorageProvider(undefined);
  await rm(storageDir, { recursive: true, force: true });
  for (const id of personalWorkspaces) await dropTenant(id);
  for (const c of [college, otherCollege, closedCollege]) await dropTenant(c.id);
  await pool.end();
});

describe('every tenant table has a transfer decision', () => {
  it('classifies each table with institution_id as MOVE or KEEP, never both', async () => {
    const res = await db.execute<{ table_name: string }>(sql`
      SELECT DISTINCT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'institution_id'`);
    const tables = res.rows.map((r) => r.table_name).sort();
    const move = new Set<string>(TRANSFER_MOVE_TABLES);
    const keep = new Set<string>(TRANSFER_KEEP_TABLES);
    expect(tables.filter((tb) => !move.has(tb) && !keep.has(tb))).toEqual([]);
    expect([...move].filter((tb) => keep.has(tb))).toEqual([]);
  });
});

describe('asking to join', () => {
  it('lists only real colleges that accept requests', async () => {
    const found = await searchJoinableInstitutions('');
    const slugs = found.map((f) => f.slug);
    expect(slugs).toContain(college.slug);
    expect(slugs).not.toContain(closedCollege.slug);
    expect(slugs.some((s) => s.startsWith('personal-'))).toBe(false);
  });

  it('records a request with signals, one open request at a time', async () => {
    const s = await personalStudent('asks');
    const fileId = await uploadId(s.ctx);
    const res = await createMembershipRequest(s.ctx, request({ documentFileId: fileId }));
    expect(res.status).toBe('PENDING');
    const [row] = await db.select().from(t.membershipRequests).where(eq(t.membershipRequests.id, res.id));
    expect(row).toMatchObject({ institutionId: college.id, fromInstitutionId: s.personalId, emailDomainMatch: false, documentFileId: fileId });
    expect(row!.signals).toMatchObject({ documentAttached: true, documentType: 'image/png', rollNumberAlreadyRegistered: false });
    await expect(createMembershipRequest(s.ctx, request({ institutionSlug: otherCollege.slug, departmentId: otherCollege.departmentId, programId: otherCollege.programId, sectionId: null }))).rejects.toMatchObject({ status: 409 });

    const mine = await getMyMembership(s.ctx);
    expect(mine.kind).toBe('PERSONAL');
    expect(mine.request?.status).toBe('PENDING');
    expect(mine.request?.rollNumberMasked).toMatch(/^••••/);
  });

  it('refuses closed colleges, foreign placements, other people’s files and missing required IDs', async () => {
    const s = await personalStudent('refused');
    await expect(createMembershipRequest(s.ctx, request({ institutionSlug: closedCollege.slug }))).rejects.toMatchObject({ code: 'JOIN_CLOSED' });
    await expect(createMembershipRequest(s.ctx, request({ programId: otherCollege.programId, departmentId: otherCollege.departmentId }))).rejects.toMatchObject({ code: 'BAD_PROGRAM' });
    await expect(createMembershipRequest(s.ctx, request({ sectionId: otherCollege.sectionId }))).rejects.toMatchObject({ code: 'BAD_SECTION' });

    const stranger = await personalStudent('stranger');
    const strangersFile = await uploadId(stranger.ctx);
    await expect(createMembershipRequest(s.ctx, request({ documentFileId: strangersFile }))).rejects.toMatchObject({ code: 'BAD_DOCUMENT' });

    await db
      .update(t.institutions)
      .set({ registrationPolicy: { mode: 'ADMIN_APPROVAL', allowedDomains: [], idDocument: 'REQUIRED' } })
      .where(eq(t.institutions.id, otherCollege.id));
    await expect(
      createMembershipRequest(s.ctx, request({ institutionSlug: otherCollege.slug, departmentId: otherCollege.departmentId, programId: otherCollege.programId, sectionId: null })),
    ).rejects.toMatchObject({ code: 'DOCUMENT_REQUIRED' });

    // College students can't use this path.
    const member = await ctxFor((await createUser(college, { role: 'STUDENT' })).id);
    await expect(createMembershipRequest(member, request())).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
  });

  it('rejects executables disguised as an ID', async () => {
    const s = await personalStudent('exe');
    const exe = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    await expect(uploadFile(s.ctx, { name: 'college-id.png', bytes: exe, purpose: 'VERIFICATION_ID', meta: meta() })).rejects.toMatchObject({ status: 422 });
  });
});

describe('who can see a college ID', () => {
  it('the student and reviewers of that college (audited) — nobody else', async () => {
    const s = await personalStudent('privacy');
    const fileId = await uploadId(s.ctx);
    const req = await createMembershipRequest(s.ctx, request({ documentFileId: fileId }));
    const reviewer = await ctxFor((await createUser(college, { role: 'ADMIN' })).id);
    const foreignReviewer = await ctxFor((await createUser(otherCollege, { role: 'ADMIN' })).id);
    const faculty = await ctxFor((await createUser(college, { role: 'FACULTY' })).id);
    const otherStudent = (await personalStudent('nosy')).ctx;

    expect((await readVerificationDocument(s.ctx, req.id)).kind).toBe('bytes');
    expect((await readVerificationDocument(reviewer, req.id)).kind).toBe('bytes');
    for (const who of [foreignReviewer, faculty, otherStudent]) {
      await expect(readVerificationDocument(who, req.id)).rejects.toMatchObject({ status: 404 });
    }
    // The generic file route never serves it to anyone but the owner.
    await expect(authorizeFileRead(reviewer, fileId)).rejects.toMatchObject({ status: 404 });
    await expect(authorizeFileRead(otherStudent, fileId)).rejects.toMatchObject({ status: 404 });
    expect((await authorizeFileRead(s.ctx, fileId)).id).toBe(fileId);

    const views = await db
      .select()
      .from(t.auditLogs)
      .where(and(eq(t.auditLogs.entityId, req.id), eq(t.auditLogs.action, 'VERIFICATION_DOCUMENT_VIEWED')));
    expect(views).toHaveLength(1);
    expect(JSON.stringify(views)).not.toMatch(/storage|token|http/i);
  });
});

describe('reviewing', () => {
  it('only reviewers of the college can list and decide', async () => {
    const s = await personalStudent('queue');
    const req = await createMembershipRequest(s.ctx, request());
    const faculty = await ctxFor((await createUser(college, { role: 'FACULTY' })).id);
    await expect(listMembershipRequests(faculty, {})).rejects.toMatchObject({ status: 403 });
    await expect(decideMembershipRequest(faculty, req.id, { decision: 'APPROVE' }, meta())).rejects.toMatchObject({ status: 403 });
    const foreign = await ctxFor((await createUser(otherCollege, { role: 'ADMIN' })).id);
    await expect(decideMembershipRequest(foreign, req.id, { decision: 'APPROVE' }, meta())).rejects.toMatchObject({ status: 404 });
    // A student can't approve anything, including their own request.
    await expect(decideMembershipRequest(s.ctx, req.id, { decision: 'APPROVE' }, meta())).rejects.toMatchObject({ status: 403 });

    const reviewer = await ctxFor((await createUser(college, { role: 'ADMIN' })).id);
    const list = await listMembershipRequests(reviewer, { status: 'OPEN' });
    expect(list.rows.some((r) => r.id === req.id)).toBe(true);
    expect((await listMembershipRequests(foreign, { status: 'OPEN' })).rows.some((r) => r.id === req.id)).toBe(false);
    expect(await startReview(reviewer, req.id, meta())).toEqual({ started: true });
    expect(await startReview(reviewer, req.id, meta())).toEqual({ started: false });
    await withdrawMembershipRequest(s.ctx, req.id, meta());
  });

  it('rejects with a reason and a sanitised note; the student can resubmit', async () => {
    const s = await personalStudent('rejected');
    const req = await createMembershipRequest(s.ctx, request());
    const reviewer = await ctxFor((await createUser(college, { role: 'ADMIN' })).id);
    await decideMembershipRequest(reviewer, req.id, { decision: 'REJECT', reason: 'ID_UNCLEAR', note: 'Please\u0000 re-upload‮  a clearer\n\nphoto' }, meta());
    const mine = await getMyMembership(s.ctx);
    expect(mine.request).toMatchObject({ status: 'REJECTED', decisionReason: 'ID_UNCLEAR', decisionNote: 'Please re-upload a clearer photo' });
    expect(mine.request?.reasonText).toMatch(/clear/);
    const [u] = await db.select().from(t.users).where(eq(t.users.id, s.userId));
    expect(u!.institutionId).toBe(s.personalId); // account untouched
    await expect(decideMembershipRequest(reviewer, req.id, { decision: 'APPROVE' }, meta())).rejects.toMatchObject({ status: 409 });
    const again = await createMembershipRequest(s.ctx, request());
    expect(again.status).toBe('PENDING');
    expect(sanitizeNote('x'.repeat(500))).toHaveLength(300);
  });

  it('approval moves the same account into the college, with its data, exactly once', async () => {
    const s = await personalStudent('approved');
    // Personal data that must survive the move.
    await db.insert(t.trackerTasks).values({ institutionId: s.personalId, userId: s.userId, title: 'Finish FM notes' });
    await db.insert(t.notifications).values({ institutionId: s.personalId, userId: s.userId, title: 'Personal reminder' });
    const fileId = await uploadId(s.ctx);
    const roll = `BBA-OK-${Date.now()}`;
    const req = await createMembershipRequest(s.ctx, request({ documentFileId: fileId, rollNumber: roll }));
    const [before] = await db.select().from(t.users).where(eq(t.users.id, s.userId));

    const r1 = await ctxFor((await createUser(college, { role: 'ADMIN' })).id);
    const r2 = await ctxFor((await createUser(college, { role: 'SUPER_ADMIN' })).id);
    const results = await Promise.allSettled([
      decideMembershipRequest(r1, req.id, { decision: 'APPROVE' }, meta()),
      decideMembershipRequest(r2, req.id, { decision: 'APPROVE' }, meta()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 409 });

    const [after] = await db.select().from(t.users).where(eq(t.users.id, s.userId));
    expect(after).toMatchObject({ id: s.userId, institutionId: college.id, role: 'STUDENT', email: s.email, passwordHash: before!.passwordHash });
    expect(after!.sessionEpoch).toBe(before!.sessionEpoch + 1);
    const accounts = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, s.email));
    expect(accounts).toHaveLength(1);

    const [profile] = await db.select().from(t.studentProfiles).where(eq(t.studentProfiles.userId, s.userId));
    expect(profile).toMatchObject({ institutionId: college.id, programId: college.programId, sectionId: college.sectionId, rollNumber: roll.toUpperCase(), currentYear: 1 });

    const tasks = await db.select().from(t.trackerTasks).where(eq(t.trackerTasks.userId, s.userId));
    expect(tasks.map((x) => x.institutionId)).toEqual([college.id]);
    const notes = await db.select().from(t.notifications).where(eq(t.notifications.userId, s.userId));
    expect(notes.every((n) => n.institutionId === college.id)).toBe(true);
    expect(notes.some((n) => n.title === 'Personal reminder')).toBe(true);
    const [file] = await db.select().from(t.storedFiles).where(eq(t.storedFiles.id, fileId));
    expect(file!.institutionId).toBe(college.id);

    const [ws] = await db.select().from(t.institutions).where(eq(t.institutions.id, s.personalId));
    expect(ws!.isActive).toBe(false);

    // Signs in to the college with the same password; the ID is no longer open to reviewers.
    const login = await authenticate({ email: s.email, password: PASSWORD, meta: meta() });
    expect(login.ok && login.user.institutionId).toBe(college.id);
    const now = await ctxFor(s.userId);
    expect((await getMyMembership(now)).verified).toBe(true);
    await expect(readVerificationDocument(r1, req.id)).rejects.toMatchObject({ status: 404 });

    const audit = await db
      .select({ action: t.auditLogs.action, institutionId: t.auditLogs.institutionId })
      .from(t.auditLogs)
      .where(and(eq(t.auditLogs.entityId, req.id), inArray(t.auditLogs.action, ['MEMBERSHIP_APPROVED'])));
    expect(audit.map((a) => a.institutionId).sort()).toEqual([college.id, s.personalId].sort());
  });

  it('refuses to create a second account when the college already invited the same email', async () => {
    const s = await personalStudent('dup');
    await db.insert(t.users).values({ institutionId: college.id, email: s.email, firstName: 'P', lastName: 'Dup', role: 'STUDENT', status: 'INVITED' });
    const req = await createMembershipRequest(s.ctx, request());
    const [row] = await db.select().from(t.membershipRequests).where(eq(t.membershipRequests.id, req.id));
    expect(row!.signals).toMatchObject({ collegeAccountWithSameEmail: 'INVITED' });
    const reviewer = await ctxFor((await createUser(college, { role: 'ADMIN' })).id);
    await expect(decideMembershipRequest(reviewer, req.id, { decision: 'APPROVE' }, meta())).rejects.toMatchObject({ status: 409 });
    const [u] = await db.select().from(t.users).where(eq(t.users.id, s.userId));
    expect(u!.institutionId).toBe(s.personalId); // rolled back cleanly
  });

  it('expires requests nobody decided', async () => {
    const s = await personalStudent('stale');
    const req = await createMembershipRequest(s.ctx, request());
    await db.update(t.membershipRequests).set({ createdAt: new Date(Date.now() - 40 * 86_400_000) }).where(eq(t.membershipRequests.id, req.id));
    expect(await expireStaleMembershipRequests()).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(t.membershipRequests).where(eq(t.membershipRequests.id, req.id));
    expect(row!.status).toBe('EXPIRED');
  });
});
