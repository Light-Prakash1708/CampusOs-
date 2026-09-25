import { z } from 'zod';
import { withAuth, ok, parseBody } from '@/lib/api';
import { askAssistant } from '@/services/ai/assistant';
import { enforceRateLimit, keyFor, RATE_LIMITS } from '@/services/rate-limit';

const Body = z.object({
  question: z.string().trim().min(2, 'Ask a question.').max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(10)
    .optional(),
});

export const POST = withAuth('ai:use_assistant', async (request, { user }) => {
  const { question, history } = await parseBody(request, Body);
  // Per-person ceiling on top of the institution's monthly budget, so one
  // account cannot exhaust the budget for everyone.
  const hourly = Number(process.env.AI_USER_HOURLY_LIMIT ?? RATE_LIMITS.aiPerUserHour.limit);
  await enforceRateLimit(
    keyFor('ai', user.userId),
    { limit: hourly, windowSec: RATE_LIMITS.aiPerUserHour.windowSec },
    'You have reached the hourly limit for the assistant.',
  );
  const answer = await askAssistant(user, question, { history });
  return ok(answer);
});
