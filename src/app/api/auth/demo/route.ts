import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { startSession } from '@/lib/auth/session';
import { portalForRole } from '@/lib/auth/permissions';
import { beginDemo } from '@/services/demo';

const Body = z.object({ role: z.enum(['student', 'faculty', 'admin']) });

/** "Try the demo": a session in the isolated demo college. Off unless DEMO_TENANT_ENABLED=true. */
export const POST = publicRoute(async (request) => {
  const { role } = await parseBody(request, Body);
  const meta = metaFrom(request);
  const account = await beginDemo(role, meta);
  await startSession(account, meta);
  return ok({ redirectTo: `/${portalForRole(account.role)}` });
});
