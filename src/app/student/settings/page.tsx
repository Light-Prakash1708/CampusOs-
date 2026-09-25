import Link from 'next/link';
import { Info, Palette } from 'lucide-react';
import { Alert, Button, Card, CardBody, CardHeader, PageHeader, Section } from '@/components/ui';
import { requireStudentContext } from '../_lib/auth';
import { SettingsForm } from './SettingsForm';
import { loadNotificationSettings } from '@/services/notification-settings';
import { ThemePicker } from './ThemePicker';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireStudentContext();
  const { categories, channels, preferences, hasStored, initialSettings } = await loadNotificationSettings(user);

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
          categories={categories}
          channels={channels}
          initialPreferences={preferences}
          initialSettings={initialSettings}
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
                <Link href="/student/redressal/new?category=it-support">Report a problem</Link>
              </Button>
            </div>
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
