import { z } from 'zod';
import { OPPORTUNITY_KINDS } from '@/services/opportunities';

const opt = (max: number) => z.string().trim().max(max).nullish();

export const OpportunityBody = z.object({
  kind: z.enum(OPPORTUNITY_KINDS),
  title: z.string().trim().min(2, 'Give it a title').max(200),
  organization: z.string().trim().min(1, 'Who is offering it?').max(200),
  description: opt(5000),
  location: opt(200),
  workMode: z.enum(['ONSITE', 'REMOTE', 'HYBRID']).default('ONSITE'),
  compensation: opt(200),
  applyUrl: z
    .string()
    .trim()
    .url('Use a full link, e.g. https://…')
    .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links')
    .max(500)
    .nullish()
    .or(z.literal('').transform(() => null)),
  deadline: z.coerce.date().nullish(),
  eligibility: opt(2000),
  skills: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  departmentId: z.string().uuid().nullish(),
});
