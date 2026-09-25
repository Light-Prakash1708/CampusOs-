import { z } from 'zod';
import { withAuth, ok, parseBody } from '@/lib/api';
import { askAssistant } from '@/services/ai/assistant';

const Body = z.object({
  question: z.string().trim().min(2, 'Ask a question.').max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(10)
    .optional(),
});

export const POST = withAuth('ai:use_assistant', async (request, { user }) => {
  const { question, history } = await parseBody(request, Body);
  const answer = await askAssistant(user, question, { history });
  return ok(answer);
});
