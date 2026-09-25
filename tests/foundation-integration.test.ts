import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import {
  authenticate,
  registerStudent,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  inviteUser,
  acceptInvite,
  decideRegistration,
  changePassword,
  REGISTRATION_ACCEPTED,
} from '@/services/auth/accounts';
import { consumeToken, issueToken } from '@/services/auth/tokens';
import { checkRateLimit } from '@/services/rate-limit';
import {
  updatePrivacyPreferences,
  getPrivacyPreferences,
  buildPersonalDataExport,
  requestDeletion,
  decideDeletionRequest,
} from '@/services/privacy';
import { uploadFile, authorizeFileRead, storeBytes } from '@/services/storage';
import { LocalStorageProvider, setStorageProvider } from '@/services/storage/providers';
import { planPendingNotifications, processDeliveryQueue } from '@/services/notifications/dispatcher';
import { setProviders } from '@/services/notifications/providers';
import { updateFeatureFlags } from '@/services/institution-settings';
import {
  createTenant,
  createUser,
  ctxFor,
  captureEmail,
  dropTenant,
  meta,
  TEST_PASSWORD,
  type TestTenant,
} from './helpers';

/**
 * CampusOS 2.0 Phase 1 — integration tests against real PostgreSQL.
 * Each run creates two throwaway colleges (A and B) and removes them after.
 */

let A: TestTenant;
let B: TestTenant;
let storageDir: string;
const mail = captureEmail();

beforeAll(async () => {
  A = await createTenant({ mode: 'EMAIL_DOMAIN', domains: ['kbi.edu.in'] });
  B = await createTenant({ mode: 'ADMIN_APPROVAL' });
  storageDir = await mkdtemp(path.join(os.tmpdir(), 'campusos-files-'));
  setStorageProvider(new LocalStorageProvider(storageDir));
});

afterAll(async () => {
  setStorageProvider(undefined);
  setProviders(null);
  await dropTenant(A.id);
  await dropTenant(B.id);
  await rm(storageDir, { recursive: true, force: true });
  await pool.end();
});

const reg = (tenant: TestTenant, over: Partial<Parameters<typeof registerStudent>[0]> = {}) =>
  registerStudent({
    institutionSlug: tenant.slug,
    firstName: 'Prakash',
    lastName: 'Raj',
    email: `prakash.${Math.random().toString(36).slice(2, 8)}@kbi.edu.in`,
    password: TEST_PASSWORD,
    departmentId: tenant.departmentId,
    programId: tenant.programId,
    sectionId: tenant.sectionId,
    year: 1,
    studentId: `KBI-${Math.random().toString(36).slice(2, 8)}`,
    meta: meta(),
    ...over,
  });

/* ------------------------------ registration ------------------------------ */

