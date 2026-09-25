import 'server-only';
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { isEnabled } from '@/lib/features';
import { appUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getProviders, type EmailMessage, type SendResult } from './providers';
import {
  planDelivery,
  localMinutesIn,
  RECORDED_SKIPS,
  EXTERNAL_CHANNELS,
  type Channel,
  type Priority,
} from './planner';
import { notificationEmail } from './templates';

/**
 * NOTIFICATION DISPATCHER
 * ---------------------------------------------------------------------------
 * Two stages, both driven by the job runner (POST /api/jobs/run):
 *
 *   1. plan    — every notification row that has not been planned yet gets a
 *                decision per external channel (planner.ts). Sends become
 *                QUEUED deliveries; meaningful skips are recorded with a reason.
 *                Because planning scans the notifications table, every existing
 *                insert site (announcements, grievances, approvals…) is covered
 *                without modification.
 *   2. deliver — QUEUED deliveries whose time has come are claimed with
 *                FOR UPDATE SKIP LOCKED (safe with concurrent runners), sent
 *                through the configured provider, and marked SENT / FAILED,
 *                with bounded retries.
 *
 * Transactional mail (password reset, verification, invites) bypasses the
 * queue and is sent immediately, but is still recorded as a delivery.
 */

const MAX_ATTEMPTS = 3;
/** Notifications older than this when first seen are marked planned without sending. */
const MAX_PLAN_AGE_HOURS = 24;

/* --------------------------- transactional mail --------------------------- */

export async function sendTransactionalEmail(params: {
  institutionId: string;
  userId: string | null;
  message: EmailMessage;
}): Promise<{ sent: boolean; reason?: string }> {
  const { email } = getProviders();
  let result: SendResult;
  if (!email.delivers) {
    result = { ok: false, error: 'provider_not_configured', permanent: true };
  } else {
    result = await email.send(params.message);
  }

  await db
    .insert(t.notificationDeliveries)
    .values({
      institutionId: params.institutionId,
      userId: params.userId,
      channel: 'EMAIL',
      provider: email.name,
      template: params.message.tag ?? 'transactional',
      status: result.ok ? 'SENT' : email.delivers ? 'FAILED' : 'SKIPPED',
      reason: result.ok ? null : email.delivers ? null : 'provider_not_configured',
      providerMessageId: result.providerMessageId ?? null,
      attempts: email.delivers ? 1 : 0,
      lastError: result.ok ? null : (result.error ?? null),
      sentAt: result.ok ? new Date() : null,
    })
    .catch((error) => logger.error('notify.delivery_record_failed', { error }));

  if (!result.ok) {
    logger.warn('notify.transactional_email_not_sent', {
      template: params.message.tag,
      reason: result.error,
    });
  }
  return { sent: result.ok, reason: result.ok ? undefined : result.error };
}

/* --------------------------------- plan ----------------------------------- */

export interface PlanSummary {
  notifications: number;
  queued: number;
  skipped: number;
  stale: number;
}

