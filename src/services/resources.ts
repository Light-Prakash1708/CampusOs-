import 'server-only';
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';

/**
 * RESOURCE HUB — student-facing reads and bookmarks.
 * ---------------------------------------------------------------------------
 * One visibility rule for every student view of resources (the Resources
 * page, the Library's notes/PYQs/saved tabs, bookmarks): published material
 * that is institution-wide, from the student's own department, or shared with
 * their section. Nothing else — AI drafts stay hidden until approved.
 */

export function studentResourceVisibility(ctx: Pick<AuthContext, 'institutionId' | 'departmentId' | 'sectionId'>): SQL {
  const visibility: SQL[] = [eq(t.resources.visibility, 'INSTITUTION')];
  if (ctx.departmentId) {
    visibility.push(and(eq(t.resources.visibility, 'DEPARTMENT'), eq(t.resources.departmentId, ctx.departmentId)) as SQL);
  }
  if (ctx.sectionId) {
    visibility.push(
      and(
        eq(t.resources.visibility, 'SECTION'),
        inArray(t.resources.id, db.select({ id: t.resourceShares.resourceId }).from(t.resourceShares).where(eq(t.resourceShares.sectionId, ctx.sectionId))),
      ) as SQL,
    );
  }
  return and(eq(t.resources.institutionId, ctx.institutionId), eq(t.resources.status, 'PUBLISHED'), isNull(t.resources.deletedAt), or(...visibility))!;
}

export type ResourceKind = (typeof t.resources.kind.enumValues)[number];

export async function listStudentResources(
  ctx: AuthContext,
  opts: { q?: string; kinds?: ResourceKind[]; subjectIds?: string[]; savedOnly?: boolean; limit?: number } = {},
) {
  const conds: SQL[] = [studentResourceVisibility(ctx)];
  const q = opts.q?.trim();
  if (q) conds.push(sql`${t.resources.searchVector} @@ plainto_tsquery('english', ${q})`);
  if (opts.kinds?.length) conds.push(inArray(t.resources.kind, opts.kinds));
  if (opts.subjectIds?.length) conds.push(inArray(t.resources.subjectId, opts.subjectIds));
  if (opts.savedOnly) conds.push(sql`${t.resourceSaves.id} IS NOT NULL`);
  const rows = await db
    .select({
      id: t.resources.id,
      title: t.resources.title,
      description: t.resources.description,
      kind: t.resources.kind,
      fileUrl: t.resources.fileUrl,
      externalUrl: t.resources.externalUrl,
      academicYear: t.resources.academicYear,
      semester: t.resources.semester,
      createdAt: t.resources.createdAt,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      savedAt: t.resourceSaves.createdAt,
    })
    .from(t.resources)
    .leftJoin(t.subjects, eq(t.subjects.id, t.resources.subjectId))
    .leftJoin(t.resourceSaves, and(eq(t.resourceSaves.resourceId, t.resources.id), eq(t.resourceSaves.userId, ctx.userId)))
    .where(and(...conds))
    .orderBy(opts.savedOnly ? desc(t.resourceSaves.createdAt) : desc(t.resources.createdAt))
    .limit(Math.min(opts.limit ?? 60, 200));
  return rows.map((r) => ({ ...r, saved: !!r.savedAt }));
}

/** Bookmark or un-bookmark a resource the student can see. Idempotent. */
export async function setResourceSaved(ctx: AuthContext, resourceId: string, saved: boolean) {
  if (!isEnabled(ctx.featureFlags, 'resource_hub_enabled')) throw new AppError('The Resource Hub is switched off at your college.', 404, 'FEATURE_DISABLED');
  await enforceRateLimit(keyFor('resource:save', ctx.userId), { limit: 300, windowSec: 3600 }, 'Too many changes. Try again shortly.');
  const [visible] = await db.select({ id: t.resources.id }).from(t.resources).where(and(eq(t.resources.id, resourceId), studentResourceVisibility(ctx))).limit(1);
  if (!visible) throw new NotFoundError('Resource');
  if (saved) {
    await db.insert(t.resourceSaves).values({ institutionId: ctx.institutionId, userId: ctx.userId, resourceId }).onConflictDoNothing();
  } else {
    await db.delete(t.resourceSaves).where(and(eq(t.resourceSaves.userId, ctx.userId), eq(t.resourceSaves.resourceId, resourceId)));
  }
  return { saved };
}

/**
 * Which resources a person may see, by role. Students: the student rule above.
 * Staff: their own material; plus published material that is institution-wide,
 * for their department, or shared with a section they teach. Holders of
 * resource:view_institution see all published, non-private material; holders
 * of resource:manage_all see everything at their college.
 */
export function resourceVisibilityFor(ctx: AuthContext): SQL {
  if (ctx.portal === 'student') return studentResourceVisibility(ctx);
  const base = and(eq(t.resources.institutionId, ctx.institutionId), isNull(t.resources.deletedAt))!;
  if (ctx.permissions.has('resource:manage_all')) return base;
  const own = eq(t.resources.ownerId, ctx.userId);
  const published = eq(t.resources.status, 'PUBLISHED');
  if (ctx.permissions.has('resource:view_institution')) {
    return and(base, or(own, and(published, sql`${t.resources.visibility} <> 'PRIVATE'`)))!;
  }
  const visible: SQL[] = [eq(t.resources.visibility, 'INSTITUTION')];
  if (ctx.departmentId) visible.push(and(eq(t.resources.visibility, 'DEPARTMENT'), eq(t.resources.departmentId, ctx.departmentId))!);
  if (ctx.facultyProfileId) {
    visible.push(
      and(
        eq(t.resources.visibility, 'SECTION'),
        inArray(
          t.resources.id,
          db
            .select({ id: t.resourceShares.resourceId })
            .from(t.resourceShares)
            .innerJoin(t.courseOfferings, eq(t.courseOfferings.sectionId, t.resourceShares.sectionId))
            .where(or(eq(t.courseOfferings.facultyId, ctx.facultyProfileId), eq(t.courseOfferings.secondaryFacultyId, ctx.facultyProfileId))),
        ),
      )!,
    );
  }
  return and(base, or(own, and(published, or(...visible))))!;
}
