import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';

/**
 * The signed-in person's notification settings, for any portal. Channels the
 * college hasn't enabled are marked unavailable (with the reason) rather than
 * shown as switches that do nothing.
 */
export const NOTIFICATION_CATEGORIES = ['ACADEMIC', 'EXAMINATION', 'EVENT', 'ADMINISTRATIVE', 'HOLIDAY', 'EMERGENCY', 'PLACEMENT', 'FACILITY', 'GENERAL'];

export interface ChannelOption {
  key: 'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS';
  label: string;
  available: boolean;
  unavailableReason: string;
}

export async function loadNotificationSettings(user: Pick<AuthContext, 'institutionId' | 'userId' | 'featureFlags'>) {
  const [settings] = await db
    .select()
    .from(t.notificationSettings)
    .where(and(eq(t.notificationSettings.institutionId, user.institutionId), eq(t.notificationSettings.userId, user.userId)))
    .limit(1);
  const stored = await db
    .select({ category: t.notificationPreferences.category, channel: t.notificationPreferences.channel, enabled: t.notificationPreferences.enabled })
    .from(t.notificationPreferences)
    .where(and(eq(t.notificationPreferences.institutionId, user.institutionId), eq(t.notificationPreferences.userId, user.userId)));

  const channels: ChannelOption[] = [
    { key: 'IN_APP', label: 'In app', available: true, unavailableReason: '' },
    { key: 'EMAIL', label: 'Email', available: isEnabled(user.featureFlags, 'email_enabled'), unavailableReason: 'no email provider is configured for your institution.' },
    { key: 'PUSH', label: 'Push', available: isEnabled(user.featureFlags, 'push_enabled'), unavailableReason: 'push notifications are not enabled for your institution.' },
    { key: 'SMS', label: 'SMS', available: isEnabled(user.featureFlags, 'sms_enabled'), unavailableReason: 'SMS is not part of your institution’s plan.' },
  ];
  const preferences = NOTIFICATION_CATEGORIES.flatMap((category) =>
    channels
      .filter((c) => c.available)
      .map((channel) => ({
        category,
        channel: channel.key,
        // No row means "not yet chosen"; the platform default is on.
        enabled: stored.find((p) => p.category === category && p.channel === channel.key)?.enabled ?? true,
      })),
  );
  return {
    categories: NOTIFICATION_CATEGORIES,
    channels,
    preferences,
    hasStored: stored.length > 0 || !!settings,
    initialSettings: {
      quietHoursEnabled: settings?.quietHoursEnabled ?? false,
      quietHoursStart: settings?.quietHoursStart ?? '22:00',
      quietHoursEnd: settings?.quietHoursEnd ?? '07:00',
      digestEnabled: settings?.digestEnabled ?? true,
    },
  };
}
