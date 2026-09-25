import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { issueCertificates } from '@/services/events/organizer';
import { parseId, requireEvents } from '../../_lib';

const Body = z.object({
  kind: z.enum(['PARTICIPATION', 'WINNER', 'RUNNER_UP', 'VOLUNTEER', 'ORGANISER']).default('PARTICIPATION'),
  registrationIds: z.array(z.string().uuid()).max(5000).optional(),
});

export const POST = withAuth(['event:create', 'event:approve'], async (request, { user, params }) => {
  requireEvents(user);
  return ok(await issueCertificates(user, parseId(params.id), await parseBody(request, Body), metaFrom(request)));
});
