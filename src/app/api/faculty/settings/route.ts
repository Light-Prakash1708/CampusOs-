import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { ok, parseBody, withAuth } from '@/lib/api';
import { getRequestMetadata } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';

/**
 * Personal notification settings.
 *
 * A channel with no configured provider cannot be enabled here — the UI
 * disables it and this route refuses it, so nobody switches on "SMS" and then
 * silently receives nothing.
 */

const CHANNEL_AVAILABILITY = {
  IN_APP: true,
  EMAIL: (process.env.EMAIL_PROVIDER ?? 'none') !== 'none',
  PUSH: (process.env.PUSH_NOTIFICATION_PROVIDER ?? 'none') !== 'none',
  SMS: (process.env.SMS_PROVIDER ?? 'none') !== 'none',
} as const;

const Body = z.object({
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  digestEnabled: z.boolean(),
});

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);

  // Silently downgrading a request would be dishonest, so report it instead.
  const refused: string[] = [];
  const emailEnabled = input.emailEnabled && CHANNEL_AVAILABILITY.EMAIL;
  const pushEnabled = input.pushEnabled && CHANNEL_AVAILABILITY.PUSH;
  const smsEnabled = input.smsEnabled && CHANNEL_AVAILABILITY.SMS;
  if (input.emailEnabled && !emailEnabled) refused.push('EMAIL');
  if (input.pushEnabled && !pushEnabled) refused.push('PUSH');
  if (input.smsEnabled && !smsEnabled) refused.push('SMS');

  const [existing] = await db
    .select({ id: t.notificationSettings.id })
    .from(t.notificationSettings)
    .where(
      and(
        eq(t.notificationSettings.userId, user.userId),
        eq(t.notificationSettings.institutionId, user.institutionId),
      ),
    )
    .limit(1);

  const values = {
    quietHoursEnabled: input.quietHoursEnabled,
    quietHoursStart: input.quietHoursStart,
    quietHoursEnd: input.quietHoursEnd,
    emailEnabled,
    pushEnabled,
    smsEnabled,
    digestEnabled: input.digestEnabled,
  };

  if (existing) {
    await db
      .update(t.notificationSettings)
      .set(values)
      .where(eq(t.notificationSettings.id, existing.id));
  } else {
    await db.insert(t.notificationSettings).values({
      institutionId: user.institutionId,
      userId: user.userId,
      ...values,
    });
  }

  const meta = await getRequestMetadata();
  await recordAudit(user, {
    action: 'SETTINGS_UPDATED',
    entityType: 'notification_settings',
    entityId: existing?.id ?? null,
    after: values,
    ...meta,
  });

  return ok({ saved: true, refusedChannels: refused });
});

export const dynamic = 'force-dynamic';
