import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';
import { fileUrl } from '@/services/storage';

/**
 * Creating a resource record — backed either by an external link or by a file
 * the same user uploaded through POST /api/files (purpose RESOURCE). A file can
 * back only one resource, and only its uploader can attach it.
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
  externalUrl: z.string().url('Enter a full URL, including https://').max(2000).optional(),
  /** A file previously uploaded via POST /api/files with purpose RESOURCE. */
  fileId: z.string().uuid().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  topic: z.string().trim().max(160).optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).nullable().optional(),
  visibility: z.enum(['PRIVATE', 'DEPARTMENT', 'INSTITUTION']),
  tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  publish: z.boolean().default(true),
}).refine((v) => !!v.externalUrl !== !!v.fileId, {
  message: 'Add either a link or an uploaded file.',
  path: ['externalUrl'],
});

export const POST = withAuth('resource:upload', async (request, { user }) => {
  const input = await parseBody(request, Body);

  let file: { url: string; name: string; size: number; mime: string } | null = null;
  if (input.fileId) {
    const [stored] = await db
      .select()
      .from(t.storedFiles)
      .where(
        and(
          eq(t.storedFiles.id, input.fileId),
          eq(t.storedFiles.institutionId, user.institutionId),
          eq(t.storedFiles.ownerId, user.userId),
          eq(t.storedFiles.purpose, 'RESOURCE'),
          isNull(t.storedFiles.deletedAt),
        ),
      )
      .limit(1);
    if (!stored) throw new AppError('That upload was not found. Upload the file again.', 400, 'BAD_FILE');
    const [attached] = await db
      .select({ id: t.resources.id })
      .from(t.resources)
      .where(and(eq(t.resources.institutionId, user.institutionId), eq(t.resources.fileUrl, fileUrl(stored.id))))
      .limit(1);
    if (attached) throw new AppError('That file is already attached to another resource.', 409, 'FILE_IN_USE');
    file = { url: fileUrl(stored.id), name: stored.originalName, size: stored.sizeBytes, mime: stored.mimeType };
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
        externalUrl: input.externalUrl ?? null,
        fileUrl: file?.url ?? null,
        fileName: file?.name ?? null,
        fileSizeBytes: file?.size ?? null,
        mimeType: file?.mime ?? null,
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
