import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

// The sign-up route starts a session; outside a Next request, capture the cookie.
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (name: string, value: string) => jar.set(name, value),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    delete: (name: string) => jar.delete(name),
  }),
}));

import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { authenticate, registerIndependentStudent, registerStudent } from '@/services/auth/accounts';
import { verifyPassword } from '@/lib/auth/password';
import { listRegistrableInstitutions } from '@/services/public-directory';
import { POST as signUp } from '@/app/api/auth/register/student/route';
import { createTenant, createUser, dropTenant, meta, TEST_PASSWORD, type TestTenant } from './helpers';

const PASSWORD = 'Independent2026x';
const created: string[] = [];
let college: TestTenant;

function uniqueEmail(tag: string) {
  return `${tag}-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

async function workspaceOf(email: string) {
  const [row] = await db
    .select({
      userId: t.users.id,
      role: t.users.role,
      status: t.users.status,
      passwordHash: t.users.passwordHash,
      institutionId: t.users.institutionId,
      kind: t.institutions.kind,
      isListed: t.institutions.isListed,
      policy: t.institutions.registrationPolicy,
    })
    .from(t.users)
    .innerJoin(t.institutions, eq(t.institutions.id, t.users.institutionId))
    .where(eq(t.users.email, email));
  if (row) created.push(row.institutionId);
  return row;
}

function signUpRequest(body: unknown) {
  return new Request('http://localhost/api/auth/register/student', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.1` },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  college = await createTenant({ mode: 'DISABLED' });
});
afterEach(() => {
  vi.unstubAllEnvs();
  jar.clear();
});
afterAll(async () => {
  for (const id of new Set(created)) await dropTenant(id);
  await dropTenant(college.id);
  await pool.end();
});

describe('independent student sign-up', () => {
  it('is closed unless SELF_REGISTRATION_ENABLED is set', async () => {
    vi.stubEnv('SELF_REGISTRATION_ENABLED', 'false');
    await expect(
      registerIndependentStudent({ firstName: 'A', lastName: 'B', email: uniqueEmail('closed'), password: PASSWORD, meta: meta() }),
    ).rejects.toMatchObject({ status: 403, code: 'REGISTRATION_CLOSED' });
  });

  it('creates an active STUDENT in a private, unlisted workspace with a hashed password', async () => {
    vi.stubEnv('SELF_REGISTRATION_ENABLED', 'true');
    const email = uniqueEmail('asha');
    const res = await registerIndependentStudent({ firstName: 'Asha', lastName: 'Rao', email, password: PASSWORD, meta: meta() });
    expect(res.user.role).toBe('STUDENT');
    expect(res.redirectTo).toBe('/student?welcome=1');

    const row = await workspaceOf(email);
    expect(row).toMatchObject({ role: 'STUDENT', status: 'ACTIVE', kind: 'PERSONAL', isListed: false, policy: { mode: 'DISABLED' } });
    expect(row!.passwordHash).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, row!.passwordHash!)).toBe(true);

    const [profile] = await db.select().from(t.studentProfiles).where(eq(t.studentProfiles.userId, row!.userId));
    expect(profile?.institutionId).toBe(row!.institutionId);

    // The student can sign in normally afterwards.
    const login = await authenticate({ email, password: PASSWORD, meta: meta() });
    expect(login.ok).toBe(true);
    if (login.ok) expect(login.user.institutionId).toBe(row!.institutionId);

    // Personal workspaces never appear in public college discovery or accept registrations.
    expect((await listRegistrableInstitutions()).some((c) => c.slug.startsWith('personal-'))).toBe(false);
  });

  it('refuses a duplicate email, even when two sign-ups race', async () => {
    vi.stubEnv('SELF_REGISTRATION_ENABLED', 'true');
    const email = uniqueEmail('dup');
    const attempt = () => registerIndependentStudent({ firstName: 'D', lastName: 'U', email, password: PASSWORD, meta: meta() });
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    await workspaceOf(email);
    const count = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, email));
    expect(count).toHaveLength(1);
    await expect(attempt()).rejects.toMatchObject({ status: 409 });
  });

  it('rejects weak passwords and invalid input', async () => {
    vi.stubEnv('SELF_REGISTRATION_ENABLED', 'true');
    await expect(
      registerIndependentStudent({ firstName: 'W', lastName: 'P', email: uniqueEmail('weak'), password: 'short', meta: meta() }),
    ).rejects.toMatchObject({ status: 422, code: 'WEAK_PASSWORD' });
    const bad = await signUp(signUpRequest({ firstName: '', lastName: 'X', email: 'not-an-email', password: PASSWORD }), { params: Promise.resolve({}) });
    expect(bad.status).toBe(422);
    expect(jar.size).toBe(0);
  });
});

describe('sign-up route ignores client-chosen privilege and tenancy', () => {
  it.each(['ADMIN', 'SUPER_ADMIN', 'FACULTY', 'INSTITUTION_ADMIN'])('role %s in the body still creates a STUDENT', async (role) => {
    vi.stubEnv('SELF_REGISTRATION_ENABLED', 'true');
    const email = uniqueEmail(role.toLowerCase());
    const res = await signUp(
      signUpRequest({
        firstName: 'Evil',
        lastName: 'Tester',
        email,
        password: PASSWORD,
        role,
        institutionId: college.id,
        institutionSlug: college.slug,
        userId: '00000000-0000-0000-0000-000000000001',
        status: 'ACTIVE',
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    expect(jar.has('campusos_session')).toBe(true);

    const row = await workspaceOf(email);
    expect(row!.role).toBe('STUDENT');
    expect(row!.kind).toBe('PERSONAL');
    expect(row!.userId).not.toBe('00000000-0000-0000-0000-000000000001');
    // Not attached to the college named in the body.
    expect(row!.institutionId).not.toBe(college.id);
    const inCollege = await db
      .select({ id: t.users.id })
      .from(t.users)
      .where(and(eq(t.users.institutionId, college.id), eq(t.users.email, email)));
    expect(inCollege).toHaveLength(0);
  });
});

describe('college-controlled onboarding is unchanged', () => {
  it('still refuses registration at a college that has not opened it', async () => {
    await expect(
      registerStudent({
        institutionSlug: college.slug,
        firstName: 'C',
        lastName: 'D',
        email: uniqueEmail('closedcollege'),
        password: PASSWORD,
        departmentId: college.departmentId,
        programId: college.programId,
        year: 1,
        studentId: 'X-1',
        meta: meta(),
      }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_CLOSED' });
  });

  it('college administrators still sign in to their own college', async () => {
    const admin = await createUser(college, { role: 'SUPER_ADMIN' });
    const login = await authenticate({ email: admin.email, password: TEST_PASSWORD, meta: meta() });
    expect(login.ok).toBe(true);
    if (login.ok) {
      expect(login.user.institutionId).toBe(college.id);
      expect(login.redirectTo).toBe('/admin');
    }
  });

  it('a self-registered student shares no tenant with any college', async () => {
    const personal = await db
      .select({ id: t.institutions.id })
      .from(t.institutions)
      .where(inArray(t.institutions.id, created.length ? created : ['00000000-0000-0000-0000-000000000000']));
    expect(personal.every((p) => p.id !== college.id)).toBe(true);
  });
});
