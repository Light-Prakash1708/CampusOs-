import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';
import { getRequestMetadata } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { createAnnouncement } from '@/services/communication';

/**
 * Informational notices from a faculty member to their own sections.
 *
 * The capability check (`announcement:create_informational`) says they may
 * write notices; this route additionally restricts the audience to sections
 * they actually teach, which the capability alone does not express. An
 * OFFICIAL notice is refused outright here — that requires
 * `announcement:create_official`, which faculty do not hold, and it is a
 * different product surface.
 */

const Body = z.object({
  title: z.string().trim().min(5, 'Give the notice a clear title.').max(200),
  body: z.string().trim().min(10, 'Write the notice body.').max(8000),
  category: z.enum(['ACADEMIC', 'EVENT', 'GENERAL', 'EXAMINATION', 'PLACEMENT', 'FACILITY']),
  sectionIds: z.array(z.string().uuid()).min(1, 'Choose at least one section.').max(20),
  requiresAcknowledgement: z.boolean().default(false),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const POST = withAuth('announcement:create_informational', async (request, { user }) => {
  const input = await parseBody(request, Body);

  if (!user.facultyProfileId) {
    throw new AppError(
      'Your account has no faculty record, so it has no sections to address.',
      403,
      'NO_FACULTY_PROFILE',
    );
  }

  // Only sections the caller teaches this term may be addressed.
  const mySections = await db
    .selectDistinct({ sectionId: t.courseOfferings.sectionId })
    .from(t.courseOfferings)
    .where(
      and(
        eq(t.courseOfferings.institutionId, user.institutionId),
        eq(t.courseOfferings.isActive, true),
        isNull(t.courseOfferings.deletedAt),
        or(
          eq(t.courseOfferings.facultyId, user.facultyProfileId),
          eq(t.courseOfferings.secondaryFacultyId, user.facultyProfileId),
        ),
        inArray(t.courseOfferings.sectionId, input.sectionIds),
      ),
    );

  const allowed = new Set(mySections.map((s) => s.sectionId));
  const disallowed = input.sectionIds.filter((id) => !allowed.has(id));
  if (disallowed.length > 0) {
    throw new AppError(
      'You can only address sections you teach.',
      403,
      'SECTION_NOT_TAUGHT',
      { sectionIds: disallowed },
      'Reload the page — your class allocations may have changed.',
    );
  }

  const result = await createAnnouncement(user, {
    title: input.title,
    body: input.body,
    category: input.category,
    priority: 'INFORMATIONAL',
    kind: 'INFORMATIONAL',
    requiresAcknowledgement: input.requiresAcknowledgement,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    targets: input.sectionIds.map((sectionId) => ({
      scope: 'SECTION' as const,
      sectionId,
    })),
  });

  const meta = await getRequestMetadata();
  await recordAudit(user, {
    action: 'ANNOUNCEMENT_CREATED',
    entityType: 'announcement',
    entityId: result.id,
    after: {
      reference: result.reference,
      kind: 'INFORMATIONAL',
      recipients: result.recipients,
      sections: input.sectionIds.length,
    },
    ...meta,
  });

  return ok(result);
});

export const dynamic = 'force-dynamic';
