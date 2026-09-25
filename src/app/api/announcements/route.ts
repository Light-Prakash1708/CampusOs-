import { z } from 'zod';
import { withAuth, ok, parseBody } from '@/lib/api';
import { createAnnouncement, resolveAudience } from '@/services/communication';

const TargetSchema = z.object({
  scope: z.enum([
    'INSTITUTION', 'CAMPUS', 'DEPARTMENT', 'PROGRAM', 'YEAR', 'SECTION', 'COURSE', 'ROLE', 'USER',
  ]),
  campusId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  offeringId: z.string().uuid().optional(),
  year: z.number().int().min(1).max(8).optional(),
  role: z.string().max(40).optional(),
  userId: z.string().uuid().optional(),
  isExclusion: z.boolean().optional(),
});

const CreateBody = z.object({
  title: z.string().trim().min(5, 'Give the notice a clear title.').max(200),
  body: z.string().trim().min(10, 'Write the notice.').max(20_000),
  summary: z.string().trim().max(300).optional(),
  category: z.enum([
    'ACADEMIC', 'EXAMINATION', 'EVENT', 'ADMINISTRATIVE', 'HOLIDAY',
    'EMERGENCY', 'PLACEMENT', 'FACILITY', 'GENERAL',
  ]),
  priority: z.enum(['CRITICAL', 'IMPORTANT', 'NORMAL', 'INFORMATIONAL']),
  kind: z.enum(['OFFICIAL', 'INFORMATIONAL']),
  requiresAcknowledgement: z.boolean().optional(),
  acknowledgementDeadline: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  allowComments: z.boolean().optional(),
  isEmergencyBroadcast: z.boolean().optional(),
  targets: z.array(TargetSchema).min(1, 'Choose who this notice is for.'),
});

export const POST = withAuth(
  ['announcement:create_official', 'announcement:create_informational'],
  async (request, { user }) => {
    const input = await parseBody(request, CreateBody);
    const result = await createAnnouncement(user, {
      ...input,
      acknowledgementDeadline: input.acknowledgementDeadline
        ? new Date(input.acknowledgementDeadline)
        : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    return ok(result, { status: 201 });
  },
);

/** Dry-run audience resolution, so the composer can show reach before sending. */
export const PUT = withAuth(
  ['announcement:create_official', 'announcement:create_informational'],
  async (request, { user }) => {
    const input = await parseBody(request, z.object({ targets: z.array(TargetSchema) }));
    const audience = await resolveAudience(user.institutionId, input.targets);
    return ok({
      total: audience.userIds.length,
      breakdown: audience.breakdown,
      description: audience.description,
    });
  },
);
