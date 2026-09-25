import { z } from 'zod';
import { ok, publicRoute } from '@/lib/api';
import { getRegistrationStructure } from '@/services/public-directory';

export const dynamic = 'force-dynamic';

export const GET = publicRoute(async (_request, { params }) => {
  const slug = z.string().trim().min(1).max(80).parse(params.slug);
  return ok(await getRegistrationStructure(slug));
});
