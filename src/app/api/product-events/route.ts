import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { track, type ProductEvent } from '@/services/product-events';

/**
 * Client-side product events. Only the handful of events that happen in the
 * browser (an outbound click, a card coming into view) are accepted here; the
 * rest are recorded server-side where the action succeeds. Identity always
 * comes from the session.
 */
const CLIENT_EVENTS = ['opportunity_opened', 'attention_signal_viewed', 'invite_link_copied'] as const satisfies readonly ProductEvent[];

const Body = z.object({
  event: z.enum(CLIENT_EVENTS),
  props: z.record(z.string().max(40), z.union([z.string().max(40), z.number(), z.boolean()])).optional(),
});

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);
  await enforceRateLimit(keyFor('product-events', user.userId), { limit: 240, windowSec: 3600 }, 'Too many events.');
  await track(user, input.event, input.props);
  return ok({ recorded: true });
});
