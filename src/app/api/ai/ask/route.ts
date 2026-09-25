import { z } from 'zod';
import { withAuth, ok, parseBody, requireFeatureEnabled } from '@/lib/api';
import { askInConversation } from '@/services/ai/conversations';
import { enforceRateLimit, keyFor, RATE_LIMITS } from '@/services/rate-limit';

/**
 * Ask the assistant. Earlier turns come from the stored conversation (never
 * from the client), so a request can't smuggle in a fake assistant history.
 * Without `conversationId` a new conversation starts.
 */
const Body = z.object({
  question: z.string().trim().min(2, 'Ask a question.').max(2000),
  conversationId: z.string().uuid().nullish(),
});

export const POST = withAuth('ai:use_assistant', async (request, { user }) => {
  requireFeatureEnabled(user, 'ai_assistant_enabled');
  const { question, conversationId } = await parseBody(request, Body);
  // Per-person ceiling on top of the institution's monthly budget, so one
  // account cannot exhaust the budget for everyone.
  const hourly = Number(process.env.AI_USER_HOURLY_LIMIT ?? RATE_LIMITS.aiPerUserHour.limit);
  await enforceRateLimit(
    keyFor('ai', user.userId),
    { limit: hourly, windowSec: RATE_LIMITS.aiPerUserHour.windowSec },
    'You have reached the hourly limit for the assistant.',
  );
  const turn = await askInConversation(user, question, { conversationId: conversationId ?? null, feature: user.portal === 'student' ? 'STUDENT_ASSISTANT' : 'CAMPUS_ASSISTANT' });
  return ok({ ...turn.answer, conversationId: turn.conversationId, actions: turn.actions });
});
