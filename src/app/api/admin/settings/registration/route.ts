import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { updateRegistrationPolicy } from '@/services/institution-settings';

const Body = z
  .object({
    mode: z.enum(['DISABLED', 'EMAIL_DOMAIN', 'ADMIN_APPROVAL']),
    allowedDomains: z
      .array(z.string().trim().toLowerCase().regex(/^@?[a-z0-9.-]+\.[a-z]{2,}$/, 'Enter a domain like college.edu.in'))
      .max(10)
      .optional(),
    isListed: z.boolean().optional(),
    idDocument: z.enum(['REQUIRED', 'OPTIONAL']).optional(),
  })
  .refine((v) => v.mode !== 'EMAIL_DOMAIN' || (v.allowedDomains?.length ?? 0) > 0, {
    message: 'Add at least one email domain for domain-verified registration.',
    path: ['allowedDomains'],
  });

export const PATCH = withAuth('institution:manage', async (request, { user }) => {
  const input = await parseBody(request, Body);
  return ok({ policy: await updateRegistrationPolicy(user, input, metaFrom(request)) });
});
