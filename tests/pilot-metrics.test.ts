import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { exportPilotMetrics, istWeekStart, pilotMetrics } from '@/services/pilot-metrics';
import { communicationSummary } from '@/services/campus-evidence';
import { recordAudit } from '@/services/audit';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/** Guardian mode: weekly pilot evidence is computed read-only and correctly. */

let A: TestTenant;
let B: TestTenant;
const H = 3600_000;
const now = new Date();
const published = new Date(now.getTime() - 5 * 24 * H);
// Rows written in beforeAll are timestamped after `now`, so ranges end a little later.
const end = new Date(now.getTime() + H);

beforeAll(async () => {
  A = await createTenant();
  B = await createTenant();
  const admin = await createUser(A, { role: 'ADMIN' });
  const [s1, s2, s3] = [await createUser(A), await createUser(A), await createUser(A)];
  const [notice] = await db
    .insert(t.announcements)
    .values({
      institutionId: A.id,
      reference: `NOTICE-TEST-${A.slug}`,
      title: 'Lab safety rules',
      body: 'Please confirm you have read the revised rules.',
      authorId: admin.id,
      status: 'PUBLISHED',
      requiresAcknowledgement: true,
      publishedAt: published,
      ackReminderSentAt: new Date(published.getTime() + 24 * H),
    })
    .returning();
  await db.insert(t.announcementRecipients).values([
    { institutionId: A.id, announcementId: notice!.id, userId: s1!.id, readAt: published, acknowledgedAt: new Date(published.getTime() + 1 * H) },
    { institutionId: A.id, announcementId: notice!.id, userId: s2!.id, readAt: published, acknowledgedAt: new Date(published.getTime() + 72 * H) },
    { institutionId: A.id, announcementId: notice!.id, userId: s3!.id },
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  await db.insert(t.productActiveDays).values([
    { institutionId: A.id, actorHash: `h1-${A.slug}`, day: day(new Date(now.getTime() - 2 * 24 * H)), role: 'STUDENT' },
    { institutionId: A.id, actorHash: `h2-${A.slug}`, day: day(new Date(now.getTime() - 3 * 24 * H)), role: 'STUDENT' },
    { institutionId: A.id, actorHash: `h3-${A.slug}`, day: day(new Date(now.getTime() - 2 * 24 * H)), role: 'ADMIN' },
    // Another college's activity must never count.
    { institutionId: B.id, actorHash: `hb-${B.slug}`, day: day(new Date(now.getTime() - 2 * 24 * H)), role: 'STUDENT' },
  ]);
  await db.insert(t.productEvents).values({ institutionId: A.id, actorHash: `h1-${A.slug}`, role: 'STUDENT', event: 'attention_signal_viewed', props: { kind: 'ATTENDANCE' } });
  await recordAudit(await ctxFor(admin.id), { action: 'EVIDENCE_PACK_EXPORTED', entityType: 'institution', entityId: A.id });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('pilot metrics', () => {
  it('computes activation, acknowledgement timing, reminders and usage for one college only', async () => {
    const range = { from: new Date(now.getTime() - 14 * 24 * H), to: end };
    const m = await pilotMetrics(A.id, range, now);
    expect(m.enrolled).toBe(3);
    expect(m.activated).toBe(2);
    expect(m.activationRate).toBe(66.7);
    expect(m.pendingAcknowledgementsNow).toBe(1);

    const withNotice = m.weeks.filter((w) => w.ackNotices > 0);
    expect(withNotice).toHaveLength(1);
    // 1 of 3 recipients acknowledged within 48 h; median of 1 h and 72 h.
    expect(withNotice[0]!.ackWithin48hRate).toBe(33.3);
    expect(withNotice[0]!.medianAckHours).toBe(36.5);

    expect(sum(m.weeks.map((w) => w.remindersSent))).toBe(1);
    expect(sum(m.weeks.map((w) => w.evidencePacks))).toBe(1);
    expect(sum(m.weeks.map((w) => w.signalViews))).toBe(1);
    expect(sum(m.weeks.map((w) => w.staffActive))).toBe(1);
    expect(Math.max(...m.weeks.map((w) => w.weeklyActiveStudents))).toBeLessThanOrEqual(2);
    expect(sum(m.weeks.map((w) => w.weeklyActiveStudents))).toBeGreaterThanOrEqual(2);
  });

  it('reconciles with the evidence pack on notices and acknowledgements', async () => {
    const range = { from: new Date(now.getTime() - 14 * 24 * H), to: end };
    const m = await pilotMetrics(A.id, range, now);
    const c = await communicationSummary(A.id, range);
    expect(sum(m.weeks.map((w) => w.ackNotices))).toBe(c.requiringAck);
    expect(sum(m.weeks.map((w) => w.ackRecipients))).toBe(c.ackRecipients);
    expect(m.pendingAcknowledgementsNow).toBe(c.outstanding);
  });

  it('does not count a notice published under 48 h ago against the 48-hour rate', async () => {
    const recent = await pilotMetrics(A.id, { from: new Date(published.getTime() - H), to: new Date(published.getTime() + H) }, new Date(published.getTime() + 2 * H));
    const w = recent.weeks.find((x) => x.ackNotices > 0)!;
    expect(w.ackWithin48hRate).toBeNull();
  });

  it('weeks start on Monday 00:00 IST', () => {
    const d = istWeekStart(new Date('2026-09-27T06:00:00Z')); // Sunday in IST
    expect(d.toISOString()).toBe('2026-09-20T18:30:00.000Z'); // Monday 21 Sep 00:00 IST
  });

  it('is exported only to platform operators, and audited', async () => {
    const collegeAdmin = await ctxFor((await createUser(A, { role: 'SUPER_ADMIN' })).id);
    await expect(exportPilotMetrics(collegeAdmin, A.id, { from: new Date(now.getTime() - 7 * 24 * H), to: now }, meta())).rejects.toMatchObject({ status: 404 });

    const opUser = await createUser(B, { role: 'SUPER_ADMIN' });
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', opUser.email);
    vi.stubEnv('MFA_ENFORCE', 'false');
    const op = await ctxFor(opUser.id);
    const { filename, csv } = await exportPilotMetrics(op, A.id, { from: new Date(now.getTime() - 7 * 24 * H), to: now }, meta());
    expect(filename).toMatch(new RegExp(`^pilot-metrics-${A.slug}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
    expect(csv).toContain('enrolled=3');
    expect(csv).not.toMatch(/@/); // aggregates only: no emails
    const audit = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.action, 'PILOT_METRICS_EXPORTED'), eq(t.auditLogs.entityId, A.id)));
    expect(audit).toHaveLength(1);
  });
});
