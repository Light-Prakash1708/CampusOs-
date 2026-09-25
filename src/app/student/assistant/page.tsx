import { PageHeader } from '@/components/ui';
import { isEnabled } from '@/lib/features';
import { requireStudentContext } from '../_lib/auth';
import {
  getAttendanceRows,
  getEnrolledOfferings,
} from '../_lib/student';
import { ModuleDisabled } from '../_components/bits';
import { Chat, type Turn } from './Chat';
import { getAiProvider } from '@/services/ai/providers';
import { getConversation, listConversations } from '@/services/ai/conversations';
import { actionAvailable } from '@/services/ai/actions';

export const metadata = { title: 'AI Assistant' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; c?: string }>;
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

  const { q, c } = await searchParams;
  const [conversations, opened] = await Promise.all([
    listConversations(user),
    c && /^[0-9a-f-]{36}$/i.test(c) ? getConversation(user, c).catch(() => null) : Promise.resolve(null),
  ]);
  const initialConversation = opened
    ? {
        id: opened.id,
        turns: opened.messages.map(
          (m): Turn => ({ id: m.id, role: m.role, text: m.content, citations: m.citations, toolsUsed: m.toolsUsed, grounded: m.grounded, actions: m.actions }),
        ),
      }
    : null;
  // Only offer changes this student can actually confirm.
  const actionSuggestions = [
    actionAvailable(user, 'create_task') ? 'Add a task to email the placement cell tomorrow' : null,
    actionAvailable(user, 'renew_library_loan') ? 'Renew my library book' : null,
  ].filter((x): x is string => !!x);

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
        description="Grounded in your own records. Answers are cited, it can’t see other students’ data, and it only changes something after you confirm."
      />
      <div className="mx-auto max-w-5xl">
        <Chat
          key={initialConversation?.id ?? 'new'}
          initialQuestion={(q ?? '').slice(0, 1000)}
          suggestions={suggestions}
          actionSuggestions={actionSuggestions}
          studentName={user.firstName}
          conversations={conversations.map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt.toISOString() }))}
          initialConversation={initialConversation}
          usingLanguageModel={getAiProvider().isLanguageModel}
        />
      </div>
    </>
  );
}
