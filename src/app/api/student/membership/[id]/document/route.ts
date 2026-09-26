import { idParam, withAuth } from '@/lib/api';
import { privateFileResponse } from '@/lib/file-response';
import { readVerificationDocument } from '@/services/membership';

export const runtime = 'nodejs';

/** The student's own college ID on their request. */
export const GET = withAuth(null, async (_request, { user, params }) =>
  privateFileResponse(await readVerificationDocument(user, idParam(params.id, 'That request'))),
);
