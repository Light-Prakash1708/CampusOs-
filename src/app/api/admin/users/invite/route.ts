import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { ROLE_PERMISSIONS, type Role } from '@/lib/auth/permissions';
import { inviteUser } from '@/services/auth/accounts';

const roles = Object.keys(ROLE_PERMISSIONS) as [Role, ...Role[]];

const Body = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  firstName: z.string().trim().min(1, 'Enter a first name.').max(80),
  lastName: z.string().trim().min(1, 'Enter a last name.').max(80),
  role: z.enum(roles),
  departmentId: z.string().uuid().nullable().optional(),
  programId: z.string().uuid().nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
  year: z.coerce.number().int().min(1).max(6).nullable().optional(),
  rollNumber: z.string().trim().max(40).nullable().optional(),
  employeeCode: z.string().trim().max(40).nullable().optional(),
  designation: z.string().trim().max(80).nullable().optional(),
});

export const POST = withAuth('user:invite', async (request, { user }) => {
  const input = await parseBody(request, Body);
  const result = await inviteUser(user, { ...input, meta: metaFrom(request) });
  return ok(result, { status: 201 });
});
