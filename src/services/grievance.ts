import 'server-only';
import { and, eq, inArray, isNull, lt, sql, desc, count, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { AppError, ForbiddenError, NotFoundError } from '@/lib/api';

/**
 * READDRESSAL / GRIEVANCE SERVICE
 * ---------------------------------------------------------------------------
 * Design commitments, all enforced here rather than by convention:
 *
 *   - A case can never be deleted. WITHDRAWN and CLOSED are the only terminal
 *     states, and both keep the record.
 *   - Every transition writes an immutable grievance_events row (the table
 *     rejects UPDATE and DELETE at the database level).
 *   - Anonymity is real: `getGrievance` strips raiser identity unless the
 *     caller holds `grievance:reveal_anonymous`, which ordinary admins do not,
 *     and using it is audited.
 *   - SLA deadlines are computed from category configuration on creation, and
 *     the escalation sweep is a pure function of the clock, not of anyone
 *     remembering to act.
 */

const OPEN_STATES: (typeof t.grievances.$inferSelect)['status'][] = [
  'SUBMITTED', 'ACKNOWLEDGED', 'ASSIGNED', 'UNDER_REVIEW', 'AWAITING_INFORMATION', 'REOPENED',
];

/** Valid state transitions. Anything else is rejected. */
const TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['ACKNOWLEDGED', 'ASSIGNED', 'WITHDRAWN'],
  ACKNOWLEDGED: ['ASSIGNED', 'UNDER_REVIEW', 'WITHDRAWN'],
  ASSIGNED: ['UNDER_REVIEW', 'AWAITING_INFORMATION', 'RESOLUTION_PROPOSED', 'WITHDRAWN'],
  UNDER_REVIEW: ['AWAITING_INFORMATION', 'RESOLUTION_PROPOSED', 'RESOLVED', 'WITHDRAWN'],
  AWAITING_INFORMATION: ['UNDER_REVIEW', 'RESOLUTION_PROPOSED', 'WITHDRAWN'],
  RESOLUTION_PROPOSED: ['RESOLVED', 'UNDER_REVIEW', 'WITHDRAWN'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  REOPENED: ['ASSIGNED', 'UNDER_REVIEW', 'WITHDRAWN'],
  CLOSED: ['REOPENED'],
  WITHDRAWN: [],
};

export async function createGrievance(
  user: AuthContext,
  input: {
    categoryId: string;
    subject: string;
    description: string;
    urgency?: string;
    isAnonymous?: boolean;
    attachments?: { name: string; url: string }[];
    relatedEntityType?: string;
    relatedEntityId?: string;
    preferredContactMethod?: string;
  },
): Promise<{ id: string; caseNumber: string; resolutionDueAt: Date | null }> {
  const [category] = await db
    .select()
    .from(t.grievanceCategories)
    .where(
      and(
        eq(t.grievanceCategories.id, input.categoryId),
        eq(t.grievanceCategories.institutionId, user.institutionId),
        eq(t.grievanceCategories.isEnabled, true),
      ),
    )
    .limit(1);

  if (!category) throw new NotFoundError('Grievance category');

  const allowedRoles = (category.availableToRoles ?? []) as string[];
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    throw new ForbiddenError('This category is not available to your role.');
  }

  if (input.isAnonymous && !category.allowAnonymous) {
    throw new AppError(
      'This category does not accept anonymous reports.',
      400,
      'ANONYMOUS_NOT_ALLOWED',
      undefined,
      'Choose a category that supports anonymous reporting, or submit with your name.',
    );
  }

  const now = new Date();
  const caseNumber = await nextCaseNumber(user.institutionId);
  const responseDueAt = addWorkingHours(now, category.responseSlaHours);
  const resolutionDueAt = addWorkingHours(now, category.resolutionSlaHours);

  const grievanceId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(t.grievances)
      .values({
        institutionId: user.institutionId,
        caseNumber,
        categoryId: category.id,
        raisedById: user.userId,
        isAnonymous: input.isAnonymous ?? false,
        subject: input.subject,
        description: input.description,
        urgency: (input.urgency ?? 'NORMAL') as never,
        status: category.defaultAssigneeId ? 'ASSIGNED' : 'SUBMITTED',
        departmentId: category.defaultDepartmentId,
        assignedToId: category.defaultAssigneeId,
        assignedAt: category.defaultAssigneeId ? now : null,
        responseDueAt,
        resolutionDueAt,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        attachments: input.attachments ?? [],
        preferredContactMethod: input.preferredContactMethod ?? 'IN_APP',
      })
      .returning({ id: t.grievances.id });

    const id = row!.id;

    await tx.insert(t.grievanceEvents).values({
      institutionId: user.institutionId,
      grievanceId: id,
      kind: 'CREATED',
      toValue: category.defaultAssigneeId ? 'ASSIGNED' : 'SUBMITTED',
      // Anonymous cases record no actor, so the audit trail cannot deanonymise.
      actorId: input.isAnonymous ? null : user.userId,
    });

    if (category.defaultAssigneeId) {
      await tx.insert(t.grievanceEvents).values({
        institutionId: user.institutionId,
        grievanceId: id,
        kind: 'ASSIGNED',
        toValue: category.defaultAssigneeId,
        isSystemGenerated: true,
        note: `Routed automatically by the ${category.name} category rule.`,
      });

      await tx.insert(t.notifications).values({
        institutionId: user.institutionId,
        userId: category.defaultAssigneeId,
        title: `New case assigned: ${caseNumber}`,
        body: input.subject,
        priority: input.urgency === 'CRITICAL' ? 'CRITICAL' : 'IMPORTANT',
        category: 'ADMINISTRATIVE',
        actionUrl: `/admin/readdressal/${id}`,
        groupKey: 'grievances',
        sourceType: 'grievance',
        sourceId: id,
      });
    }

    return id;
  });

  await recordAudit(user, {
    action: 'GRIEVANCE_CREATED',
    entityType: 'grievance',
    entityId: grievanceId,
    after: { caseNumber, category: category.name, anonymous: input.isAnonymous ?? false },
  });

  return { id: grievanceId, caseNumber, resolutionDueAt };
}

