import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { drainNotifications } from '@/services/notifications/dispatcher';
import { setProviders } from '@/services/notifications/providers';
import { updateFeatureFlags } from '@/services/institution-settings';
import { captureEmail, createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/**
 * I-003 (guardian mode): one scheduler call must keep delivering until the
 * queue is empty, so a required notice reaches a whole college in one run
 * instead of 100 emails per 10 minutes.
 */
let A: TestTenant;
const mail = captureEmail();

beforeAll(async () => {
  A = await createTenant();
  const admin = await ctxFor((await createUser(A, { role: 'SUPER_ADMIN' })).id);
  await updateFeatureFlags(admin, { email_enabled: true }, meta());
});
afterAll(async () => {
  setProviders(null);
  await dropTenant(A.id);
  await pool.end();
});

describe('notification drain', () => {
  it('delivers a 150-recipient wave in one call, once each', async () => {
    const students: Awaited<ReturnType<typeof createUser>>[] = [];
    for (let i = 0; i < 150; i++) students.push(await createUser(A));
    const rows = await db
      .insert(t.notifications)
      .values(students.map((s) => ({ institutionId: A.id, userId: s.id, title: 'Exam moved to Room B207', priority: 'CRITICAL' as const, category: 'EXAMINATION' as const })))
      .returning({ id: t.notifications.id });

    const before = mail.sent.length;
    const r = await drainNotifications({ budgetMs: 60_000 });
    expect(r.rounds).toBeGreaterThan(1);

    const ids = rows.map((x) => x.id);
    const sent = await db
      .select({ id: t.notificationDeliveries.id })
      .from(t.notificationDeliveries)
      .where(and(inArray(t.notificationDeliveries.notificationId, ids), eq(t.notificationDeliveries.channel, 'EMAIL'), eq(t.notificationDeliveries.status, 'SENT')));
    expect(sent).toHaveLength(150);
    const ours = mail.sent.slice(before).filter((m) => students.some((s) => s.email === m.to));
    expect(ours).toHaveLength(150); // exactly once each

    // Nothing left: a second call finds no work.
    const again = await drainNotifications({ budgetMs: 60_000 });
    expect(mail.sent.slice(before).filter((m) => students.some((s) => s.email === m.to))).toHaveLength(150);
    expect(again.rounds).toBeGreaterThanOrEqual(1);
  }, 180_000);

  it('with no time budget, runs a single round (the previous behaviour)', async () => {
    const r = await drainNotifications({ budgetMs: 0 });
    expect(r.rounds).toBe(1);
  });
});