describe('student self-registration', () => {
  it('registers, requires email confirmation, then activates (domain mode)', async () => {
    const email = 'ananya.sen@kbi.edu.in';
    const r = await reg(A, { email });
    expect(r.message).toBe(REGISTRATION_ACCEPTED);

    const blocked = await authenticate({ email, password: TEST_PASSWORD, meta: meta() });
    expect(blocked).toMatchObject({ ok: false, code: 'EMAIL_NOT_VERIFIED' });

    const outcome = await verifyEmail({ token: mail.tokenFor(email), meta: meta() });
    expect(outcome).toBe('ACTIVE');

    const ok = await authenticate({ email, password: TEST_PASSWORD, meta: meta() });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.redirectTo).toBe('/student');

    const [profile] = await db
      .select({ year: t.studentProfiles.currentYear, section: t.studentProfiles.sectionId })
      .from(t.studentProfiles)
      .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
      .where(eq(t.users.email, email));
    expect(profile).toEqual({ year: 1, section: A.sectionId });
  });

  it('rejects addresses outside the college’s domains', async () => {
    await expect(reg(A, { email: 'someone@gmail.com' })).rejects.toMatchObject({ code: 'EMAIL_DOMAIN_NOT_ALLOWED' });
  });

  it('does not reveal whether an email is already registered', async () => {
    const email = 'dup@kbi.edu.in';
    await reg(A, { email });
    const again = await reg(A, { email, studentId: 'OTHER-1' });
    expect(again.message).toBe(REGISTRATION_ACCEPTED);
    const rows = await db.select().from(t.users).where(and(eq(t.users.institutionId, A.id), eq(t.users.email, email)));
    expect(rows).toHaveLength(1);
  });

  it('refuses a programme or section belonging to another college (tenant isolation)', async () => {
    await expect(reg(A, { programId: B.programId })).rejects.toMatchObject({ code: 'BAD_PROGRAM' });
    await expect(reg(A, { sectionId: B.sectionId })).rejects.toMatchObject({ code: 'BAD_SECTION' });
  });

  it('refuses colleges that have not opened registration', async () => {
    const closed = await createTenant({ mode: 'DISABLED' });
    try {
      await expect(reg(closed)).rejects.toMatchObject({ code: 'REGISTRATION_CLOSED' });
    } finally {
      await dropTenant(closed.id);
    }
  });

  it('holds approval-mode registrations until an administrator approves, and only verified ones', async () => {
    const email = `ria.${Date.now()}@example.com`;
    await reg(B, { email });
    const [pending] = await db.select().from(t.users).where(and(eq(t.users.institutionId, B.id), eq(t.users.email, email)));
    expect(pending!.status).toBe('PENDING');

    const admin = await ctxFor((await createUser(B, { role: 'ADMIN' })).id);
    await expect(decideRegistration(admin, { userId: pending!.id, approve: true, meta: meta() })).rejects.toMatchObject({ status: 409 });

    expect(await verifyEmail({ token: mail.tokenFor(email), meta: meta() })).toBe('AWAITING_APPROVAL');
    expect(await authenticate({ email, password: TEST_PASSWORD, meta: meta() })).toMatchObject({ code: 'REGISTRATION_PENDING' });

    // An admin of ANOTHER college cannot approve it.
    const otherAdmin = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    await expect(decideRegistration(otherAdmin, { userId: pending!.id, approve: true, meta: meta() })).rejects.toMatchObject({ status: 409 });

    await decideRegistration(admin, { userId: pending!.id, approve: true, meta: meta() });
    expect((await authenticate({ email, password: TEST_PASSWORD, meta: meta() })).ok).toBe(true);
  });
});

/* ------------------------------ sign-in guard ----------------------------- */