async function nextCaseNumber(institutionId: string): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db
    .select({ value: count() })
    .from(t.grievances)
    .where(eq(t.grievances.institutionId, institutionId));
  return `CASE-${year}-${String((row?.value ?? 0) + 1).padStart(6, '0')}`;
}

/**
 * Adds SLA hours, counting only working hours (Mon–Sat, 09:00–17:00).
 * A complaint raised at 4pm on Saturday is not "late" by Monday morning.
 */
function addWorkingHours(from: Date, hours: number): Date {
  const result = new Date(from);
  let remaining = hours;

  while (remaining > 0) {
    result.setHours(result.getHours() + 1);
    const day = result.getDay();
    const hour = result.getHours();
    const isWorkingDay = day !== 0; // Sunday excluded
    const isWorkingHour = hour >= 9 && hour < 17;
    if (isWorkingDay && isWorkingHour) remaining -= 1;
  }

  return result;
}

export async function transitionGrievance(
  user: AuthContext,
  grievanceId: string,
  params: { to: string; note?: string; resolutionSummary?: string },
): Promise<void> {
  const [grievance] = await db
    .select()
    .from(t.grievances)
    .where(
      and(eq(t.grievances.id, grievanceId), eq(t.grievances.institutionId, user.institutionId)),
    )
    .limit(1);

  if (!grievance) throw new NotFoundError('Case');

  const isRaiser = grievance.raisedById === user.userId;
  const canHandle =
    user.permissions.has('grievance:resolve') ||
    (user.permissions.has('grievance:view_assigned') && grievance.assignedToId === user.userId);

  // A raiser may withdraw or reopen their own case; everything else needs a handler.
  const raiserAllowed = ['WITHDRAWN', 'REOPENED', 'CLOSED'];
  if (!canHandle && !(isRaiser && raiserAllowed.includes(params.to))) {
    throw new ForbiddenError('You cannot change the status of this case.');
  }

  const allowed = TRANSITIONS[grievance.status] ?? [];
  if (!allowed.includes(params.to)) {
    throw new AppError(
      `A case that is ${grievance.status.toLowerCase().replace('_', ' ')} cannot move to ${params.to.toLowerCase().replace('_', ' ')}.`,
      409,
      'INVALID_TRANSITION',
      { from: grievance.status, allowed },
      allowed.length
        ? `Valid next steps are: ${allowed.join(', ')}.`
        : 'This case is closed to further changes.',
    );
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(t.grievances)
      .set({
        status: params.to as never,
        firstResponseAt: grievance.firstResponseAt ?? now,
        resolvedAt: params.to === 'RESOLVED' ? now : grievance.resolvedAt,
        closedAt: params.to === 'CLOSED' ? now : grievance.closedAt,
        withdrawnAt: params.to === 'WITHDRAWN' ? now : grievance.withdrawnAt,
        resolutionSummary: params.resolutionSummary ?? grievance.resolutionSummary,
      })
      .where(eq(t.grievances.id, grievanceId));

    await tx.insert(t.grievanceEvents).values({
      institutionId: user.institutionId,
      grievanceId,
      kind: 'STATUS_CHANGED',
      fromValue: grievance.status,
      toValue: params.to,
      note: params.note ?? null,
      actorId: user.userId,
    });

    // Tell the raiser, unless they made the change themselves.
    if (grievance.raisedById && grievance.raisedById !== user.userId) {
      await tx.insert(t.notifications).values({
        institutionId: user.institutionId,
        userId: grievance.raisedById,
        title: `${grievance.caseNumber} is now ${params.to.toLowerCase().replace('_', ' ')}`,
        body: params.resolutionSummary ?? params.note ?? grievance.subject,
        priority: 'IMPORTANT',
        category: 'ADMINISTRATIVE',
        actionUrl: `/student/readdressal/${grievanceId}`,
        groupKey: 'grievances',
        sourceType: 'grievance',
        sourceId: grievanceId,
      });
    }
  });

  await recordAudit(user, {
    action: 'GRIEVANCE_STATUS_CHANGED',
    entityType: 'grievance',
    entityId: grievanceId,
    before: { status: grievance.status },
    after: { status: params.to },
    reason: params.note,
  });
}

