import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { listEvents, EVENT_CATEGORIES } from '@/services/events';
import { createEvent } from '@/services/events/organizer';
import { requireEvents } from './_lib';

const Query = z.object({
  tab: z.string().max(30).optional(),
  q: z.string().max(120).optional(),
  city: z.string().max(60).optional(),
  mode: z.enum(['OFFLINE', 'ONLINE', 'HYBRID']).optional(),
  free: z.enum(['1', 'true']).optional(),
  certificate: z.enum(['1', 'true']).optional(),
  when: z.enum(['today', 'weekend', 'week', 'month', 'upcoming', 'past']).optional(),
  mine: z.enum(['registered', 'saved', 'college']).optional(),
  radiusKm: z.coerce.number().int().min(1).max(500).optional(),
  sort: z.enum(['relevance', 'date']).optional(),
});

/** Discovery feed (the same query the Events page renders). */
export const GET = withAuth(null, async (request, { user }) => {
  requireEvents(user);
  const q = Query.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(await listEvents(user, { ...q, free: !!q.free, certificate: !!q.certificate }));
});

const categories = Object.keys(EVENT_CATEGORIES) as [string, ...string[]];
const text = (max: number) => z.string().trim().max(max).nullable().optional();

const Create = z
  .object({
    title: z.string().trim().min(4, 'Give the event a clear name.').max(140),
    description: text(5000),
    category: z.enum(categories),
    visibility: z.enum(['INSTITUTION', 'PUBLIC']).default('INSTITUTION'),
    organizerName: text(120),
    mode: z.enum(['OFFLINE', 'ONLINE', 'HYBRID']).default('OFFLINE'),
    venueText: text(200),
    city: text(80),
    area: text(80),
    onlineUrl: z.string().url().max(500).nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    capacity: z.coerce.number().int().positive().max(100_000).nullable().optional(),
    registrationRequired: z.boolean().default(true),
    registrationDeadline: z.coerce.date().nullable().optional(),
    registrationMode: z.enum(['INSTANT', 'APPROVAL', 'INVITE_ONLY']).default('INSTANT'),
    waitlistEnabled: z.boolean().default(true),
    priceInr: z.coerce.number().int().min(0).max(100_000).default(0),
    certificateOffered: z.boolean().default(false),
    teamSizeMin: z.coerce.number().int().min(1).max(20).default(1),
    teamSizeMax: z.coerce.number().int().min(1).max(20).default(1),
    eligibility: text(1000),
    rules: text(5000),
    prizes: text(2000),
    agenda: z.array(z.object({ time: z.string().trim().max(40), title: z.string().trim().max(160) })).max(30).optional(),
    faqs: z.array(z.object({ q: z.string().trim().max(200), a: z.string().trim().max(1000) })).max(20).optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
    contactEmail: z.string().email().max(200).nullable().optional(),
    coverUrl: z.string().max(500).regex(/^(\/api\/files\/[0-9a-f-]{36}|https:\/\/.+)$/, 'Upload a cover or use an https link.').nullable().optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: 'The event must end after it starts.', path: ['endsAt'] })
  .refine((v) => v.teamSizeMax >= v.teamSizeMin, { message: 'Maximum team size must be at least the minimum.', path: ['teamSizeMax'] })
  .refine((v) => v.mode === 'OFFLINE' || !!v.onlineUrl || v.mode === 'HYBRID', { message: 'Add the joining link for an online event.', path: ['onlineUrl'] });

export const POST = withAuth('event:create', async (request, { user }) => {
  requireEvents(user);
  const input = await parseBody(request, Create);
  return ok(await createEvent(user, input, metaFrom(request)), { status: 201 });
});
