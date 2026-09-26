import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { acknowledgeAnnouncement, markAnnouncementRead } from '@/services/communication';
import { getNoticeReceipts } from '@/services/notice-receipts';
import { computeCommunicationHealth, computeGrievanceHealth } from '@/services/analytics';
import { communicationSummary, exportEvidencePack, grievanceSummary, parseRange } from '@/services/campus-evidence';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/**
 * CAMPUSOS-014: the evidence pack uses the same numbers as the dashboards
 * and receipts (reconciliation), is aggregate by default, and is audited.
 */

let A: TestTenant;
let adminId: string;
const notices: string[] = [];
const studentNames: string[] = [];

beforeAll(async () => {
  A = await createTenant();
  const admin = await createUser(A, { role: 'SUPER_ADMIN' });
  adminId = admin.id;
  // Two notices needing acknowledgement, one informational.
  for (const [i, needsAck] of [true, true, false].entries()) {
    const [a] = await db
      .insert(t.announcements)
      .values({ institutionId: A.id, reference: `EV-${i}-${Date.now()}`, title: `Notice ${i}`, body: 'x', authorId: admin.id, status: 'PUBLISHED', publishedAt: new Date(Date.now() - (i + 1) * 3600_000), requiresAcknowledgement: needsAck })
      .returning();
    notices.push(a!.id);
  }
  for (let s = 0; s < 4; s++) {
    const u = await createUser(A, { role: 'STUDENT' });
    await db.update(t.users).set({ firstName: `Evi${s}` }).where(eq(t.users.id, u.id));
    studentNames.push(`Evi${s}`);
    for (const n of notices) await db.insert(t.announcementRecipients).values({ institutionId: A.id, announcementId: n, userId: u.id });
    const ctx = await ctxFor(u.id);
    if (s < 3) await acknowledgeAnnouncement(ctx, notices[0]!);
    if (s < 1) await acknowledgeAnnouncement(ctx, notices[1]!);
    if (s < 2) await markAnnouncementRead(ctx, notices[2]!);
  }
  // Grievances: one resolved within its statutory date, one after it.
  const [cat] = await db.insert(t.grievanceCategories).values({ institutionId: A.id, name: 'Facilities', slug: `fac-${Date.now()}` }).returning();
  const base = { institutionId: A.id, categoryId: cat!.id, subject: 's', description: 'd', raisedById: adminId };
  await db.insert(t.grievances).values([
    { ...base, caseNumber: `G-1-${Date.now()}`, status: 'RESOLVED', createdAt: new Date(Date.now() - 5 * 86_400_000), resolvedAt: new Date(Date.now() - 2 * 86_400_000), statutoryDueAt: new Date(Date.now() + 10 * 86_400_000) },
    { ...base, caseNumber: `G-2-${Date.now()}`, status: 'RESOLVED', createdAt: new Date(Date.now() - 25 * 86_400_000), resolvedAt: new Date(Date.now() - 1 * 86_400_000), statutoryDueAt: new Date(Date.now() - 3 * 86_400_000) },
  ]);
});

afterAll(async () => {
  await dropTenant(A.id);
  await pool.end();
});

describe('reconciliation', () => {
  it('acknowledgement numbers match each notice’s receipts and Campus Insights', async () => {
    const range = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 60_000) };
    const c = await communicationSummary(A.id, range);
    const admin = await ctxFor(adminId);
    let recipients = 0;
    let acked = 0;
    for (const id of notices.slice(0, 2)) {
      const r = await getNoticeReceipts(admin, id);
      recipients += r.funnel.recipients;
      acked += r.funnel.acknowledged;
    }
    expect(c.ackRecipients).toBe(recipients);
    expect(c.acknowledged).toBe(acked);
    expect(c.ackRate).toBe(Math.round((acked / recipients) * 1000) / 10); // 4 of 8 → 50
    expect(c.ackRate).toBe(50);

    const health = await computeCommunicationHealth(A.id);
    expect(health.averageAcknowledgementRate).toBe(c.ackRate);
    expect(health.outstandingAcknowledgements).toBe(c.outstanding);
  });

  it('grievance counts match the redressal dashboard and the statutory rule', async () => {
    const g = await grievanceSummary(A.id, { from: new Date(Date.now() - 30 * 86_400_000), to: new Date(Date.now() + 60_000) });
    const health = await computeGrievanceHealth(A.id);
    expect(g.resolved).toBe(health.resolvedLast30Days);
    expect(g).toMatchObject({ statutoryEligible: 2, withinStatutory: 1, withinStatutoryRate: 50 });
  });
});

describe('export', () => {
  it('is a ZIP of aggregates by default, with no student names, and is audited', async () => {
    const admin = await ctxFor(adminId);
    const { bytes, filename } = await exportEvidencePack(admin, { range: parseRange(null, null) }, meta());
    expect(filename).toMatch(/\.zip$/);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(['attendance-by-programme.csv', 'communication-notices.csv', 'grievances-by-category.csv', 'participation.csv', 'summary.html']);
    const all = Object.values(files).map((f) => strFromU8(f)).join('\n');
    for (const name of studentNames) expect(all).not.toContain(name);
    expect(strFromU8(files['summary.html']!)).toContain('Acknowledgement rate');
    const audits = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.institutionId, A.id), eq(t.auditLogs.action, 'EVIDENCE_PACK_EXPORTED')));
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it('needs report access, and data-export permission for individual rows', async () => {
    const teacher = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    await expect(exportEvidencePack(teacher, { range: parseRange(null, null) }, meta())).rejects.toMatchObject({ status: 403 });
    const admin = await ctxFor(adminId);
    const noExport = { ...admin, permissions: new Set([...admin.permissions].filter((p) => p !== 'data:export')) } as typeof admin;
    await expect(exportEvidencePack(noExport, { range: parseRange(null, null), individual: true }, meta())).rejects.toMatchObject({ status: 403 });
    const { bytes } = await exportEvidencePack(admin, { range: parseRange(null, null), individual: true }, meta());
    expect(Object.keys(unzipSync(bytes))).toContain('individual/attendance-by-student.csv');
  });

  it('rejects nonsense ranges', () => {
    expect(() => parseRange('2026-09-10', '2026-09-01')).toThrow();
    expect(() => parseRange('2024-01-01', '2026-09-01')).toThrow();
  });
});
