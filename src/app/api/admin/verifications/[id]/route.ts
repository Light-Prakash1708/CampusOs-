import { z } from 'zod';
import { idParam, ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { decideMembershipRequest, REJECTION_REASONS, startReview, type RejectionReason } from '@/services/membership';

const reasons = Object.keys(REJECTION_REASONS) as [RejectionReason, ...RejectionReason[]];

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('START_REVIEW') }),
  z.object({ action: z.literal('APPROVE') }),
  z.object({ action: z.literal('REJECT'), reason: z.enum(reasons), note: z.string().max(1000).nullable().optional() }),
]);

export const POST = withAuth('user:approve_registration', async (request, { user, params }) => {
  const id = idParam(params.id, 'That request');
  const body = await parseBody(request, Body);
  const meta = metaFrom(request);
  if (body.action === 'START_REVIEW') return ok(await startReview(user, id, meta));
  if (body.action === 'APPROVE') return ok(await decideMembershipRequest(user, id, { decision: 'APPROVE' }, meta));
  return ok(await decideMembershipRequest(user, id, { decision: 'REJECT', reason: body.reason, note: body.note }, meta));
});
