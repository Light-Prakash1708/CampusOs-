import { z } from 'zod';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { studentByRollNumber, addCommitteeMember, attestComposition, committeeStatus, listCommittee, removeCommitteeMember } from '@/services/grievance-committee';

/** SGRC and Ombudsperson membership (CAMPUSOS-011). */
export const GET = withAuth('grievance:configure', async (_request, { user }) => ok({ members: await listCommittee(user), status: await committeeStatus(user) }));

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    userId: z.string().uuid().optional(),
    /** For the student special invitee: their roll number instead of an id. */
    rollNumber: z.string().trim().min(1).max(60).optional(),
    body: z.enum(['SGRC', 'OMBUDSPERSON']),
    position: z.enum(['CHAIR', 'MEMBER', 'STUDENT_INVITEE', 'OMBUDSPERSON']),
    termEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  }),
  z.object({ action: z.literal('remove'), memberId: z.string().uuid() }),
  z.object({ action: z.literal('attest') }),
]);

export const POST = withAuth('grievance:configure', async (request, { user }) => {
  const input = await parseBody(request, Body);
  const meta = metaFrom(request);
  if (input.action === 'add') {
    const userId = input.userId ?? (input.rollNumber ? await studentByRollNumber(user.institutionId, input.rollNumber) : null);
    if (!userId) throw new AppError('Choose a person, or enter a student’s roll number.', 422, 'PERSON_REQUIRED');
    return ok(await addCommitteeMember(user, { ...input, userId }, meta));
  }
  if (input.action === 'remove') {
    await removeCommitteeMember(user, input.memberId, meta);
    return ok({ removed: true });
  }
  await attestComposition(user, meta);
  return ok({ attested: true });
});
