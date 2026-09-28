import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { submitCollegeRequest } from '@/services/college-requests';

export const dynamic = 'force-dynamic';

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

/**
 * "Register your college." Public and rate-limited. Stores a request for the
 * CampusOS team; it creates no account and grants no role (see the service).
 */
const Body = z.object({
  collegeName: z.string().trim().min(3, 'Enter the college’s name.').max(160),
  university: optionalText(160),
  city: z.string().trim().min(2, 'Enter the city.').max(80),
  website: optionalText(200).refine((v) => !v || /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v), 'Enter a website like snuniv.ac.in.'),
  contactName: z.string().trim().min(2, 'Enter your name.').max(120),
  contactEmail: z.string().trim().email('Enter a valid email address.').max(200),
  contactRole: z.string().trim().min(2, 'Tell us your role at the college.').max(120),
  studentCount: z.coerce.number().int().min(1).max(200000).nullish(),
  message: optionalText(1000),
  // Honeypot: real visitors never see or fill this field.
  company: z.string().max(0).optional(),
});

export const POST = publicRoute(async (request) => {
  const { company: _honeypot, ...input } = await parseBody(request, Body);
  return ok(await submitCollegeRequest(input, metaFrom(request)), { status: 201 });
});
