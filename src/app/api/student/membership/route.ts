import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { createMembershipRequest, getMyMembership } from '@/services/membership';

/**
 * Asking a college to take you in. The college is named by its public slug;
 * everything else is validated against that college on the server, and no
 * field here can choose a role or grant membership.
 */
const Body = z.object({
  institutionSlug: z.string().trim().min(1, 'Choose your college.').max(80),
  departmentId: z.string().uuid('Choose your department.'),
  programId: z.string().uuid('Choose your programme.'),
  sectionId: z.string().uuid().nullable().optional(),
  year: z.coerce.number().int().min(1).max(8),
  rollNumber: z
    .string()
    .trim()
    .min(2, 'Enter your student ID / roll number.')
    .max(40)
    .regex(/^[A-Za-z0-9/_.-]+$/, 'Use letters, numbers and / - _ . only.'),
  documentFileId: z.string().uuid().nullable().optional(),
});

export const GET = withAuth(null, async (_request, { user }) => ok(await getMyMembership(user)));

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);
  return ok(await createMembershipRequest(user, { ...input, meta: metaFrom(request) }), { status: 201 });
});
