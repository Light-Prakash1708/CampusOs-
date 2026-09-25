import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';
import { isEnabled } from '@/lib/features';

/**
 * Saves the caller's own notification preferences.
 *
 * Channels the tenant has not enabled are rejected rather than silently
 * ignored — a preference that cannot take effect must not look saved.
 * IN_APP is always available and is never disabled for mandatory notices.
 */

const CATEGORIES = [
  'ACADEMIC',
  'EXAMINATION',
  'EVENT',
  'ADMINISTRATIVE',
  'HOLIDAY',
  'EMERGENCY',
  'PLACEMENT',
  'FACILITY',
  'GENERAL',
] as const;

const CHANNELS = ['IN_APP', 'EMAIL', 'PUSH', 'SMS'] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const Body = z.object({
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().regex(TIME, 'Use 24-hour HH:MM.'),
  quietHoursEnd: z.string().regex(TIME, 'Use 24-hour HH:MM.'),
  digestEnabled: z.boolean(),
  preferences: z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        channel: z.enum(CHANNELS),
        enabled: z.boolean(),
      }),
    )
    .max(CATEGORIES.length * CHANNELS.length),
});

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);

  const channelFlag = {
    IN_APP: true,
    EMAIL: isEnabled(user.featureFlags, 'email_enabled'),
    PUSH: isEnabled(user.featureFlags, 'push_enabled'),
    SMS: isEnabled(user.featureFlags, 'sms_enabled'),
  } as const;

  const unavailable = [
    ...new Set(input.preferences.filter((p) => !channelFlag[p.channel]).map((p) => p.channel)),
  ];

  if (unavailable.length > 0) {
    throw new AppError(
      `Your institution has not enabled ${unavailable.join(', ').toLowerCase()} notifications.`,
      400,
      'CHANNEL_UNAVAILABLE',
      { channels: unavailable },
      'Reload the page — the available channels may have changed.',
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(t.notificationSettings)
      .values({
        institutionId: user.institutionId,
        userId: user.userId,
        quietHoursEnabled: input.quietHoursEnabled,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        emailEnabled: channelFlag.EMAIL,
        pushEnabled: channelFlag.PUSH,
        smsEnabled: channelFlag.SMS,
        digestEnabled: input.digestEnabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: t.notificationSettings.userId,
        set: {
          quietHoursEnabled: input.quietHoursEnabled,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
          digestEnabled: input.digestEnabled,
          updatedAt: new Date(),
        },
      });

    for (const preference of input.preferences) {
      await tx
        .insert(t.notificationPreferences)
        .values({
          institutionId: user.institutionId,
          userId: user.userId,
          category: preference.category,
          channel: preference.channel,
          enabled: preference.enabled,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            t.notificationPreferences.userId,
            t.notificationPreferences.category,
            t.notificationPreferences.channel,
          ],
          set: { enabled: preference.enabled, updatedAt: new Date() },
        });
    }
  });

  return ok({ saved: input.preferences.length });
});
