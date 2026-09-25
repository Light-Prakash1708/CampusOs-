import { Info, Palette, Sparkles } from 'lucide-react';
import { requireAuth } from '@/lib/auth/context';
import { Alert, Card, CardBody, CardHeader, PageHeader, Section } from '@/components/ui';
import { isEnabled } from '@/lib/features';
import { loadNotificationSettings } from '@/services/notification-settings';
import { SettingsForm } from '@/app/student/settings/SettingsForm';
import { ThemePicker } from '@/app/student/settings/ThemePicker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

/**
 * Faculty settings: how CampusOS reaches you, how AI is configured at your
 * college (linked from the Teaching Copilot), and appearance.
 */
export default async function FacultySettingsPage() {
  const user = await requireAuth();
  const { categories, channels, preferences, hasStored, initialSettings } = await loadNotificationSettings(user);
  const provider = (process.env.AI_PROVIDER ?? 'local').toLowerCase();
  const copilotOn = isEnabled(user.featureFlags, 'teacher_copilot_enabled');

  return (
    <>
      <PageHeader title="Settings" description="Notifications, AI at your college, and how CampusOS looks on this device." />

      {!hasStored ? (
        <Alert className="mb-5" tone="info" icon={Info} title="Using the platform defaults">
          You haven’t changed anything yet, so every category is on for the channels your institution has enabled.
        </Alert>
      ) : null}

      <Section title="Notifications">
        <SettingsForm categories={categories} channels={channels} initialPreferences={preferences} initialSettings={initialSettings} />
      </Section>

      <Section title="AI at your college" id="ai">
        <Card>
          <CardHeader title="How AI is configured" icon={Sparkles} />
          <CardBody className="space-y-2 text-[13px] leading-relaxed text-muted">
            <p>
              <span className="font-semibold text-default">Engine: </span>
              {provider === 'anthropic'
                ? `A hosted language model (${process.env.AI_MODEL ?? 'configured model'}), called from the server with only the records needed for your request.`
                : 'CampusOS offline assistant — no external model is used; answers are built from your own CampusOS records.'}
            </p>
            <p>
              <span className="font-semibold text-default">Teaching Copilot: </span>
              {copilotOn ? 'switched on by your college.' : 'switched off by your college.'}
            </p>
            <p>
              Every lesson plan the copilot drafts is stored as <span className="font-semibold text-default">unreviewed AI output</span> until you publish it. Publishing
              records that you approved the content; nothing is shared with students before that.
            </p>
            <p>Your college’s administrators choose the engine and spending limits. Questions go to your IT or academic office.</p>
          </CardBody>
        </Card>
      </Section>

      <Section title="Appearance">
        <Card>
          <CardHeader title="Theme" icon={Palette} />
          <CardBody>
            <ThemePicker />
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
