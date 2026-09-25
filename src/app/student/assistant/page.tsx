import { PageHeader } from '@/components/ui';
import { isEnabled } from '@/lib/features';
import { requireStudentContext } from '../_lib/auth';
import {
  getAttendanceRows,
  getEnrolledOfferings,
} from '../_lib/student';
import { ModuleDisabled } from '../_components/bits';
import { Chat } from './Chat';

export const metadata = { title: 'AI Assistant' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireStudentContext('ai:use_assistant');

  if (!isEnabled(user.featureFlags, 'ai_assistant_enabled')) {
    return (
      <>
        <PageHeader title="AI Assistant" />
        <ModuleDisabled
          module="The AI Campus Assistant"
          blurb="Your institution has not enabled the assistant. Every other part of CampusOS works without it."
        />
      </>
    );
  }

  const { q } = await searchParams;

  // Suggestions are built from this student's real situation, so they are
  // always answerable rather than decorative.
  const [offerings, attendance] = await Promise.all([
    getEnrolledOfferings(user.institutionId, user.studentProfileId),
    getAttendanceRows(user.institutionId, user.studentProfileId),
  ]);

  const weakest = [...attendance]
    .filter((row) => row.heldSessions > 0)
    .sort((a, b) => a.percentageBp - b.percentageBp)[0];

  const suggestions = [
    'What classes do I have tomorrow, and where?',
    weakest
      ? `How many more classes of ${weakest.code} can I miss?`
      : 'How is my attendance across all subjects?',
    'What assignments are due in the next week?',
    offerings[0]
      ? `What has changed recently for ${offerings[0].code}?`
      : 'What has changed recently for my section?',
  ];

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="Grounded in your own records. Answers are labelled and cited, and the assistant cannot see other students' data."
      />
      <div className="mx-auto max-w-3xl">
        <Chat
          initialQuestion={(q ?? '').slice(0, 1000)}
          suggestions={suggestions}
          studentName={user.firstName}
        />
      </div>
    </>
  );
}