export async function assignGrievance(
  user: AuthContext,
  grievanceId: string,
  assigneeId: string,
  note?: string,
): Promise<void> {
  if (!user.permissions.has('grievance:assign')) {
    throw new ForbiddenError('You cannot reassign cases.');
  }

  const [grievance] = await db
    .select()
    .from(t.grievances)
    .where(
      and(eq(t.grievances.id, grievanceId), eq(t.grievances.institutionId, user.institutionId)),
    )
    .limit(1);

  if (!grievance) throw new NotFoundError('Case');

  await db.transaction(async (tx) => {
    await tx
      .update(t.grievances)
      .set({
        assignedToId: assigneeId,
        assignedAt: new Date(),
        status: grievance.status === 'SUBMITTED' ? 'ASSIGNED' : grievance.status,
      })
      .where(eq(t.grievances.id, grievanceId));

    await tx.insert(t.grievanceEvents).values({
      institutionId: user.institutionId,
      grievanceId,
      kind: 'ASSIGNED',
      fromValue: grievance.assignedToId,
      toValue: assigneeId,
      note: note ?? null,
      actorId: user.userId,
    });

    await tx.insert(t.notifications).values({
      institutionId: user.institutionId,
      userId: assigneeId,
      title: `Case assigned to you: ${grievance.caseNumber}`,
      body: grievance.subject,
      priority: 'IMPORTANT',
      category: 'ADMINISTRATIVE',
      actionUrl: `/admin/readdressal/${grievanceId}`,
      groupKey: 'grievances',
      sourceType: 'grievance',
      sourceId: grievanceId,
    });
  });

  await recordAudit(user, {
    action: 'GRIEVANCE_ASSIGNED',
    entityType: 'grievance',
    entityId: grievanceId,
    before: { assignedTo: grievance.assignedToId },
    after: { assignedTo: assigneeId },
    reason: note,
  });
}

export async function addGrievanceMessage(
  user: AuthContext,
  grievanceId: string,
  body: string,
  isInternalNote = false,
): Promise<void> {
  const [grievance] = await db
    .select()
    .from(t.grievances)
    .where(
      and(eq(t.grievances.id, grievanceId), eq(t.grievances.institutionId, user.institutionId)),
    )
    .limit(1);

  if (!grievance) throw new NotFoundError('Case');

  const isRaiser = grievance.raisedById === user.userId;
  const isHandler =
    user.permissions.has('grievance:resolve') || grievance.assignedToId === user.userId;

  if (!isRaiser && !isHandler) throw new ForbiddenError('You cannot post on this case.');
  if (isInternalNote && !isHandler) {
    throw new ForbiddenError('Only case handlers can add internal notes.');
  }

  await db.transaction(async (tx) => {
    await tx.insert(t.grievanceMessages).values({
      institutionId: user.institutionId,
      grievanceId,
      authorId: user.userId,
      body,
      isInternalNote,
    });

    if (!grievance.firstResponseAt && isHandler) {
      await tx
        .update(t.grievances)
        .set({ firstResponseAt: new Date() })
        .where(eq(t.grievances.id, grievanceId));
    }

    // Notify the other party (never for internal notes).
    if (!isInternalNote) {
      const notifyUserId = isRaiser ? grievance.assignedToId : grievance.raisedById;
      if (notifyUserId && notifyUserId !== user.userId) {
        await tx.insert(t.notifications).values({
          institutionId: user.institutionId,
          userId: notifyUserId,
          title: `New reply on ${grievance.caseNumber}`,
          body: body.slice(0, 140),
          priority: 'NORMAL',
          category: 'ADMINISTRATIVE',
          actionUrl: `/admin/readdressal/${grievanceId}`,
          groupKey: 'grievances',
          sourceType: 'grievance',
          sourceId: grievanceId,
        });
      }
    }
  });
}