describe('sign-in protection', () => {
  it('answers identically for unknown accounts and wrong passwords', async () => {
    const user = await createUser(A);
    const wrong = await authenticate({ email: user.email, password: 'Wrong-password-1', meta: meta() });
    const missing = await authenticate({ email: 'nobody@nowhere.test', password: 'Wrong-password-1', meta: meta() });
    expect(wrong).toEqual(missing);
  });

  it('locks an account after repeated failures, and a reset clears the lock', async () => {
    const user = await createUser(A);
    for (let i = 0; i < 8; i++) await authenticate({ email: user.email, password: 'nope', meta: meta() });
    expect(await authenticate({ email: user.email, password: TEST_PASSWORD, meta: meta() })).toMatchObject({ code: 'ACCOUNT_LOCKED' });

    await requestPasswordReset({ email: user.email, meta: meta() });
    await resetPassword({ token: mail.tokenFor(user.email), password: 'Brand-New-Pass-42', meta: meta() });
    expect((await authenticate({ email: user.email, password: 'Brand-New-Pass-42', meta: meta() })).ok).toBe(true);
  });

  it('rate-limits sign-in attempts per IP', async () => {
    const ip = '203.0.113.77';
    let last;
    for (let i = 0; i < 31; i++) last = await authenticate({ email: `x${i}@nowhere.test`, password: 'x', meta: meta(ip) });
    expect(last).toMatchObject({ ok: false, status: 429, code: 'RATE_LIMITED' });
  });

  it('counts rate-limit windows atomically', async () => {
    const key = `test:${Date.now()}`;
    const rule = { limit: 5, windowSec: 60 };
    const results = await Promise.all(Array.from({ length: 12 }, () => checkRateLimit(key, rule)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});

/* ----------------------------- password reset ----------------------------- */

describe('password reset', () => {
  it('emails a single-use link, changes the password, and signs out every device', async () => {
    const user = await createUser(A);
    await db.insert(t.sessions).values({ userId: user.id, institutionId: A.id, tokenHash: `h-${user.id}`, expiresAt: new Date(Date.now() + 3600_000) });

    await requestPasswordReset({ email: user.email.toUpperCase(), meta: meta() });
    const token = mail.tokenFor(user.email);
    expect(mail.last()!.subject).toContain('Reset');

    await resetPassword({ token, password: 'Another-Good-Pass-7', meta: meta() });
    await expect(resetPassword({ token, password: 'Yet-Another-Pass-8', meta: meta() })).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

    const [after] = await db.select().from(t.users).where(eq(t.users.id, user.id));
    expect(after!.sessionEpoch).toBe(1);
    const live = await db.select().from(t.sessions).where(and(eq(t.sessions.userId, user.id), sql`revoked_at IS NULL`));
    expect(live).toHaveLength(0);
    // A "password changed" notice followed.
    expect(mail.last()!.subject).toContain('changed');
  });

  it('stores only a hash of the token', async () => {
    const user = await createUser(A);
    await requestPasswordReset({ email: user.email, meta: meta() });
    const raw = mail.tokenFor(user.email);
    const rows = await db.select().from(t.authTokens).where(eq(t.authTokens.userId, user.id));
    expect(rows.some((r) => r.tokenHash === raw)).toBe(false);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects expired tokens and supersedes older ones', async () => {
    const user = await createUser(A);
    const old = await issueToken({ institutionId: A.id, userId: user.id, purpose: 'PASSWORD_RESET', sentTo: user.email });
    const fresh = await issueToken({ institutionId: A.id, userId: user.id, purpose: 'PASSWORD_RESET', sentTo: user.email });
    expect(await consumeToken(old.raw, 'PASSWORD_RESET')).toBeNull();
    expect(await consumeToken(fresh.raw, 'EMAIL_VERIFY')).toBeNull(); // wrong purpose
    const expired = await issueToken({ institutionId: A.id, userId: user.id, purpose: 'PASSWORD_RESET', sentTo: user.email, ttlMinutes: 1, now: new Date(Date.now() - 5 * 60_000) });
    expect(await consumeToken(expired.raw, 'PASSWORD_RESET')).toBeNull();
  });

  it('does not reveal unknown accounts and sends nothing for them', async () => {
    const before = mail.sent.length;
    await requestPasswordReset({ email: 'ghost@nowhere.test', meta: meta() });
    expect(mail.sent.length).toBe(before);
  });

  it('change-password requires the current password and bumps the session epoch', async () => {
    const user = await createUser(A);
    const ctx = await ctxFor(user.id);
    await expect(changePassword(ctx, { currentPassword: 'wrong', newPassword: 'Fine-Secret-Key-99', meta: meta() })).rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });
    await expect(changePassword(ctx, { currentPassword: TEST_PASSWORD, newPassword: 'weak', meta: meta() })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    const { sessionEpoch } = await changePassword(ctx, { currentPassword: TEST_PASSWORD, newPassword: 'Fine-Secret-Key-99', meta: meta() });
    expect(sessionEpoch).toBe(1);
  });
});

/* ------------------------------- invitations ------------------------------ */

describe('invitations', () => {
  it('lets an administrator invite a student who then activates with a password', async () => {
    const admin = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    const email = `invitee.${Date.now()}@kbi.edu.in`;
    const { userId, emailSent } = await inviteUser(admin, {
      email, firstName: 'Riya', lastName: 'Das', role: 'STUDENT', programId: A.programId, sectionId: A.sectionId, year: 1, rollNumber: 'KBI-INV-1', meta: meta(),
    });
    expect(emailSent).toBe(true);
    const accepted = await acceptInvite({ token: mail.tokenFor(email), password: 'Invite-Pass-2026', meta: meta() });
    expect(accepted.id).toBe(userId);
    expect(accepted.redirectTo).toBe('/student');
    const [u] = await db.select().from(t.users).where(eq(t.users.id, userId));
    expect(u!.status).toBe('ACTIVE');
    expect(u!.emailVerifiedAt).not.toBeNull();
  });

  it('refuses to place an invitee in another college’s programme', async () => {
    const admin = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    await expect(
      inviteUser(admin, { email: 'x@kbi.edu.in', firstName: 'X', lastName: 'Y', role: 'STUDENT', programId: B.programId, rollNumber: 'R1', meta: meta() }),
    ).rejects.toMatchObject({ code: 'BAD_PROGRAM' });
  });

  it('stops ordinary administrators from creating staff accounts', async () => {
    const admin = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    await expect(
      inviteUser(admin, { email: 'boss@kbi.edu.in', firstName: 'B', lastName: 'C', role: 'SUPER_ADMIN', meta: meta() }),
    ).rejects.toMatchObject({ status: 403 });
    const student = await ctxFor((await createUser(A)).id);
    await expect(
      inviteUser(student, { email: 'friend@kbi.edu.in', firstName: 'F', lastName: 'G', role: 'STUDENT', programId: A.programId, rollNumber: 'R2', meta: meta() }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

/* -------------------------------- privacy --------------------------------- */

describe('privacy foundation', () => {
  it('records consent changes in an append-only ledger', async () => {
    const ctx = await ctxFor((await createUser(A)).id);
    await updatePrivacyPreferences(ctx, { leaderboardVisibility: 'ANONYMOUS', aiMemoryEnabled: true }, meta());
    const prefs = await getPrivacyPreferences(ctx);
    expect(prefs.leaderboardVisibility).toBe('ANONYMOUS');
    const consents = await db.select().from(t.consentRecords).where(eq(t.consentRecords.userId, ctx.userId));
    expect(consents.map((c) => c.purpose).sort()).toEqual(['ai_memory', 'leaderboard_participation']);
    await expect(db.execute(sql`UPDATE consent_records SET granted = false WHERE user_id = ${ctx.userId}`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM consent_records WHERE user_id = ${ctx.userId}`)).rejects.toThrow();
  });

  it('deletes remembered AI preferences when AI memory is switched off', async () => {
    const ctx = await ctxFor((await createUser(A)).id);
    await updatePrivacyPreferences(ctx, { aiMemoryEnabled: true }, meta());
    await db.insert(t.aiPreferences).values({ institutionId: A.id, userId: ctx.userId, key: 'study_time', value: 'evenings' });
    await updatePrivacyPreferences(ctx, { aiMemoryEnabled: false }, meta());
    expect(await db.select().from(t.aiPreferences).where(eq(t.aiPreferences.userId, ctx.userId))).toHaveLength(0);
  });

  it('exports only the caller’s own data and never the password hash', async () => {
    const me = await ctxFor((await createUser(A)).id);
    const classmate = await createUser(A);
    await db.insert(t.notifications).values([
      { institutionId: A.id, userId: me.userId, title: 'mine' },
      { institutionId: A.id, userId: classmate.id, title: 'theirs' },
    ]);
    const data = await buildPersonalDataExport(me);
    const text = JSON.stringify(data);
    expect(text).toContain('mine');
    expect(text).not.toContain('theirs');
    expect(text).not.toContain(classmate.id);
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('$2a$');
  });

  it('anonymises an approved account deletion but keeps academic records', async () => {
    const student = await createUser(A);
    const ctx = await ctxFor(student.id);
    const req = await requestDeletion(ctx, { scope: 'ACCOUNT', reason: 'Leaving college' }, meta());
    expect(req.status).toBe('PENDING');
    await expect(requestDeletion(ctx, { scope: 'ACCOUNT' }, meta())).rejects.toMatchObject({ status: 409 });

    const admin = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    await decideDeletionRequest(admin, { requestId: (req as { id: string }).id, approve: true }, meta());

    const [u] = await db.select().from(t.users).where(eq(t.users.id, student.id));
    expect(u!.firstName).toBe('Deleted');
    expect(u!.email).toContain('deleted.campusos.invalid');
    expect(u!.passwordHash).toBeNull();
    expect(u!.status).toBe('ARCHIVED');
    const profile = await db.select().from(t.studentProfiles).where(eq(t.studentProfiles.userId, student.id));
    expect(profile).toHaveLength(1); // academic record retained, anonymously
    expect(await authenticate({ email: student.email, password: TEST_PASSWORD, meta: meta() })).toMatchObject({ ok: false });
  });

  it('does not let administrators of another college decide a request', async () => {
    const ctx = await ctxFor((await createUser(A)).id);
    const req = (await requestDeletion(ctx, { scope: 'ACCOUNT' }, meta())) as { id: string };
    const foreign = await ctxFor((await createUser(B, { role: 'ADMIN' })).id);
    await expect(decideDeletionRequest(foreign, { requestId: req.id, approve: true }, meta())).rejects.toMatchObject({ status: 404 });
  });
});

/* -------------------------------- storage --------------------------------- */

const PDF = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...Buffer.from('lecture notes')]);

describe('file storage', () => {
  it('stores a validated upload and records metadata with an honest scan status', async () => {
    const faculty = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    const stored = await uploadFile(faculty, { name: 'Week 1.pdf', bytes: PDF, purpose: 'RESOURCE' });
    expect(stored.url).toBe(`/api/files/${stored.id}`);
    expect(stored.mimeType).toBe('application/pdf');
    expect(stored.scanStatus).toBe('NOT_SCANNED');
  });

  it('refuses disguised executables', async () => {
    const faculty = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    const exe = new Uint8Array([...Buffer.from('MZ'), ...new Uint8Array(20)]);
    await expect(uploadFile(faculty, { name: 'notes.pdf', bytes: exe, purpose: 'RESOURCE' })).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });

  it('never serves a file to another college, and serves exports only to their owner', async () => {
    const owner = await ctxFor((await createUser(A)).id);
    const classmate = await ctxFor((await createUser(A)).id);
    const foreign = await ctxFor((await createUser(B)).id);
    const exportFile = await storeBytes(owner, {
      purpose: 'DATA_EXPORT', name: 'export.json', mime: 'application/json', extension: 'json',
      bytes: Buffer.from('{}'), scanStatus: 'CLEAN',
    });
    await expect(authorizeFileRead(owner, exportFile.id)).resolves.toBeTruthy();
    await expect(authorizeFileRead(classmate, exportFile.id)).rejects.toMatchObject({ status: 404 });
    await expect(authorizeFileRead(foreign, exportFile.id)).rejects.toMatchObject({ status: 404 });
  });

  it('respects PRIVATE resource visibility', async () => {
    const faculty = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    const student = await ctxFor((await createUser(A)).id);
    const file = await uploadFile(faculty, { name: 'draft.pdf', bytes: PDF, purpose: 'RESOURCE' });
    await db.insert(t.resources).values({ institutionId: A.id, title: 'Draft', ownerId: faculty.userId, fileUrl: file.url, visibility: 'PRIVATE', status: 'PUBLISHED' });
    await expect(authorizeFileRead(faculty, file.id)).resolves.toBeTruthy();
    await expect(authorizeFileRead(student, file.id)).rejects.toMatchObject({ status: 404 });
  });
});

/* ---------------------------- notifications ------------------------------- */

describe('notification delivery', () => {
  it('plans external deliveries by priority and preference, once, and delivers them', async () => {
    const admin = await ctxFor((await createUser(A, { role: 'SUPER_ADMIN' })).id);
    await updateFeatureFlags(admin, { email_enabled: true }, meta());
    const student = await createUser(A);
    const muted = await createUser(A);
    await db.insert(t.notificationSettings).values({ institutionId: A.id, userId: muted.id, emailEnabled: false });

    const [n1, n2, n3] = await db
      .insert(t.notifications)
      .values([
        { institutionId: A.id, userId: student.id, title: 'Exam moved to Room B207', priority: 'CRITICAL', category: 'EXAMINATION' },
        { institutionId: A.id, userId: student.id, title: 'New badge', priority: 'INFORMATIONAL', category: 'GENERAL' },
        { institutionId: A.id, userId: muted.id, title: 'Deadline tomorrow', priority: 'IMPORTANT', category: 'ACADEMIC' },
      ])
      .returning();

    const plan = await planPendingNotifications();
    expect(plan.queued).toBeGreaterThanOrEqual(1);
    const again = await planPendingNotifications();
    expect(again.notifications).toBe(0); // idempotent

    const d1 = await db.select().from(t.notificationDeliveries).where(eq(t.notificationDeliveries.notificationId, n1!.id));
    expect(d1.find((d) => d.channel === 'EMAIL')?.status).toBe('QUEUED');
    expect(await db.select().from(t.notificationDeliveries).where(eq(t.notificationDeliveries.notificationId, n2!.id))).toHaveLength(0);
    const d3 = await db.select().from(t.notificationDeliveries).where(eq(t.notificationDeliveries.notificationId, n3!.id));
    expect(d3.find((d) => d.channel === 'EMAIL')).toMatchObject({ status: 'SKIPPED', reason: 'user_disabled_channel' });

    const before = mail.sent.length;
    const delivered = await processDeliveryQueue();
    expect(delivered.sent).toBeGreaterThanOrEqual(1);
    expect(mail.sent.slice(before).some((m) => m.to === student.email && m.subject.includes('Exam moved'))).toBe(true);
    const [row] = await db.select().from(t.notifications).where(eq(t.notifications.id, n1!.id));
    expect(row!.deliveredChannels).toContain('EMAIL');
  });

  it('never emails a college that has not enabled email', async () => {
    const student = await createUser(B);
    const [n] = await db.insert(t.notifications).values({ institutionId: B.id, userId: student.id, title: 'x', priority: 'CRITICAL' }).returning();
    await planPendingNotifications();
    const rows = await db.select().from(t.notificationDeliveries).where(eq(t.notificationDeliveries.notificationId, n!.id));
    expect(rows.filter((r) => r.status === 'QUEUED')).toHaveLength(0);
  });
});
