import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { createDepartment, createProgram, createSection } from '@/services/academic-structure';

const code = z.string().trim().min(1, 'Enter a short code.').max(20).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and hyphens only.');

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('department'), name: z.string().trim().min(2, 'Enter a name.').max(120), code, school: z.string().trim().max(120).nullable().optional() }),
  z.object({
    kind: z.literal('program'),
    departmentId: z.string().uuid('Choose a department.'),
    name: z.string().trim().min(2, 'Enter a name.').max(120),
    code,
    level: z.enum(['UG', 'PG', 'DIPLOMA', 'PHD', 'CERTIFICATE']),
    durationYears: z.coerce.number().int().min(1).max(6),
  }),
  z.object({
    kind: z.literal('section'),
    programId: z.string().uuid('Choose a programme.'),
    year: z.coerce.number().int().min(1).max(6),
    name: z.string().trim().min(1, 'Enter a name.').max(60),
    code,
  }),
]);

/** Add a department, programme or section to your college. */
export const POST = withAuth('academic:manage_structure', async (request, { user }) => {
  const body = await parseBody(request, Body);
  const meta = metaFrom(request);
  if (body.kind === 'department') return ok(await createDepartment(user, body, meta), { status: 201 });
  if (body.kind === 'program') return ok(await createProgram(user, body, meta), { status: 201 });
  return ok(await createSection(user, body, meta), { status: 201 });
});