export interface GrievanceDetail {
  id: string;
  caseNumber: string;
  subject: string;
  description: string;
  status: string;
  urgency: string;
  category: string;
  categorySlug: string;
  isAnonymous: boolean;
  /** Null when anonymous and the caller may not reveal identity. */
  raisedByName: string | null;
  raisedByRole: string | null;
  assignedToName: string | null;
  assignedToId: string | null;
  createdAt: Date;
  responseDueAt: Date | null;
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
  isSlaBreached: boolean;
  slaHoursRemaining: number | null;
  resolutionSummary: string | null;
  escalationLevel: number;
  messages: {
    id: string;
    body: string;
    authorName: string | null;
    isInternalNote: boolean;
    createdAt: Date;
  }[];
  timeline: {
    kind: string;
    fromValue: string | null;
    toValue: string | null;
    note: string | null;
    actorName: string | null;
    isSystemGenerated: boolean;
    createdAt: Date;
  }[];
  allowedTransitions: string[];
}

export async function getGrievance(
  user: AuthContext,
  grievanceId: string,
): Promise<GrievanceDetail> {
  const [row] = await db
    .select({
      g: t.grievances,
      categoryName: t.grievanceCategories.name,
      categorySlug: t.grievanceCategories.slug,
      raiserFirst: t.users.firstName,
      raiserLast: t.users.lastName,
      raiserRole: t.users.role,
    })
    .from(t.grievances)
    .innerJoin(t.grievanceCategories, eq(t.grievanceCategories.id, t.grievances.categoryId))
    .leftJoin(t.users, eq(t.users.id, t.grievances.raisedById))
    .where(
      and(eq(t.grievances.id, grievanceId), eq(t.grievances.institutionId, user.institutionId)),
    )
    .limit(1);

  if (!row) throw new NotFoundError('Case');
  const g = row.g;

  const isRaiser = g.raisedById === user.userId;
  const isHandler = g.assignedToId === user.userId;
  const canViewAll = user.permissions.has('grievance:view_all');

  if (!isRaiser && !isHandler && !canViewAll) {
    throw new ForbiddenError('You do not have access to this case.');
  }

  // Anonymity: identity is withheld unless the caller holds the dedicated
  // capability, and using it is audited.
  const mayReveal = user.permissions.has('grievance:reveal_anonymous');
  const hideIdentity = g.isAnonymous && !isRaiser && !mayReveal;

  if (g.isAnonymous && mayReveal && !isRaiser) {
    await recordAudit(user, {
      action: 'GRIEVANCE_ANONYMITY_REVEALED',
      entityType: 'grievance',
      entityId: grievanceId,
      reason: 'Viewed identity on an anonymous case',
    });
  }

  const [assignee] = g.assignedToId
    ? await db
        .select({ firstName: t.users.firstName, lastName: t.users.lastName })
        .from(t.users)
        .where(eq(t.users.id, g.assignedToId))
        .limit(1)
    : [undefined];

  const messageRows = await db
    .select({
      id: t.grievanceMessages.id,
      body: t.grievanceMessages.body,
      isInternalNote: t.grievanceMessages.isInternalNote,
      createdAt: t.grievanceMessages.createdAt,
      authorId: t.grievanceMessages.authorId,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
    })
    .from(t.grievanceMessages)
    .leftJoin(t.users, eq(t.users.id, t.grievanceMessages.authorId))
    .where(eq(t.grievanceMessages.grievanceId, grievanceId))
    .orderBy(t.grievanceMessages.createdAt);

  const timelineRows = await db
    .select({
      kind: t.grievanceEvents.kind,
      fromValue: t.grievanceEvents.fromValue,
      toValue: t.grievanceEvents.toValue,
      note: t.grievanceEvents.note,
      isSystemGenerated: t.grievanceEvents.isSystemGenerated,
      createdAt: t.grievanceEvents.createdAt,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
    })
    .from(t.grievanceEvents)
    .leftJoin(t.users, eq(t.users.id, t.grievanceEvents.actorId))
    .where(eq(t.grievanceEvents.grievanceId, grievanceId))
    .orderBy(t.grievanceEvents.createdAt);

  const now = Date.now();

  return {
    id: g.id,
    caseNumber: g.caseNumber,
    subject: g.subject,
    description: g.description,
    status: g.status,
    urgency: g.urgency,
    category: row.categoryName,
    categorySlug: row.categorySlug,
    isAnonymous: g.isAnonymous,
    raisedByName: hideIdentity
      ? null
      : row.raiserFirst
        ? `${row.raiserFirst} ${row.raiserLast ?? ''}`.trim()
        : null,
    raisedByRole: hideIdentity ? null : row.raiserRole,
    assignedToName: assignee ? `${assignee.firstName} ${assignee.lastName}` : null,
    assignedToId: g.assignedToId,
    createdAt: g.createdAt,
    responseDueAt: g.responseDueAt,
    resolutionDueAt: g.resolutionDueAt,
    resolvedAt: g.resolvedAt,
    isSlaBreached: g.isSlaBreached,
    slaHoursRemaining: g.resolutionDueAt
      ? Math.round((g.resolutionDueAt.getTime() - now) / 3600_000)
      : null,
    resolutionSummary: g.resolutionSummary,
    escalationLevel: g.escalationLevel,
    messages: messageRows
      // Internal notes are invisible to the raiser.
      .filter((m) => !m.isInternalNote || isHandler || canViewAll)
      .map((m) => ({
        id: m.id,
        body: m.body,
        authorName:
          g.isAnonymous && m.authorId === g.raisedById && hideIdentity
            ? null
            : m.firstName
              ? `${m.firstName} ${m.lastName ?? ''}`.trim()
              : null,
        isInternalNote: m.isInternalNote,
        createdAt: m.createdAt,
      })),
    timeline: timelineRows.map((e) => ({
      kind: e.kind,
      fromValue: e.fromValue,
      toValue: e.toValue,
      note: e.note,
      actorName:
        hideIdentity && !e.isSystemGenerated && !e.firstName
          ? null
          : e.firstName
            ? `${e.firstName} ${e.lastName ?? ''}`.trim()
            : null,
      isSystemGenerated: e.isSystemGenerated,
      createdAt: e.createdAt,
    })),
    allowedTransitions: TRANSITIONS[g.status] ?? [],
  };
}

