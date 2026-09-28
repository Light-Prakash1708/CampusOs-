import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { listCollegeRequests, setCollegeRequestStatus, submitCollegeRequest } from '@/services/college-requests';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/**
 * "Register your college" is a request, not a sign-up: it must never create an
 * account, role or tenant, and only platform operators can read or triage it.
 */

let hq: TestTenant;
const ids: string[] = [];

const input = (over: Partial<Parameters<typeof submitCollegeRequest>[0]> = {}) => ({
  collegeName: 'Sister Nivedita University',
  university: null,
  city: 'Kolkata',
  website: 'snuniv.ac.in',
  contactName: 'Test Contact',
  contactEmail: `Contact-${Math.random().toString(36).slice(2, 8)}@Example.edu`,
  contactRole: 'HOD, Management',
  studentCount: 150,
  message: null,
  ...over,
});

beforeAll(async () => {
  hq = await createTenant();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  if (ids.length) await db.delete(t.collegeRequests).where(inArray(t.collegeRequests.id, ids));
  await dropTenant(hq.id);
  await pool.end();
});

describe('register your college', () => {
  it('stores a request and creates no account, role or tenant', async () => {
    const name = `Request College ${Math.random().toString(36).slice(2, 8)}`;
    const r = await submitCollegeRequest(input({ collegeName: name }), meta());
    ids.push(r.id);
    expect(r.received).toBe(true);
    const [row] = await db.select().from(t.collegeRequests).where(eq(t.collegeRequests.id, r.id));
    expect(row!.status).toBe('NEW');
    expect(row!.contactEmail).toBe(row!.contactEmail.toLowerCase());
    // Nothing else exists for the requester or the college.
    expect(await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, row!.contactEmail))).toHaveLength(0);
    expect(await db.select({ id: t.institutions.id }).from(t.institutions).where(eq(t.institutions.name, name))).toHaveLength(0);
  });

  it('is rate-limited per address', async () => {
    const m = meta();
    for (let i = 0; i < 5; i++) ids.push((await submitCollegeRequest(input(), m)).id);
    await expect(submitCollegeRequest(input(), m)).rejects.toMatchObject({ status: 429 });
  });

  it('only platform operators can list or triage requests', async () => {
    const { id } = await submitCollegeRequest(input(), meta());
    ids.push(id);
    const admin = await ctxFor((await createUser(hq, { role: 'ADMIN' })).id);
    const student = await ctxFor((await createUser(hq)).id);
    const sa = await createUser(hq, { role: 'SUPER_ADMIN' });
    const saCtx = await ctxFor(sa.id);

    // A college's own super admin is not a platform operator.
    for (const ctx of [admin, student, saCtx]) {
      await expect(listCollegeRequests(ctx)).rejects.toMatchObject({ status: 403 });
      await expect(setCollegeRequestStatus(ctx, id, 'CONTACTED')).rejects.toMatchObject({ status: 403 });
    }

    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', sa.email);
    const operator = await ctxFor(sa.id);
    expect((await listCollegeRequests(operator)).some((r) => r.id === id)).toBe(true);
    expect(await setCollegeRequestStatus(operator, id, 'CONTACTED')).toMatchObject({ id, status: 'CONTACTED' });
    await expect(setCollegeRequestStatus(operator, '00000000-0000-4000-8000-000000000000', 'SET_UP')).rejects.toMatchObject({ status: 404 });
  });
});
