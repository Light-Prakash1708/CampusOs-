import { idParam, withAuth } from '@/lib/api';
import { privateFileResponse } from '@/lib/file-response';
import { readVerificationDocument } from '@/services/membership';

export const runtime = 'nodejs';

/** A reviewer's view of the college ID on an open request to their college (audited). */
export const GET = withAuth('user:approve_registration', async (_request, { user, params }) =>
  privateFileResponse(await readVerificationDocument(user, idParam(params.id, 'That request'))),
);
