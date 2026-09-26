import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { z } from 'zod';
import { and, eq, desc, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { withAuth, ok, parseBody } from '@/lib/api';
import { createGrievance } from '@/services/grievance';

const CreateBody = z.object({
  categoryId: z.string().uuid('Choose a category.'),
  subject: z.string().trim().min(5, 'Give the issue a short, clear subject.').max(200),
  description: z.string().trim().min(20, 'Describe what happened in at least 20 characters.').max(5000),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional(),
  isAnonymous: z.boolean().optional(),
  preferredContactMethod: z.enum(['IN_APP', 'EMAIL', 'PHONE']).optional(),
  relatedEntityType: z.string().max(60).optional(),
  relatedEntityId: z.string().uuid().optional(),
});

export const POST = withAuth('grievance:raise', async (request, { user }) => {
  await enforceRateLimit(keyFor('grievance:raise', user.userId), { limit: 20, windowSec: 86400 }, 'Too many requests. Please wait a little and try again.');
  const input = await parseBody(request, CreateBody);
  const result = await createGrievance(user, input);
  return ok(result, { status: 201 });
});

/** Lists cases visible to the caller. Scope is decided by capability, not by query string. */
export const GET = withAuth('grievance:view_own', async (request, { user }) => {
  const url = new URL(request.url);
  const onlyOpen = url.searchParams.get('open') === 'true';

  const OPEN: (typeof t.grievances.$inferSelect)['status'][] = [
    'SUBMITTED', 'ACKNOWLEDGED', 'ASSIGNED', 'UNDER_REVIEW', 'AWAITING_INFORMATION', 'REOPENED',
  ];

  const scope = user.permissions.has('grievance:view_all')
    ? sql`true`
    : user.permissions.has('grievance:view_assigned')
      ? or(eq(t.grievances.assignedToId, user.userId), eq(t.grievances.raisedById, user.userId))
      : eq(t.grievances.raisedById, user.userId);

  const rows = await db
    .select({
      id: t.grievances.id,
      caseNumber: t.grievances.caseNumber,
      subject: t.grievances.subject,
      status: t.grievances.status,
      urgency: t.grievances.urgency,
      category: t.grievanceCategories.name,
      createdAt: t.grievances.createdAt,
      resolutionDueAt: t.grievances.resolutionDueAt,
      isSlaBreached: t.grievances.isSlaBreached,
    })
    .from(t.grievances)
    .innerJoin(t.grievanceCategories, eq(t.grievanceCategories.id, t.grievances.categoryId))
    .where(
      and(
        eq(t.grievances.institutionId, user.institutionId),
        scope,
        onlyOpen ? inArray(t.grievances.status, OPEN) : sql`true`,
      ),
    )
    .orderBy(desc(t.grievances.createdAt))
    .limit(100);

  return ok({ cases: rows });
});
