import { z } from 'zod';
import { idParam, ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { returnLoan } from '@/services/library';

const Body = z.object({ waiveFine: z.boolean().optional(), waiveReason: z.string().max(300).nullish() });

export const POST = withAuth('library:manage', async (request, { user, params }) => {
  const input = await parseBody(request, Body);
  return ok(await returnLoan(user, idParam(params.id, 'That loan'), input, metaFrom(request)));
});