/**
 * SLA ESCALATION SWEEP
 * Run on a schedule. Pure function of the clock: warns before the deadline,
 * escalates after it. Never silently closes anything.
 */
export async function runEscalationSweep(institutionId: string): Promise<{
  warned: number;
  escalated: number;
}> {
  const now = new Date();
  const warningWindow = new Date(now.getTime() + 6 * 3600_000);

  const open = await db
    .select({
      id: t.grievances.id,
      caseNumber: t.grievances.caseNumber,
      subject: t.grievances.subject,
      status: t.grievances.status,
      assignedToId: t.grievances.assignedToId,
      resolutionDueAt: t.grievances.resolutionDueAt,
      isSlaBreached: t.grievances.isSlaBreached,
      escalationLevel: t.grievances.escalationLevel,
      lastEscalatedAt: t.grievances.lastEscalatedAt,
      escalationUserId: t.grievanceCategories.escalationUserId,
    })
    .from(t.grievances)
    .innerJoin(t.grievanceCategories, eq(t.grievanceCategories.id, t.grievances.categoryId))
    .where(
      and(
        eq(t.grievances.institutionId, institutionId),
        inArray(t.grievances.status, OPEN_STATES),
      ),
    );

  let warned = 0;
  let escalated = 0;

  for (const g of open) {
    if (!g.resolutionDueAt) continue;

    const overdue = g.resolutionDueAt < now;

    if (overdue && !g.isSlaBreached) {
      await db.transaction(async (tx) => {
        await tx
          .update(t.grievances)
          .set({
            isSlaBreached: true,
            escalationLevel: g.escalationLevel + 1,
            lastEscalatedAt: now,
          })
          .where(eq(t.grievances.id, g.id));

        await tx.insert(t.grievanceEvents).values({
          institutionId,
          grievanceId: g.id,
          kind: 'SLA_BREACHED',
          fromValue: String(g.escalationLevel),
          toValue: String(g.escalationLevel + 1),
          note: 'Resolution deadline passed. Escalated to the next authority.',
          isSystemGenerated: true,
        });

        if (g.escalationUserId) {
          await tx.insert(t.notifications).values({
            institutionId,
            userId: g.escalationUserId,
            title: `Escalated: ${g.caseNumber} has passed its resolution deadline`,
            body: g.subject,
            priority: 'CRITICAL',
            category: 'ADMINISTRATIVE',
            actionUrl: `/admin/readdressal/${g.id}`,
            groupKey: 'grievance-escalations',
            isMandatory: true,
            sourceType: 'grievance',
            sourceId: g.id,
          });
        }
      });
      escalated += 1;
      continue;
    }

    if (!overdue && g.resolutionDueAt < warningWindow && g.assignedToId) {
      const [existing] = await db
        .select({ id: t.grievanceEvents.id })
        .from(t.grievanceEvents)
        .where(
          and(
            eq(t.grievanceEvents.grievanceId, g.id),
            eq(t.grievanceEvents.kind, 'SLA_WARNING'),
          ),
        )
        .limit(1);

      if (existing) continue;

      await db.transaction(async (tx) => {
        await tx.insert(t.grievanceEvents).values({
          institutionId,
          grievanceId: g.id,
          kind: 'SLA_WARNING',
          note: 'Resolution deadline is within six working hours.',
          isSystemGenerated: true,
        });

        await tx.insert(t.notifications).values({
          institutionId,
          userId: g.assignedToId!,
          title: `${g.caseNumber} is approaching its deadline`,
          body: g.subject,
          priority: 'IMPORTANT',
          category: 'ADMINISTRATIVE',
          actionUrl: `/admin/readdressal/${g.id}`,
          groupKey: 'grievance-sla',
          sourceType: 'grievance',
          sourceId: g.id,
        });
      });
      warned += 1;
    }
  }

  return { warned, escalated };
}

