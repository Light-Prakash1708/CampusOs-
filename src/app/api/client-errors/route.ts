import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { clientIp } from '@/lib/http';
import { reportError } from '@/lib/logger';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';

const Body = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).optional(),
  route: z.string().max(200).optional(),
});

/**
 * Crash reports from the browser's error boundaries. Public (the boundary
 * may be on the sign-in page) but rate-limited per IP, and it accepts only a
 * message, the server's error digest and the route — nothing personal.
 */
export const POST = publicRoute(async (request) => {
  await enforceRateLimit(keyFor('client-error', clientIp(request.headers)), { limit: 30, windowSec: 600 }, 'Too many error reports.');
  const body = await parseBody(request, Body);
  const route = body.route?.split('?')[0];
  reportError(new Error(`client: ${body.message}`), { where: 'client', digest: body.digest, route });
  return ok({ received: true });
});