export async function planPendingNotifications(opts: { now?: Date; batch?: number } = {}): Promise<PlanSummary> {
  const now = opts.now ?? new Date();
  const batch = opts.batch ?? 500;
  const summary: PlanSummary = { notifications: 0, queued: 0, skipped: 0, stale: 0 };

  // Old, never-planned rows (e.g. after an outage) are closed without sending:
  // a two-day-old "class moved" email is noise, and the in-app copy exists.
  const staleBefore = new Date(now.getTime() - MAX_PLAN_AGE_HOURS * 3600_000);
  const stale = await db
    .update(t.notifications)
    .set({ deliveryPlannedAt: now })
    .where(and(isNull(t.notifications.deliveryPlannedAt), lte(t.notifications.createdAt, staleBefore)))
    .returning({ id: t.notifications.id });
  summary.stale = stale.length;

  const pending = await db
    .select({
      id: t.notifications.id,
      institutionId: t.notifications.institutionId,
      userId: t.notifications.userId,
      priority: t.notifications.priority,
      category: t.notifications.category,
      isMandatory: t.notifications.isMandatory,
    })
    .from(t.notifications)
    .where(isNull(t.notifications.deliveryPlannedAt))
    .orderBy(t.notifications.createdAt)
    .limit(batch);
  if (pending.length === 0) return summary;
  summary.notifications = pending.length;

  const institutionIds = [...new Set(pending.map((p) => p.institutionId))];
  const userIds = [...new Set(pending.map((p) => p.userId))];

  const [tenants, recipients, settings, prefs, pushUsers, recent] = await Promise.all([
    db
      .select({ id: t.institutions.id, flags: t.institutions.featureFlags, timezone: t.institutions.timezone })
      .from(t.institutions)
      .where(inArray(t.institutions.id, institutionIds)),
    db
      .select({ id: t.users.id, email: t.users.email, phone: t.users.phone, verifiedAt: t.users.emailVerifiedAt, status: t.users.status })
      .from(t.users)
      .where(inArray(t.users.id, userIds)),
    db.select().from(t.notificationSettings).where(inArray(t.notificationSettings.userId, userIds)),
    db.select().from(t.notificationPreferences).where(inArray(t.notificationPreferences.userId, userIds)),
    db
      .selectDistinct({ userId: t.pushSubscriptions.userId })
      .from(t.pushSubscriptions)
      .where(and(inArray(t.pushSubscriptions.userId, userIds), isNull(t.pushSubscriptions.revokedAt))),
    db
      .select({
        userId: t.notificationDeliveries.userId,
        channel: t.notificationDeliveries.channel,
        n: sql<number>`count(*)::int`,
      })
      .from(t.notificationDeliveries)
      .where(
        and(
          inArray(t.notificationDeliveries.userId, userIds),
          inArray(t.notificationDeliveries.status, ['QUEUED', 'SENT']),
          gte(t.notificationDeliveries.createdAt, new Date(now.getTime() - 3600_000)),
        ),
      )
      .groupBy(t.notificationDeliveries.userId, t.notificationDeliveries.channel),
  ]);

  const tenantById = new Map(tenants.map((x) => [x.id, x]));
  const userById = new Map(recipients.map((x) => [x.id, x]));
  const settingsByUser = new Map(settings.map((x) => [x.userId, x]));
  const pushSet = new Set(pushUsers.map((x) => x.userId));
  const recentCounts = new Map<string, Partial<Record<Channel, number>>>();
  for (const r of recent) {
    if (!r.userId) continue;
    const m = recentCounts.get(r.userId) ?? {};
    m[r.channel as Channel] = r.n;
    recentCounts.set(r.userId, m);
  }

  const providers = getProviders();
  const providerReady: Record<Channel, boolean> = {
    EMAIL: providers.email.delivers,
    PUSH: providers.push.delivers,
    SMS: providers.sms.delivers,
    WHATSAPP: providers.whatsapp.delivers,
  };

  const rows: (typeof t.notificationDeliveries.$inferInsert)[] = [];

  for (const n of pending) {
    const tenant = tenantById.get(n.institutionId);
    const user = userById.get(n.userId);
    if (!tenant || !user || user.status !== 'ACTIVE') continue;
    const flags = (tenant.flags ?? {}) as Record<string, boolean>;
    const s = settingsByUser.get(n.userId);
    const categoryPrefs: Partial<Record<Channel, boolean>> = {};
    for (const p of prefs) {
      if (p.userId === n.userId && p.category === n.category && p.channel !== 'IN_APP') {
        categoryPrefs[p.channel as Channel] = p.enabled;
      }
    }

    const counts = recentCounts.get(n.userId) ?? {};
    const decisions = planDelivery({
      priority: n.priority as Priority,
      category: n.category,
      mandatory: n.isMandatory,
      tenantChannels: {
        EMAIL: isEnabled(flags, 'email_enabled'),
        PUSH: isEnabled(flags, 'push_enabled'),
        SMS: isEnabled(flags, 'sms_enabled'),
        WHATSAPP: isEnabled(flags, 'whatsapp_enabled'),
      },
      providerReady,
      recipient: {
        email: user.email,
        emailVerified: !!user.verifiedAt,
        phone: user.phone,
        hasPushSubscription: pushSet.has(n.userId),
      },
      settings: {
        emailEnabled: s?.emailEnabled ?? true,
        pushEnabled: s?.pushEnabled ?? true,
        smsEnabled: s?.smsEnabled ?? false,
        quietHoursEnabled: s?.quietHoursEnabled ?? false,
        quietHoursStart: s?.quietHoursStart ?? '22:00',
        quietHoursEnd: s?.quietHoursEnd ?? '07:00',
      },
      categoryPrefs,
      recentCounts: counts,
      localMinutes: localMinutesIn(now, tenant.timezone || 'Asia/Kolkata'),
      now,
    });

    for (const d of decisions) {
      if (d.action === 'SEND') {
        rows.push({
          institutionId: n.institutionId,
          notificationId: n.id,
          userId: n.userId,
          channel: d.channel,
          status: 'QUEUED',
          runAfter: d.runAfter,
        });
        // Count it immediately so a burst in this batch is throttled too.
        counts[d.channel] = (counts[d.channel] ?? 0) + 1;
        recentCounts.set(n.userId, counts);
        summary.queued++;
      } else if (RECORDED_SKIPS.includes(d.reason)) {
        rows.push({
          institutionId: n.institutionId,
          notificationId: n.id,
          userId: n.userId,
          channel: d.channel,
          status: 'SKIPPED',
          reason: d.reason,
        });
        summary.skipped++;
      }
    }
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) {
      await tx
        .insert(t.notificationDeliveries)
        .values(rows.slice(i, i + 500))
        .onConflictDoNothing();
    }
    await tx
      .update(t.notifications)
      .set({ deliveryPlannedAt: now })
      .where(inArray(t.notifications.id, pending.map((p) => p.id)));
  });

  return summary;
}

