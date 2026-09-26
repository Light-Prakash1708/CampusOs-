import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { acknowledgeAnnouncement, markAnnouncementRead } from '@/services/communication';
import { exportPendingCsv, getNoticeReceipts, pendingAcknowledgementsFor, sendAcknowledgementReminders } from '@/services/notice-receipts';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/**
 * CAMPUSOS-010 verified communication: the sender sees proof, only the
 * right people see who has not acknowledged, and reminders go out once.
 */

let college: TestTenant;
let other: TestTenant;

beforeAll(async () => {
  college = await createTenant();
  other = await createTenant();
});
afterAll(async () => {
  await dropTenant(college.id);
  await dropTenant(other.id);
  await pool.end();
});

async function publish(authorId: string, opts: { deadline?: Date | null; requiresAck?: boolean } = {}) {
  const [a] = await db
    .insert(t.announcements)
    .values({
      institutionId: college.id,
      reference: `N-${Math.random().toString(36).slice(2, 9)}`,
      title: 'Exam form deadline',
      body: 'Submit the exam form by Friday.',
      authorId,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      requiresAcknowledgement: opts.requiresAck ?? true,
      acknowledgementDeadline: opts.deadline ?? null,
    })
    .returning();
  return a!;
}

async function addRecipients(announcementId: string, n: number, names: string[] = []) {
  const users = [];
  for (let i = 0; i < n; i++) {
    const u = await createUser(college, { role: 'STUDENT' });
    if (names[i]) await db.update(t.users).set({ firstName: names[i]! }).where(eq(t.users.id, u.id));
    users.push(u);
    await db.insert(t.announcementRecipients).values({ institutionId: college.id, announcementId, userId: u.id });
    await db.insert(t.notifications).values({ institutionId: college.id, userId: u.id, title: 'x', body: 'y', priority: 'NORMAL', category: 'GENERAL', sourceType: 'announcement', sourceId: announcementId });
  }
  await db.update(t.announcements).set({ recipientCount: n }).where(eq(t.announcements.id, announcementId));
  return users;
}

describe('receipts', () => {
  it('shows the sender sent → delivered → opened → acknowledged, and who is pending', async () => {
    const teacher = await createUser(college, { role: 'FACULTY' });
    const a = await publish(teacher.id);
    const [s1, s2, s3] = await addRecipients(a.id, 3);
    await acknowledgeAnnouncement(await ctxFor(s1!.id), a.id);
    await markAnnouncementRead(await ctxFor(s2!.id), a.id);

    const r = await getNoticeReceipts(await ctxFor(teacher.id), a.id);
    expect(r.funnel).toMatchObject({ recipients: 3, deliveredInApp: 3, read: 2, acknowledged: 1, pending: 2 });
    expect(r.pending.map((p) => p.userId).sort()).toEqual([s2!.id, s3!.id].sort());
    expect(r.pending.find((p) => p.userId === s2!.id)?.readAt).toBeTruthy();

    // The dashboard counters agree with the recipient rows.
    const [row] = await db.select().from(t.announcements).where(eq(t.announcements.id, a.id));
    expect(row!.acknowledgedCount).toBe(r.funnel.acknowledged);
    expect(row!.readCount).toBe(r.funnel.read);
  });

  it('only the sender or communication analytics can see them, and only in their college', async () => {
    const author = await createUser(college, { role: 'FACULTY' });
    const a = await publish(author.id);
    await addRecipients(a.id, 1);
    const colleague = await createUser(college, { role: 'FACULTY' });
    await expect(getNoticeReceipts(await ctxFor(colleague.id), a.id)).rejects.toMatchObject({ status: 403 });
    const student = await createUser(college, { role: 'STUDENT' });
    await expect(getNoticeReceipts(await ctxFor(student.id), a.id)).rejects.toMatchObject({ status: 403 });
    const admin = await createUser(college, { role: 'ADMIN' });
    await expect(getNoticeReceipts(await ctxFor(admin.id), a.id)).resolves.toMatchObject({ id: a.id });
    const foreignAdmin = await createUser(other, { role: 'SUPER_ADMIN' });
    await expect(getNoticeReceipts(await ctxFor(foreignAdmin.id), a.id)).rejects.toMatchObject({ status: 404 });
  });

  it('exports the pending list as CSV safely and audits it', async () => {
    const author = await createUser(college, { role: 'ADMIN' });
    const a = await publish(author.id);
    await addRecipients(a.id, 2, ['=HYPERLINK("x")', 'Ravi']);
    const { csv, filename } = await exportPendingCsv(await ctxFor(author.id), a.id, meta());
    expect(filename).toMatch(/not-acknowledged\.csv$/);
    expect(csv.split('\r\n')[0]).toBe('"Name","Roll number","Section","Role","Opened"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")`);
    const audits = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.entityId, a.id), eq(t.auditLogs.action, 'DATA_EXPORTED')));
    expect(audits).toHaveLength(1);
  });
});

describe('reminders', () => {
  it('reminds only people who have not acknowledged, once, when the deadline is within a day', async () => {
    const author = await createUser(college, { role: 'ADMIN' });
    const a = await publish(author.id, { deadline: new Date(Date.now() + 6 * 3600_000) });
    const [s1, s2] = await addRecipients(a.id, 2);
    await acknowledgeAnnouncement(await ctxFor(s1!.id), a.id);
    const far = await publish(author.id, { deadline: new Date(Date.now() + 5 * 86_400_000) });
    await addRecipients(far.id, 1);

    expect(await pendingAcknowledgementsFor(await ctxFor(s2!.id))).toEqual([expect.objectContaining({ id: a.id })]);
    const first = await sendAcknowledgementReminders(college.id);
    expect(first).toBeGreaterThanOrEqual(1);
    const second = await sendAcknowledgementReminders(college.id);
    expect(second).toBe(0);
    const reminders = await db.select().from(t.notifications).where(and(eq(t.notifications.sourceType, 'announcement_reminder'), eq(t.notifications.sourceId, a.id)));
    expect(reminders.map((r) => r.userId)).toEqual([s2!.id]);
    const farReminders = await db.select().from(t.notifications).where(and(eq(t.notifications.sourceType, 'announcement_reminder'), eq(t.notifications.sourceId, far.id)));
    expect(farReminders).toHaveLength(0);
  });
});
