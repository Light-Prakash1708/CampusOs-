import { idParam, ok, withAuth } from '@/lib/api';
import { cancelReservation } from '@/services/library';

/** Cancel my reservation (a held copy passes to the next person). */
export const DELETE = withAuth('library:borrow', async (_request, { user, params }) => ok(await cancelReservation(user, idParam(params.id, 'That reservation'))));
