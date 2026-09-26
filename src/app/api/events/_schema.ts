import { z } from 'zod';
import { EVENT_CATEGORIES } from '@/services/events';

/** Create and edit share one schema, so an edit is validated exactly like a new event. */
const categories = Object.keys(EVENT_CATEGORIES) as [string, ...string[]];
const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const EventBody = z
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
    onlineUrl: z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Use an http(s) link').nullable().optional(),
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
    // Covers must be uploaded to CampusOS: an external image URL would let its host
    // see every viewer's IP address (a tracking pixel across colleges).
    coverUrl: z.string().max(500).regex(/^\/api\/files\/[0-9a-f-]{36}$/, 'Upload the cover image to CampusOS.').nullable().optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: 'The event must end after it starts.', path: ['endsAt'] })
  .refine((v) => v.teamSizeMax >= v.teamSizeMin, { message: 'Maximum team size must be at least the minimum.', path: ['teamSizeMax'] })
  .refine((v) => v.mode === 'OFFLINE' || !!v.onlineUrl || v.mode === 'HYBRID', { message: 'Add the joining link for an online event.', path: ['onlineUrl'] });
