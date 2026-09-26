import 'server-only';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { ForbiddenError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';

/**
 * VERIFIED CAMPUS COMMUNICATION (CAMPUSOS-010)
 * ---------------------------------------------------------------------------
 * Proof that a notice reached people: sent → delivered → read → acknowledged,
 * with the list of who has not acknowledged. Every number here is counted
 * from `announcement_recipients` and `notification_deliveries` — the same
 * rows the evidence pack uses — so the sender, the dashboard and the export
 * always agree.
 *
 * Who may see receipts: the notice's author, or anyone with
 * `announcement:view_analytics`, in the same college.
 */

export interface ChannelCounts {
  sent: number;
  failed: number;
  skipped: number;
  queued: number;
}

export interface NoticeReceipts {
  id: string;
  title: string;
  reference: string;
  requiresAcknowledgement: boolean;
  deadline: Date | null;
  publishedAt: Date | null;
  reminderSentAt: Date | null;
  funnel: { recipients: number; deliveredInApp: number; read: number; acknowledged: number; pending: number; overdue: boolean };
  channels: { email: ChannelCounts; push: ChannelCounts; sms: ChannelCounts; whatsapp: ChannelCounts };
  pending: { userId: string; name: string; role: string; rollNumber: string | null; sectionCode: string | null; readAt: Date | null }[];
}

async function loadNotice(ctx: AuthContext, announcementId: string) {
  const [a] = await db
    .select()
    .from(t.announcements)
    .where(and(eq(t.announcements.id, announcementId), eq(t.announcements.institutionId, ctx.institutionId), isNull(t.announcements.deletedAt)))
    .limit(1);
  if (!a) throw new NotFoundError('Notice');
  if (a.authorId !== ctx.userId && !ctx.permissions.has('announcement:view_analytics')) {
    throw new ForbiddenError('Only the sender or staff with communication analytics can see who acknowledged.');
  }
  return a;
}

export function canSeeReceipts(ctx: AuthContext, authorId: string) {
  return authorId === ctx.userId || ctx.permissions.has('announcement:view_analytics');
}

export async function getNoticeReceipts(ctx: AuthContext, announcementId: string): Promise<NoticeReceipts> {
  const a = await loadNotice(ctx, announcementId);

  const [counts] = await db
    .select({
      recipients: sql<number>`count(*)::int`,
      read: sql<number>`count(${t.announcementRecipients.readAt})::int`,
      acknowledged: sql<number>`count(${t.announcementRecipients.acknowledgedAt})::int`,
    })
    .from(t.announcementRecipients)
    .where(and(eq(t.announcementRecipients.institutionId, ctx.institutionId), eq(t.announcementRecipients.announcementId, a.id)));

  const [inApp] = await db
    .select({ n: sql<number>`count(DISTINCT ${t.notifications.userId})::int` })
    .from(t.notifications)
    .where(and(eq(t.notifications.institutionId, ctx.institutionId), eq(t.notifications.sourceType, 'announcement'), eq(t.notifications.sourceId, a.id)));

  const deliveries = await db
    .select({ channel: t.notificationDeliveries.channel, status: t.notificationDeliveries.status, n: sql<number>`count(*)::int` })
    .from(t.notificationDeliveries)
    .innerJoin(t.notifications, eq(t.notifications.id, t.notificationDeliveries.notificationId))
    .where(and(eq(t.notifications.institutionId, ctx.institutionId), eq(t.notifications.sourceType, 'announcement'), eq(t.notifications.sourceId, a.id)))
    .groupBy(t.notificationDeliveries.channel, t.notificationDeliveries.status);

  const empty = (): ChannelCounts => ({ sent: 0, failed: 0, skipped: 0, queued: 0 });
  const channels = { email: empty(), push: empty(), sms: empty(), whatsapp: empty() };
  for (const d of deliveries) {
    const key = d.channel.toLowerCase() as keyof typeof channels;
    if (!(key in channels)) continue;
    const status = d.status.toLowerCase() as keyof ChannelCounts;
    channels[key][status] += Number(d.n);
  }

  const pending = await db
    .select({
      userId: t.users.id,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      role: t.users.role,
      rollNumber: t.studentProfiles.rollNumber,
      sectionCode: t.sections.code,
      readAt: t.announcementRecipients.readAt,
    })
    .from(t.announcementRecipients)
    .innerJoin(t.users, eq(t.users.id, t.announcementRecipients.userId))
    .leftJoin(t.studentProfiles, eq(t.studentProfiles.userId, t.users.id))
    .leftJoin(t.sections, eq(t.sections.id, t.studentProfiles.sectionId))
    .where(
      and(
        eq(t.announcementRecipients.institutionId, ctx.institutionId),
        eq(t.announcementRecipients.announcementId, a.id),
        isNull(t.announcementRecipients.acknowledgedAt),
      ),
    )
    .orderBy(asc(t.sections.code), asc(t.users.firstName), asc(t.users.lastName))
    .limit(5000);

  const recipients = Number(counts?.recipients ?? 0);
  const acknowledged = Number(counts?.acknowledged ?? 0);
  return {
    id: a.id,
    title: a.title,
    reference: a.reference,
    requiresAcknowledgement: a.requiresAcknowledgement,
    deadline: a.acknowledgementDeadline,
    publishedAt: a.publishedAt,
    reminderSentAt: a.ackReminderSentAt,
    funnel: {
      recipients,
      deliveredInApp: Number(inApp?.n ?? 0),
      read: Number(counts?.read ?? 0),
      acknowledged,
      pending: a.requiresAcknowledgement ? recipients - acknowledged : 0,
      overdue: !!a.acknowledgementDeadline && a.acknowledgementDeadline < new Date() && recipients > acknowledged,
    },
    channels,
    pending: a.requiresAcknowledgement
      ? pending.map((p) => ({
          userId: p.userId,
          name: `${p.firstName} ${p.lastName}`.trim(),
          role: p.role,
          rollNumber: p.rollNumber,
          sectionCode: p.sectionCode,
          readAt: p.readAt,
        }))
      : [],
  };
}

function csvCell(value: string | null | undefined): string {
  const v = value ?? '';
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Everyone who has not acknowledged, as CSV. Audited. */
export async function exportPendingCsv(ctx: AuthContext, announcementId: string, meta: { ipAddress: string | null; userAgent: string | null }) {
  const r = await getNoticeReceipts(ctx, announcementId);
  const lines = [
    ['Name', 'Roll number', 'Section', 'Role', 'Opened'].map(csvCell).join(','),
    ...r.pending.map((p) => [p.name, p.rollNumber, p.sectionCode, p.role, p.readAt ? p.readAt.toISOString() : ''].map(csvCell).join(',')),
  ];
  await recordAudit(ctx, {
    action: 'DATA_EXPORTED',
    entityType: 'announcement',
    entityId: announcementId,
    after: { export: 'pending_acknowledgements', rows: r.pending.length },
    ...meta,
  });
  return { filename: `${r.reference}-not-acknowledged.csv`, csv: `${lines.join('\r\n')}\r\n` };
}

/**
 * One reminder per notice, to people who have not acknowledged, when the
 * deadline is within the next 24 hours. Run by the scheduler per college.
 */
export async function sendAcknowledgementReminders(institutionId: string, now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 24 * 3600_000);
  const due = await db
    .select({ id: t.announcements.id, title: t.announcements.title, deadline: t.announcements.acknowledgementDeadline })
    .from(t.announcements)
    .where(
      and(
        eq(t.announcements.institutionId, institutionId),
        eq(t.announcements.status, 'PUBLISHED'),
        eq(t.announcements.requiresAcknowledgement, true),
        isNull(t.announcements.ackReminderSentAt),
        isNull(t.announcements.deletedAt),
        isNotNull(t.announcements.acknowledgementDeadline),
        gt(t.announcements.acknowledgementDeadline, now),
        lte(t.announcements.acknowledgementDeadline, soon),
      ),
    );

  let reminded = 0;
  for (const a of due) {
    await db.transaction(async (tx) => {
      // Claim the notice first so two runs can't both remind.
      const claimed = await tx
        .update(t.announcements)
        .set({ ackReminderSentAt: now })
        .where(and(eq(t.announcements.id, a.id), isNull(t.announcements.ackReminderSentAt)))
        .returning({ id: t.announcements.id });
      if (!claimed.length) return;
      const pending = await tx
        .select({ userId: t.announcementRecipients.userId })
        .from(t.announcementRecipients)
        .where(and(eq(t.announcementRecipients.announcementId, a.id), isNull(t.announcementRecipients.acknowledgedAt)));
      if (!pending.length) return;
      await tx.insert(t.notifications).values(
        pending.map((p) => ({
          institutionId,
          userId: p.userId,
          title: `Please acknowledge: ${a.title}`,
          body: `Your college asked you to confirm you have read this notice by ${a.deadline!.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`,
          priority: 'IMPORTANT' as never,
          category: 'ADMINISTRATIVE' as never,
          actionUrl: `/announcements/${a.id}`,
          groupKey: `ack-reminder-${a.id}`,
          sourceType: 'announcement_reminder',
          sourceId: a.id,
        })),
      );
      reminded += pending.length;
    });
  }
  if (reminded) {
    await recordAudit(null, { action: 'ACK_REMINDERS_SENT', entityType: 'announcement', entityId: due[0]!.id, after: { notices: due.length, people: reminded } }, institutionId);
  }
  return reminded;
}

/** Notices this person must still acknowledge (for the student home). */
export async function pendingAcknowledgementsFor(ctx: Pick<AuthContext, 'userId' | 'institutionId'>) {
  return db
    .select({ id: t.announcements.id, title: t.announcements.title, deadline: t.announcements.acknowledgementDeadline })
    .from(t.announcementRecipients)
    .innerJoin(t.announcements, eq(t.announcements.id, t.announcementRecipients.announcementId))
    .where(
      and(
        eq(t.announcementRecipients.institutionId, ctx.institutionId),
        eq(t.announcementRecipients.userId, ctx.userId),
        isNull(t.announcementRecipients.acknowledgedAt),
        eq(t.announcements.requiresAcknowledgement, true),
        inArray(t.announcements.status, ['PUBLISHED']),
        isNull(t.announcements.deletedAt),
      ),
    )
    .orderBy(asc(t.announcements.acknowledgementDeadline))
    .limit(10);
}
