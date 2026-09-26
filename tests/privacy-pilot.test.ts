import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { registerIndependentStudent } from '@/services/auth/accounts';
import { acceptPrivacyNotice, hasAcceptedCurrentNotice, requestDeletion } from '@/services/privacy';
import { actorHash, track } from '@/services/product-events';
import { recordCampusInterest } from '@/services/campus-demand';
import { aiProviderFor, __setAiProvider } from '@/services/ai/providers';
import type { AiProvider } from '@/services/ai/types';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/**
 * CAMPUSOS-005/006/007/019: consent, self-service erasure of a personal
 * workspace, and the per-college switch for external AI processing.
 */

let college: TestTenant;
const personalTenants: string[] = [];

beforeAll(async () => {
  college = await createTenant();
});
afterEach(() => {
  vi.unstubAllEnvs();
  __setAiProvider(null);
});
afterAll(async () => {
  for (const id of personalTenants) await dropTenant(id);
  await dropTenant(college.id);
  await pool.end();
});

async function personalStudent() {
  vi.stubEnv('SELF_REGISTRATION_ENABLED', 'true');
  const email = `erase-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await registerIndependentStudent({ firstName: 'Era', lastName: 'Se', email, password: 'Erase-Me-2026!x', ageBand: '18_OR_OVER', meta: meta() });
  personalTenants.push(res.user.institutionId);
  return { ...res.user, email };
}

describe('privacy notice acceptance', () => {
  it('is recorded once per version', async () => {
    const u = await createUser(college, { role: 'FACULTY' });
    const ctx = await ctxFor(u.id);
    expect(await hasAcceptedCurrentNotice(u.id)).toBe(false);
    expect(await acceptPrivacyNotice(ctx, meta())).toMatchObject({ alreadyAccepted: false });
    expect(await acceptPrivacyNotice(ctx, meta())).toMatchObject({ alreadyAccepted: true });
    expect(await hasAcceptedCurrentNotice(u.id)).toBe(true);
    const rows = await db.select().from(t.consentRecords).where(eq(t.consentRecords.userId, u.id));
    expect(rows).toHaveLength(1);
  });

  it('is already accepted for a student who signed up with it', async () => {
    const s = await personalStudent();
    expect(await hasAcceptedCurrentNotice(s.id)).toBe(true);
  });
});

describe('personal workspace self-deletion', () => {
  it('erases the account immediately and keeps only anonymous evidence', async () => {
    const s = await personalStudent();
    const ctx = await ctxFor(s.id);
    await recordCampusInterest(ctx, { name: 'Erasure Test College', city: 'Pune' });
    await track(ctx, 'tracker_goal_created');
    await db.insert(t.notifications).values({ institutionId: s.institutionId, userId: s.id, title: 'Hi', body: 'x', priority: 'NORMAL', category: 'GENERAL' });

    const res = await requestDeletion(ctx, { scope: 'ACCOUNT', reason: null }, meta());
    expect(res.status).toBe('COMPLETED');

    const [user] = await db.select().from(t.users).where(eq(t.users.id, s.id));
    expect(user).toMatchObject({ status: 'ARCHIVED', firstName: 'Deleted', passwordHash: null });
    expect(user!.email).not.toBe(s.email);
    expect(user!.sessionEpoch).toBeGreaterThan(s.sessionEpoch);
    const [inst] = await db.select().from(t.institutions).where(eq(t.institutions.id, s.institutionId));
    expect(inst).toMatchObject({ isActive: false, kind: 'PERSONAL' });
    expect(await db.select().from(t.campusInterest).where(eq(t.campusInterest.actorHash, actorHash(s.id)))).toHaveLength(0);
    expect(await db.select().from(t.productEvents).where(eq(t.productEvents.actorHash, actorHash(s.id)))).toHaveLength(0);
    expect(await db.select().from(t.notifications).where(eq(t.notifications.userId, s.id))).toHaveLength(0);
    // The consent ledger is append-only legal evidence and remains.
    expect((await db.select().from(t.consentRecords).where(eq(t.consentRecords.userId, s.id))).length).toBeGreaterThan(0);
  });

  it('a college account still goes to the college for review', async () => {
    const s = await createUser(college, { role: 'STUDENT' });
    const res = await requestDeletion(await ctxFor(s.id), { scope: 'ACCOUNT', reason: null }, meta());
    expect(res.status).toBe('PENDING');
    const [user] = await db.select().from(t.users).where(eq(t.users.id, s.id));
    expect(user!.status).toBe('ACTIVE');
  });
});

describe('external AI processing (CAMPUSOS-019)', () => {
  const external: AiProvider = {
    name: 'anthropic',
    model: 'test-model',
    isLanguageModel: true,
    async complete() {
      throw new Error('must not be called');
    },
  } as unknown as AiProvider;

  it('uses the offline assistant unless the college turns external AI on', () => {
    __setAiProvider(external);
    expect(aiProviderFor({ featureFlags: {} }).isLanguageModel).toBe(false);
    expect(aiProviderFor({ featureFlags: { ai_external_processing_enabled: false } }).isLanguageModel).toBe(false);
    expect(aiProviderFor({ featureFlags: { ai_external_processing_enabled: true } })).toBe(external);
    // …but never in the public demo.
    expect(aiProviderFor({ featureFlags: { ai_external_processing_enabled: true }, isDemo: true }).isLanguageModel).toBe(false);
  });

  it('the offline provider is used as-is when no language model is configured', () => {
    __setAiProvider(null);
    expect(aiProviderFor({ featureFlags: { ai_external_processing_enabled: true } }).isLanguageModel).toBe(false);
  });
});