/* -------------------------------- deliver --------------------------------- */

export interface DeliverSummary {
  claimed: number;
  sent: number;
  failed: number;
  retrying: number;
}

export async function processDeliveryQueue(opts: { now?: Date; limit?: number } = {}): Promise<DeliverSummary> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;
  const summary: DeliverSummary = { claimed: 0, sent: 0, failed: 0, retrying: 0 };

  // Claim atomically. Pushing run_after forward is the lease: if this runner
  // dies mid-send, another picks the row up after the backoff.
  const claimed = await db.execute<{ id: string; attempts: number }>(sql`
    UPDATE notification_deliveries
       SET attempts = attempts + 1,
           run_after = ${new Date(now.getTime() + 5 * 60_000)}
     WHERE id IN (
       SELECT id FROM notification_deliveries
        WHERE status = 'QUEUED' AND run_after <= ${now}
        ORDER BY run_after
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING id, attempts
  `);
  const ids = claimed.rows.map((r) => r.id);
  summary.claimed = ids.length;
  if (ids.length === 0) return summary;

  const work = await db
    .select({
      id: t.notificationDeliveries.id,
      channel: t.notificationDeliveries.channel,
      attempts: t.notificationDeliveries.attempts,
      userId: t.notificationDeliveries.userId,
      notificationId: t.notificationDeliveries.notificationId,
      title: t.notifications.title,
      body: t.notifications.body,
      actionUrl: t.notifications.actionUrl,
      priority: t.notifications.priority,
      email: t.users.email,
      phone: t.users.phone,
      institutionName: t.institutions.name,
    })
    .from(t.notificationDeliveries)
    .innerJoin(t.notifications, eq(t.notifications.id, t.notificationDeliveries.notificationId))
    .innerJoin(t.users, eq(t.users.id, t.notificationDeliveries.userId))
    .innerJoin(t.institutions, eq(t.institutions.id, t.notificationDeliveries.institutionId))
    .where(inArray(t.notificationDeliveries.id, ids));

  const providers = getProviders();

  for (const job of work) {
    const url = job.actionUrl ? (job.actionUrl.startsWith('http') ? job.actionUrl : appUrl(job.actionUrl)) : null;
    let result: SendResult;
    let providerName = 'none';
    try {
      switch (job.channel as Channel) {
        case 'EMAIL':
          providerName = providers.email.name;
          result = await providers.email.send(
            notificationEmail({
              to: job.email,
              institutionName: job.institutionName,
              title: job.title,
              body: job.body,
              url,
              priority: job.priority,
            }),
          );
          break;
        case 'PUSH': {
          providerName = providers.push.name;
          const tokens = await db
            .select({ id: t.pushSubscriptions.id, token: t.pushSubscriptions.token })
            .from(t.pushSubscriptions)
            .where(and(eq(t.pushSubscriptions.userId, job.userId!), isNull(t.pushSubscriptions.revokedAt)));
          result = { ok: false, error: 'no active push subscription', permanent: true };
          for (const sub of tokens) {
            const r = await providers.push.send({
              token: sub.token,
              title: job.title,
              body: (job.body ?? '').slice(0, 240),
              url,
              priority: job.priority === 'CRITICAL' ? 'high' : 'normal',
            });
            if (r.ok) result = r;
            else if (r.permanent) {
              // Dead device token: stop using it.
              await db.update(t.pushSubscriptions).set({ revokedAt: now }).where(eq(t.pushSubscriptions.id, sub.id));
            }
          }
          break;
        }
        case 'SMS':
          providerName = providers.sms.name;
          result = job.phone
            ? await providers.sms.send({ to: job.phone, text: `${job.institutionName}: ${job.title}`.slice(0, 300) })
            : { ok: false, error: 'no phone', permanent: true };
          break;
        case 'WHATSAPP':
          providerName = providers.whatsapp.name;
          result = job.phone
            ? await providers.whatsapp.send({ to: job.phone, text: `${job.title}\n${url ?? ''}`.trim() })
            : { ok: false, error: 'no phone', permanent: true };
          break;
        default:
          result = { ok: false, error: 'unknown channel', permanent: true };
      }
    } catch (error) {
      result = { ok: false, error: (error as Error).message };
    }

    if (result.ok) {
      summary.sent++;
      await db
        .update(t.notificationDeliveries)
        .set({ status: 'SENT', provider: providerName, providerMessageId: result.providerMessageId ?? null, sentAt: now, lastError: null })
        .where(eq(t.notificationDeliveries.id, job.id));
      if (job.notificationId) {
        await db.execute(sql`
          UPDATE notifications
             SET delivered_channels = COALESCE(delivered_channels, '[]'::jsonb) || to_jsonb(${job.channel}::text)
           WHERE id = ${job.notificationId}
             AND NOT (COALESCE(delivered_channels, '[]'::jsonb) ? ${job.channel})`);
      }
    } else if (result.permanent || job.attempts >= MAX_ATTEMPTS) {
      summary.failed++;
      await db
        .update(t.notificationDeliveries)
        .set({ status: 'FAILED', provider: providerName, lastError: result.error?.slice(0, 500) ?? 'unknown' })
        .where(eq(t.notificationDeliveries.id, job.id));
    } else {
      summary.retrying++;
      // Exponential backoff: 2, 4, 8 minutes.
      await db
        .update(t.notificationDeliveries)
        .set({
          provider: providerName,
          lastError: result.error?.slice(0, 500) ?? 'unknown',
          runAfter: new Date(now.getTime() + 2 ** job.attempts * 60_000),
        })
        .where(eq(t.notificationDeliveries.id, job.id));
    }
  }

  if (summary.failed > 0) logger.warn('notify.deliveries_failed', { ...summary });
  return summary;
}

export { EXTERNAL_CHANNELS };
