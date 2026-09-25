import { withAuth } from '@/lib/api';
import { appUrl } from '@/lib/env';
import { buildIcs } from '@/lib/ics';
import { getEvent } from '@/services/events';
import { parseId, requireEvents } from '../../_lib';

/**
 * "Add to calendar": an .ics file for one event the caller may see. The same
 * visibility rules as the event page apply (404 otherwise). The online joining
 * link is included only for people who are registered, as on the event page.
 */
export const GET = withAuth(null, async (_request, { user, params }) => {
  requireEvents(user);
  const d = await getEvent(user, parseId(params.id));
  const e = d.event;
  const registered = d.registration?.status === 'REGISTERED';
  const place = [d.venue, e.area, e.city].filter(Boolean).join(', ');
  const location = e.mode === 'ONLINE' ? (registered && e.onlineUrl ? e.onlineUrl : 'Online') : place;
  const body = buildIcs({
    uid: `${e.id}@campusos`,
    title: e.title,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    location: location || null,
    description: `${d.institutionName}${e.description ? `\n\n${e.description}` : ''}`,
    url: appUrl(`/events/${e.id}`),
    cancelled: e.status === 'CANCELLED',
    // Calendars replace an event when SEQUENCE grows: derive it from the last edit.
    sequence: Math.floor(e.updatedAt.getTime() / 1000),
    updatedAt: e.updatedAt,
  });
  const safeName = e.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'event';
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
