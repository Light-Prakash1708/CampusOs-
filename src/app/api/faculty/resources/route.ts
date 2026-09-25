import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';
import { STORAGE_AVAILABLE, STORAGE_LIMITATION } from '../_lib/storage';

/**
 * Creating a resource record.
 *
 * Only link-backed resources can be created here: this build has no storage
 * adapter, so accepting a file would produce a row pointing at nothing. The
 * limitation is surfaced in the UI rather than papered over, and the route
 * refuses a file payload outright instead of pretending it stored one.
 */

const Body = z.object({
  title: z.string().trim().min(3, 'Give the resource a title.').max(200),
  description: z.string().trim().max(2000).optional(),
  kind: z.enum([
    'DOCUMENT',
    'SLIDES',
    'SPREADSHEET',
    'VIDEO',
    'LINK',
    'IMAGE',
    'NOTES',
    'QUESTION_BANK',
    'LESSON_PLAN',
    'OTHER',
  ]),
  externalUrl: z.string().url('Enter a full URL, including https://').max(2000),
  subjectId: z.string().uuid().nullable().optional(),
  topic: z.string().trim().max(160).optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).nullable().optional(),
  visibility: z.enum(['PRIVATE', 'DEPARTMENT', 'INSTITUTION']),
  tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  publish: z.boolean().default(true),
  /** Present only if a client tried to send a file. Always rejected here. */
  hasFile: z.boolean().optional(),
});

export const POST = withAuth('resource:upload', async (request, { user }) => {
  const input = await parseBody(request, Body);

  if (input.hasFile && !STORAGE_AVAILABLE) {
    throw new AppError(
      'File uploads are not available in this deployment.',
      501,
      'STORAGE_NOT_CONFIGURED',
      undefined,
      STORAGE_LIMITATION,
    );
  }

  if (input.subjectId) {
    const [subject] = await db
      .select({ id: t.subjects.id })
      .from(t.subjects)
      .where(
        and(
          eq(t.subjects.institutionId, user.institutionId),
          eq(t.subjects.id, input.subjectId),
        ),
      )
      .limit(1);
    if (!subject) {
      throw new AppError('That subject does not exist at your institution.', 400, 'BAD_SUBJECT');
    }
  }

  const publishing = input.publish && user.permissions.has('resource:publish');

  const created = await db.transaction(async (tx) => {
    const [resource] = await tx
      .insert(t.resources)
      .values({
        institutionId: user.institutionId,
        title: input.title,
        description: input.description ?? null,
        kind: input.kind,
        status: publishing ? 'PUBLISHED' : 'DRAFT',
        externalUrl: input.externalUrl,
        ownerId: user.userId,
        departmentId: user.departmentId,
        subjectId: input.subjectId ?? null,
        topic: input.topic ?? null,
        difficulty: input.difficulty ?? null,
        visibility: input.visibility,
        isAiGenerated: false,
        approvedById: publishing ? user.userId : null,
        approvedAt: publishing ? new Date() : null,
      })
      .returning({ id: t.resources.id });

    if (!resource) throw new AppError('The resource could not be saved.', 500);

    if (input.tags.length > 0) {
      await tx.insert(t.resourceTags).values(
        input.tags.map((tag) => ({
          institutionId: user.institutionId,
          resourceId: resource.id,
          tag,
          source: 'MANUAL',
        })),
      );
    }

    return resource;
  });

  return ok({
    id: created.id,
    status: publishing ? 'PUBLISHED' : 'DRAFT',
    searchable: publishing,
  });
});

export const dynamic = 'force-dynamic';