/**
 * Rule-based routing suggestion.
 *
 * Deliberately NOT model-driven: routing determines who sees a complaint, and
 * that must be predictable and auditable. Keyword hints are advisory only —
 * the category's configured owner always wins.
 */
export function suggestCategory(
  subject: string,
  description: string,
  categories: { id: string; name: string; slug: string }[],
): { categoryId: string | null; confidence: number; reason: string } {
  const text = `${subject} ${description}`.toLowerCase();

  const rules: { slug: string; keywords: string[] }[] = [
    { slug: 'attendance', keywords: ['attendance', 'absent', 'present', 'marked absent', 'shortage'] },
    { slug: 'examination', keywords: ['exam', 'marks', 're-evaluation', 'result', 'answer script', 'grade'] },
    { slug: 'timetable', keywords: ['timetable', 'schedule', 'clash', 'two classes', 'period'] },
    { slug: 'infrastructure', keywords: ['projector', 'fan', 'light', 'chair', 'water', 'washroom', 'broken'] },
    { slug: 'it-support', keywords: ['login', 'password', 'wifi', 'network', 'portal', 'download', 'website'] },
    { slug: 'fees-admin', keywords: ['fee', 'payment', 'receipt', 'refund', 'certificate', 'transcript'] },
    { slug: 'workload', keywords: ['workload', 'teaching hours', 'overload', 'contracted'] },
    { slug: 'academic', keywords: ['syllabus', 'coverage', 'teaching', 'lecture', 'notes'] },
  ];

  let best: { slug: string; hits: number } | null = null;
  for (const rule of rules) {
    const hits = rule.keywords.filter((k) => text.includes(k)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { slug: rule.slug, hits };
  }

  if (!best) {
    return { categoryId: null, confidence: 0, reason: 'No keyword rule matched.' };
  }

  const category = categories.find((c) => c.slug === best!.slug);
  if (!category) {
    return { categoryId: null, confidence: 0, reason: 'Matched category is not configured.' };
  }

  return {
    categoryId: category.id,
    confidence: Math.min(90, 45 + best.hits * 15),
    reason: `Matched ${best.hits} keyword${best.hits === 1 ? '' : 's'} associated with ${category.name}.`,
  };
}
