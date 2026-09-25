import { ok, withAuth } from '@/lib/api';
import { listConsents } from '@/services/privacy';

export const GET = withAuth('privacy:manage_own', async (_request, { user }) => ok(await listConsents(user)));
