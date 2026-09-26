import { ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { importFeed } from '@/services/opportunities';

/** Pull the configured feed; new items arrive as pending for approval. */
export const POST = withAuth('opportunity:manage', async (request, { user }) => ok(await importFeed(user, metaFrom(request))));
