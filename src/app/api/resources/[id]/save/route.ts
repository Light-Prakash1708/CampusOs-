import { idParam, ok, withAuth } from '@/lib/api';
import { setResourceSaved } from '@/services/resources';

/** Bookmark a resource you can see (notes, PYQs, slides …). */
export const POST = withAuth('resource:view_department', async (_request, { user, params }) => ok(await setResourceSaved(user, idParam(params.id, 'That resource'), true)));

export const DELETE = withAuth('resource:view_department', async (_request, { user, params }) => ok(await setResourceSaved(user, idParam(params.id, 'That resource'), false)));
