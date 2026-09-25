import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { registerStudent } from '@/services/auth/accounts';

const Body = z.object({
  institutionSlug: z.string().trim().min(1, 'Choose your college.').max(80),
  firstName: z.string().trim().min(1, 'Enter your first name.').max(80),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
  password: z.string().min(1, 'Choose a password.').max(200),
  departmentId: z.string().uuid('Choose your department.'),
  programId: z.string().uuid('Choose your programme.'),
  sectionId: z.string().uuid().nullable().optional(),
  year: z.coerce.number().int().min(1).max(6),
  studentId: z
    .string()
    .trim()
    .min(2, 'Enter your student ID / roll number.')
    .max(40)
    .regex(/^[A-Za-z0-9/_.-]+$/, 'Use letters, numbers and / - _ . only.'),
});

export const POST = publicRoute(async (request) => {
  const input = await parseBody(request, Body);
  const result = await registerStudent({ ...input, meta: metaFrom(request) });
  return ok(result, { status: 202 });
});
