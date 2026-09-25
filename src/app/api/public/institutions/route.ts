import { ok, publicRoute } from '@/lib/api';
import { listRegistrableInstitutions } from '@/services/public-directory';

export const dynamic = 'force-dynamic';

export const GET = publicRoute(async () => ok(await listRegistrableInstitutions()));
