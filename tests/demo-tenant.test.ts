import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { beginDemo, purgeDemoTenant } from '@/services/demo';
import { sendTransactionalEmail } from '@/services/notifications/dispatcher';
import { changePassword } from '@/services/auth/accounts';
import { uploadFile } from '@/services/storage';
import { listEvents } from '@/services/events';
import { track, actorHash } from '@/services/product-events';
import { recordAudit } from '@/services/audit';
import { isPlatformOperator } from '@/services/institutions';
import { coreFlags, CORE_MODULES, FEATURE_FLAGS, isBuilt } from '@/lib/features';
import { createTenant, createUser, ctxFor, dropTenant, meta, TEST_PASSWORD, type TestTenant } from './helpers';

/**
 * CAMPUSOS-015 / 016: the public demo is isolated from real colleges and
 * resettable; new colleges start with the pilot's core modules.
 */

let demo: TestTenant;
let real: TestTenant;

beforeAll(async () => {
  demo = await createTenant();
  real = await createTenant();
  await db.update(t.institutions).set({ isDemo: true, isListed: false, featureFlags: { events_enabled: true, event_discovery_enabled: true } }).where(eq(t.institutions.id, demo.id));
  await db.update(t.institutions).set({ featureFlags: { events_enabled: true, event_discovery_enabled: true } }).where(eq(t.institutions.id, real.id));
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await purgeDemoTenant(demo.id).catch(() => undefined);
  await dropTenant(demo.id).catch(() => undefined);
  await dropTenant(real.id);
  await pool.end();
});

describe('Try the demo', () => {
  it('is off unless switched on, and only ever signs in to the demo college', async () => {
    const student = await createUser(demo, { role: 'STUDENT', email: 'student@demo.campusos.local' });
    await expect(beginDemo('student', meta())).rejects.toMatchObject({ status: 404 });

    vi.stubEnv('DEMO_TENANT_ENABLED', 'true');
    vi.stubEnv('DEMO_TENANT_SLUG', demo.slug);
    const account = await beginDemo('student', meta());
    expect(account).toMatchObject({ id: student.id, institutionId: demo.id });

    // A real college using the demo slug is never used.
    vi.stubEnv('DEMO_TENANT_SLUG', real.slug);
    await createUser(real, { role: 'STUDENT', email: 'student@demo.campusos.local' });
    await expect(beginDemo('student', meta())).rejects.toMatchObject({ status: 503 });
  });
});

describe('isolation', () => {
  it('never emails anyone from the demo', async () => {
    const res = await sendTransactionalEmail({ institutionId: demo.id, userId: null, message: { to: 'someone@example.com', subject: 'x', text: 'y', html: 'y', tag: 'test' } });
    expect(res).toEqual({ sent: false, reason: 'demo_tenant' });
  });

  it('refuses uploads, password changes and account deletion for demo users', async () => {
    const u = await ctxFor((await createUser(demo, { role: 'STUDENT' })).id);
    expect(u.isDemo).toBe(true);
    await expect(uploadFile(u, { name: 'a.pdf', bytes: new Uint8Array([37, 80, 68, 70]), purpose: 'SUBMISSION' })).rejects.toMatchObject({ code: 'DEMO_READ_ONLY' });
    await expect(changePassword(u, { currentPassword: TEST_PASSWORD, newPassword: 'Another-Pass-2026!', meta: meta() })).rejects.toMatchObject({ code: 'DEMO_READ_ONLY' });
  });

  it('keeps demo events and real events apart in discovery', async () => {
    const organiser = await createUser(demo, { role: 'ADMIN' });
    const realOrganiser = await createUser(real, { role: 'ADMIN' });
    const start = new Date(Date.now() + 5 * 86_400_000);
    const base = { title: 'x', description: 'd', startsAt: start, endsAt: new Date(start.getTime() + 3600_000), status: 'SCHEDULED' as const, visibility: 'PUBLIC' as const, category: 'HACKATHON' as const, mode: 'OFFLINE' as const };
    await db.insert(t.events).values({ ...base, institutionId: demo.id, title: 'Demo hackathon', createdById: organiser.id } as never);
    await db.insert(t.events).values({ ...base, institutionId: real.id, title: 'Real hackathon', createdById: realOrganiser.id } as never);
    const realStudent = await ctxFor((await createUser(real, { role: 'STUDENT' })).id);
    const demoStudent = await ctxFor((await createUser(demo, { role: 'STUDENT' })).id);
    const seenByReal = (await listEvents(realStudent, { when: 'upcoming', limit: 100 })).map((e) => e.title);
    const seenByDemo = (await listEvents(demoStudent, { when: 'upcoming', limit: 100 })).map((e) => e.title);
    expect(seenByReal).toContain('Real hackathon');
    expect(seenByReal).not.toContain('Demo hackathon');
    expect(seenByDemo).toContain('Demo hackathon');
    expect(seenByDemo).not.toContain('Real hackathon');
  });

  it('does not count demo activity as product usage', async () => {
    const u = await ctxFor((await createUser(demo, { role: 'STUDENT' })).id);
    await track(u, 'notice_viewed');
    expect(await db.select().from(t.productEvents).where(eq(t.productEvents.actorHash, actorHash(u.userId)))).toHaveLength(0);
  });
});

describe('platform operator', () => {
  it('can never be a demo account, even if allowlisted', async () => {
    const sa = await createUser(demo, { role: 'SUPER_ADMIN' });
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', sa.email);
    expect(isPlatformOperator(await ctxFor(sa.id))).toBe(false);
  });
});

describe('reset', () => {
  it('purges a demo tenant with its history, and refuses a real college', async () => {
    const extra = await createTenant();
    await db.update(t.institutions).set({ isDemo: true }).where(eq(t.institutions.id, extra.id));
    const u = await createUser(extra, { role: 'ADMIN' });
    await recordAudit({ userId: u.id, institutionId: extra.id, role: 'ADMIN' }, { action: 'SETTINGS_UPDATED', entityType: 'x', entityId: u.id });
    await purgeDemoTenant(extra.id);
    expect(await db.select().from(t.institutions).where(eq(t.institutions.id, extra.id))).toHaveLength(0);

    await expect(purgeDemoTenant(real.id)).rejects.toThrow(/not a demo/);
    // Real colleges' audit history is still append-only.
    const admin = await createUser(real, { role: 'ADMIN' });
    await recordAudit({ userId: admin.id, institutionId: real.id, role: 'ADMIN' }, { action: 'SETTINGS_UPDATED', entityType: 'x', entityId: admin.id });
    await expect(db.execute(sql`DELETE FROM audit_logs WHERE institution_id = ${real.id}`)).rejects.toThrow();
  });
});

describe('core modules for new colleges (CAMPUSOS-016)', () => {
  it('switch on the pilot core and leave secondary modules off but available', () => {
    const flags = coreFlags();
    for (const f of CORE_MODULES) expect(flags[f]).toBe(true);
    for (const f of ['library_enabled', 'leaderboards_enabled', 'gamification_enabled', 'timetable_optimizer_enabled', 'ai_external_processing_enabled'] as const) {
      expect(flags[f]).toBe(false);
      expect(isBuilt(f)).toBe(true);
    }
    // Only built modules are written; unbuilt ones can't be switched on anyway.
    expect(Object.keys(flags).every((k) => isBuilt(k as keyof typeof FEATURE_FLAGS))).toBe(true);
  });
});
