import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { Info, Palette } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { Alert, Button, Card, CardBody, CardHeader, PageHeader, Section } from '@/components/ui';
import { isEnabled } from '@/lib/features';
import { requireStudentContext } from '../_lib/auth';
import { SettingsForm, type ChannelOption, type PreferenceState } from './SettingsForm';
import { ThemePicker } from './ThemePicker';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

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
];

export default async function SettingsPage() {
  const user = await requireStudentContext();

  const [settings] = await db
    .select()
    .from(t.notificationSettings)
    .where(
      and(
        eq(t.notificationSettings.institutionId, user.institutionId),
        eq(t.notificationSettings.userId, user.userId),
      ),
    )
    .limit(1);

  const stored = await db
    .select({
      category: t.notificationPreferences.category,
      channel: t.notificationPreferences.channel,
      enabled: t.notificationPreferences.enabled,
    })
    .from(t.notificationPreferences)
    .where(
      and(
        eq(t.notificationPreferences.institutionId, user.institutionId),
        eq(t.notificationPreferences.userId, user.userId),
      ),
    );

  const channels: ChannelOption[] = [
    {
      key: 'IN_APP',
      label: 'In app',
      available: true,
      unavailableReason: '',
    },
    {
      key: 'EMAIL',
      label: 'Email',
      available: isEnabled(user.featureFlags, 'email_enabled'),
      unavailableReason: 'no email provider is configured for your institution.',
    },
    {
      key: 'PUSH',
      label: 'Push',
      available: isEnabled(user.featureFlags, 'push_enabled'),
      unavailableReason: 'push notifications are not enabled for your institution.',
    },
    {
      key: 'SMS',
      label: 'SMS',
      available: isEnabled(user.featureFlags, 'sms_enabled'),
      unavailableReason: 'SMS is not part of your institution’s plan.',
    },
  ];

  const preferences: PreferenceState[] = [];
  for (const category of CATEGORIES) {
    for (const channel of channels) {
      if (!channel.available) continue;
      const existing = stored.find((p) => p.category === category && p.channel === channel.key);
      preferences.push({
        category,
        channel: channel.key,
        // No row means "not yet chosen"; the platform default is on.
        enabled: existing?.enabled ?? true,
      });
    }
  }

  const hasStored = stored.length > 0 || !!settings;

  return (
    <>
      <PageHeader
        title="Settings"
        description="How CampusOS reaches you, and how it looks on this device."
      />

      {!hasStored ? (
        <Alert className="mb-5" tone="info" icon={Info} title="Using the platform defaults">
          You have not changed anything yet, so every category is on for the channels your
          institution has enabled. Saving writes your own preferences.
        </Alert>
      ) : null}

      <Section title="Notifications">
        <SettingsForm
          categories={CATEGORIES}
          channels={channels}
          initialPreferences={preferences}
          initialSettings={{
            quietHoursEnabled: settings?.quietHoursEnabled ?? false,
            quietHoursStart: settings?.quietHoursStart ?? '22:00',
            quietHoursEnd: settings?.quietHoursEnd ?? '07:00',
            digestEnabled: settings?.digestEnabled ?? true,
          }}
        />
      </Section>

      <Section title="Appearance">
        <Card>
          <CardHeader title="Theme" icon={Palette} />
          <CardBody>
            <ThemePicker />
          </CardBody>
        </Card>
      </Section>

      <Section title="Account">
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13.5px] font-medium text-default">{user.email}</p>
              <p className="text-[12.5px] text-muted">
                Your name, roll number and programme are maintained by the administration office.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href="/student/profile">View profile</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/student/readdressal/new?category=it-support">Report a problem</Link>
              </Button>
            </div>
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
