import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { createInstitution, INSTITUTION_TYPES, listInstitutions } from '@/services/institutions';

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Enter a domain like college.edu.in')
  .max(120);

const Body = z.object({
  name: z.string().trim().min(3, 'Enter the institution’s name.').max(160),
  shortName: z.string().trim().max(40).nullable().optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3–40 lowercase letters, digits or hyphens.'),
  institutionType: z.enum(INSTITUTION_TYPES).nullable().optional(),
  website: z.string().trim().url('Enter a full address, e.g. https://college.edu.in').max(200).refine((u) => /^https?:\/\//i.test(u), 'Use an http(s) address.').nullable().optional(),
  officialDomain: domain.nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  timezone: z.string().trim().min(3).max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown timezone.'),
  joinPolicy: z.enum(['INVITATION_ONLY', 'ADMIN_APPROVAL']),
  idDocument: z.enum(['REQUIRED', 'OPTIONAL']),
  listed: z.boolean(),
  modules: z.array(z.string().max(60)).max(40),
  admin: z.object({
    firstName: z.string().trim().min(1, 'Enter a first name.').max(80),
    lastName: z.string().trim().min(1, 'Enter a last name.').max(80),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
  }),
});

/** Platform operators only (checked in the service): list and create colleges. */
export const GET = withAuth(null, async (_request, { user }) => ok(await listInstitutions(user)));

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);
  const result = await createInstitution(user, { ...input, meta: metaFrom(request) });
  return ok(result, { status: 201 });
});
