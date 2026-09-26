import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { acceptInvite, authenticate, inviteUser, revokeInvite, setUserAccess } from '@/services/auth/accounts';
import { createInstitution, getSetupProgress, isPlatformOperator, markSetupComplete, type NewInstitutionInput } from '@/services/institutions';
import { setProviders } from '@/services/notifications/providers';
import { createTenant, createUser, ctxFor, dropTenant, meta, TEST_PASSWORD, type TestTenant } from './helpers';

/**
 * Institution onboarding: platform operators create colleges and invite the
 * first administrator; administrators manage invitations and access.
 * Email is "not configured" here, so invitation links come back to the inviter.
 */

let hq: TestTenant;
let other: TestTenant;
const created: string[] = [];

function tokenFrom(url: string) {
  return new URL(url).searchParams.get('token')!;
}

function newCollege(overrides: Partial<NewInstitutionInput> = {}): NewInstitutionInput {
  const slug = `pilot-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: 'CampusOS Demo College',
    shortName: 'CDC',
    slug,
    institutionType: 'College',
    website: 'https://demo.example.edu',
    officialDomain: 'demo.example.edu',
    city: 'Kolkata',
    state: 'West Bengal',
    country: 'India',
    timezone: 'Asia/Kolkata',
    joinPolicy: 'ADMIN_APPROVAL',
    idDocument: 'OPTIONAL',
    listed: true,
    modules: ['events_enabled', 'library_enabled'],
    admin: { firstName: 'Asha', lastName: 'Admin', email: `admin-${slug}@demo.example.edu` },
    meta: meta(),
    ...overrides,
  };
}

beforeAll(async () => {
  hq = await createTenant();
  other = await createTenant();
  setProviders({ email: { name: 'none', delivers: false, async send() { return { ok: false, error: 'provider_not_configured', permanent: true }; } } });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  for (const id of created) await dropTenant(id);
  await dropTenant(hq.id);
  await dropTenant(other.id);
  await pool.end();
});

describe('platform operators', () => {
  it('requires both the allowlist and an active super administrator', async () => {
    const sa = await createUser(hq, { role: 'SUPER_ADMIN' });
    const admin = await createUser(hq, { role: 'ADMIN' });
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', `${sa.email}, ${admin.email}`);
    expect(isPlatformOperator(await ctxFor(sa.id))).toBe(true);
    expect(isPlatformOperator(await ctxFor(admin.id))).toBe(false); // allowlisted but not SUPER_ADMIN
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', '');
    expect(isPlatformOperator(await ctxFor(sa.id))).toBe(false); // SUPER_ADMIN but not allowlisted
    await expect(createInstitution(await ctxFor(sa.id), newCollege())).rejects.toMatchObject({ status: 403 });
  });

  it('creates a college, invites its first administrator and hands back the link', async () => {
    const sa = await createUser(hq, { role: 'SUPER_ADMIN' });
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', sa.email);
    const input = newCollege();
    const res = await createInstitution(await ctxFor(sa.id), input);
    created.push(res.institutionId);
    expect(res.emailSent).toBe(false);
    expect(res.inviteUrl).toMatch(/\/invite\?token=/);

    const [inst] = await db.select().from(t.institutions).where(eq(t.institutions.id, res.institutionId));
    expect(inst).toMatchObject({ kind: 'COLLEGE', isListed: true, institutionType: 'College', website: 'https://demo.example.edu' });
    expect(inst!.registrationPolicy).toMatchObject({ mode: 'ADMIN_APPROVAL', allowedDomains: ['demo.example.edu'], idDocument: 'OPTIONAL' });
    expect(inst!.featureFlags).toMatchObject({ events_enabled: true, library_enabled: true, grievance_enabled: false });

    const [admin] = await db.select().from(t.users).where(eq(t.users.id, res.adminUserId));
    expect(admin).toMatchObject({ role: 'SUPER_ADMIN', status: 'INVITED', institutionId: res.institutionId, passwordHash: null });

    // Audit in both tenants; never the link itself.
    const audits = await db.select().from(t.auditLogs).where(eq(t.auditLogs.entityId, res.institutionId));
    expect(audits.map((a) => a.institutionId).sort()).toEqual([hq.id, res.institutionId].sort());
    expect(JSON.stringify(audits)).not.toContain('token=');

    // The invitation activates exactly that role, once.
    const accepted = await acceptInvite({ token: tokenFrom(res.inviteUrl!), password: 'Pilot-Admin-2026', meta: meta() });
    expect(accepted).toMatchObject({ role: 'SUPER_ADMIN', institutionId: res.institutionId, redirectTo: '/admin' });
    await expect(acceptInvite({ token: tokenFrom(res.inviteUrl!), password: 'Pilot-Admin-2026', meta: meta() })).rejects.toMatchObject({ status: 400 });

    // Slugs are unique.
    await expect(createInstitution(await ctxFor(sa.id), newCollege({ slug: input.slug }))).rejects.toMatchObject({ status: 409 });
  });

  it('tracks setup progress and refuses to launch until every step is done', async () => {
    const progress = await getSetupProgress(other.id);
    expect(progress.launched).toBe(false);
    expect(progress.steps.find((s) => s.key === 'structure')?.done).toBe(true);
    const sa = await createUser(other, { role: 'SUPER_ADMIN' });
    const incomplete = (await getSetupProgress(other.id)).ready;
    if (!incomplete) {
      await expect(markSetupComplete(await ctxFor(sa.id), meta())).rejects.toMatchObject({ code: 'SETUP_INCOMPLETE' });
    }
  });
});

describe('invitations and access', () => {
  it('returns a one-time link when email is not configured, and withdrawing it kills the link', async () => {
    const admin = await ctxFor((await createUser(other, { role: 'SUPER_ADMIN' })).id);
    const email = `teacher-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const invited = await inviteUser(admin, {
      email, firstName: 'Tara', lastName: 'Teacher', role: 'FACULTY', departmentId: other.departmentId, employeeCode: `E-${Date.now()}`, meta: meta(),
    });
    expect(invited.inviteUrl).toBeTruthy();
    await revokeInvite(admin, invited.userId, meta());
    await expect(acceptInvite({ token: tokenFrom(invited.inviteUrl!), password: 'Teacher-Pass-2026', meta: meta() })).rejects.toMatchObject({ status: 400 });
    const [u] = await db.select().from(t.users).where(eq(t.users.id, invited.userId));
    expect(u).toMatchObject({ status: 'ARCHIVED' });

    // The same person can be invited again for the same role.
    const again = await inviteUser(admin, { email, firstName: 'Tara', lastName: 'Teacher', role: 'FACULTY', departmentId: other.departmentId, employeeCode: 'X', meta: meta() });
    expect(again.userId).toBe(invited.userId);
    const accepted = await acceptInvite({ token: tokenFrom(again.inviteUrl!), password: 'Teacher-Pass-2026', meta: meta() });
    expect(accepted.role).toBe('FACULTY'); // fixed server-side
  });

  it('cannot revoke an accepted account or another college’s invitation', async () => {
    const adminA = await ctxFor((await createUser(other, { role: 'SUPER_ADMIN' })).id);
    const adminB = await ctxFor((await createUser(hq, { role: 'SUPER_ADMIN' })).id);
    const active = await createUser(other, { role: 'FACULTY' });
    await expect(revokeInvite(adminA, active.id, meta())).rejects.toMatchObject({ status: 404 });
    const inv = await inviteUser(adminA, { email: `x-${Date.now()}@example.com`, firstName: 'X', lastName: 'Y', role: 'CLUB_ADMIN', meta: meta() });
    await expect(revokeInvite(adminB, inv.userId, meta())).rejects.toMatchObject({ status: 404 });
  });

  it('suspends and restores access; suspended staff cannot sign in; super administrators are protected', async () => {
    const admin = await ctxFor((await createUser(other, { role: 'ADMIN' })).id);
    const teacher = await createUser(other, { role: 'FACULTY' });
    await setUserAccess(admin, teacher.id, 'SUSPEND', meta());
    const login = await authenticate({ email: teacher.email, password: TEST_PASSWORD, meta: meta() });
    expect(login).toMatchObject({ ok: false, code: 'ACCOUNT_INACTIVE' });
    const [s] = await db.select().from(t.users).where(eq(t.users.id, teacher.id));
    expect(s!.sessionEpoch).toBe(teacher.sessionEpoch + 1); // open sessions end
    await setUserAccess(admin, teacher.id, 'REACTIVATE', meta());
    expect((await authenticate({ email: teacher.email, password: TEST_PASSWORD, meta: meta() })).ok).toBe(true);

    const sa = await createUser(other, { role: 'SUPER_ADMIN' });
    await expect(setUserAccess(admin, sa.id, 'SUSPEND', meta())).rejects.toMatchObject({ status: 403 });
    await expect(setUserAccess(admin, admin.userId, 'SUSPEND', meta())).rejects.toMatchObject({ code: 'SELF_ACTION' });
    const foreign = await createUser(hq, { role: 'FACULTY' });
    await expect(setUserAccess(admin, foreign.id, 'SUSPEND', meta())).rejects.toMatchObject({ status: 404 });

    const student = await ctxFor((await createUser(other, { role: 'STUDENT' })).id);
    await expect(setUserAccess(student, teacher.id, 'SUSPEND', meta())).rejects.toMatchObject({ status: 403 });
    const rows = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.entityId, teacher.id), eq(t.auditLogs.action, 'USER_DEACTIVATED')));
    expect(rows).toHaveLength(1);
  });
});
