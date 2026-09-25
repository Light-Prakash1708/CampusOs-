import { Sparkles } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui';
import { AssistantChat } from './AssistantChat';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Campus Assistant · CampusOS' };

export default async function AdminAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission('ai:use_assistant');
  const { q } = await searchParams;

  const usingLanguageModel = (process.env.AI_PROVIDER ?? 'local') === 'anthropic'
    && !!process.env.ANTHROPIC_API_KEY;

  return (
    <div>
      <PageHeader
        title="AI Campus Assistant"
        description="Answers come from your institution's records, with the sources it used. It cannot change anything."
      />
      <AssistantChat
        initialQuestion={q ?? ''}
        usingLanguageModel={usingLanguageModel}
        suggestions={[
          'Which classrooms are underutilised?',
          'Show me the timetable conflicts',
          'Which faculty are above their contracted workload?',
          'Which grievance cases are approaching SLA?',
          'How many students are below the attendance requirement?',
        ]}
      />
    </div>
  );
}
