import 'server-only';
import { and, eq, inArray, isNull, or, sql, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { AppError, ForbiddenError } from '@/lib/api';

/**
 * COMMUNICATION ENGINE
 * ---------------------------------------------------------------------------
 * The product's central claim is that a notice reaches exactly the right people
 * and that you can prove who has seen it. That requires two things this module
 * provides:
 *
 *   resolveAudience() — turns targeting RULES (department, year, section, role)
 *                       into a concrete list of user ids, using the academic
 *                       hierarchy. Exclusions are applied after inclusions.
 *
 *   publishAnnouncement() — freezes that audience into announcement_recipients
 *                       at publish time, so read/acknowledgement tracking is
 *                       exact and cheap, and so later enrolment changes cannot
 *                       silently rewrite who was addressed.
 */

export interface AudienceRule {
  scope:
    | 'INSTITUTION' | 'CAMPUS' | 'DEPARTMENT' | 'PROGRAM'
    | 'YEAR' | 'SECTION' | 'COURSE' | 'ROLE' | 'USER';
  campusId?: string;
  departmentId?: string;
  programId?: string;
  sectionId?: string;
  offeringId?: string;
  year?: number;
  role?: string;
  userId?: string;
  isExclusion?: boolean;
}

export interface ResolvedAudience {
  userIds: string[];
  breakdown: { students: number; faculty: number; staff: number };
  /** Human-readable description of who this reaches. */
  description: string;
}

/**
 * Resolves targeting rules to concrete recipients.
 * Inclusions are unioned, then exclusions are subtracted.
 */
export async function resolveAudience(
  institutionId: string,
  rules: AudienceRule[],
): Promise<ResolvedAudience> {
  const includes = rules.filter((r) => !r.isExclusion);
  const excludes = rules.filter((r) => r.isExclusion);

  const included = new Set<string>();
  const descriptions: string[] = [];

  for (const rule of includes) {
    const ids = await idsForRule(institutionId, rule);
    ids.forEach((id) => included.add(id));
    descriptions.push(await describeRule(rule));
  }

  for (const rule of excludes) {
    const ids = await idsForRule(institutionId, rule);
    ids.forEach((id) => included.delete(id));
  }

  const userIds = [...included];
  if (userIds.length === 0) {
    return {
      userIds: [],
      breakdown: { students: 0, faculty: 0, staff: 0 },
      description: 'No one matches these targeting rules.',
    };
  }

  const roleCounts = await db
    .select({ role: t.users.role, value: count() })
    .from(t.users)
    .where(inArray(t.users.id, userIds))
    .groupBy(t.users.role);

  const students = roleCounts.find((r) => r.role === 'STUDENT')?.value ?? 0;
  const faculty = roleCounts.find((r) => r.role === 'FACULTY')?.value ?? 0;
  const staff = userIds.length - students - faculty;

  const excludeNote = excludes.length ? `, excluding ${excludes.length} group(s)` : '';

  return {
    userIds,
    breakdown: { students, faculty, staff },
    description: `${descriptions.join(' + ')}${excludeNote}`,
  };
}

async function idsForRule(institutionId: string, rule: AudienceRule): Promise<string[]> {
  const base = and(eq(t.users.institutionId, institutionId), eq(t.users.status, 'ACTIVE'), isNull(t.users.deletedAt));

  switch (rule.scope) {
    case 'INSTITUTION': {
      const rows = await db.select({ id: t.users.id }).from(t.users).where(base);
      return rows.map((r) => r.id);
    }
    case 'CAMPUS': {
      const rows = await db
        .select({ id: t.users.id })
        .from(t.users)
        .where(and(base, eq(t.users.campusId, rule.campusId!)));
      return rows.map((r) => r.id);
    }
    case 'DEPARTMENT': {
      const rows = await db
        .select({ id: t.users.id })
        .from(t.users)
        .where(and(base, eq(t.users.departmentId, rule.departmentId!)));
      return rows.map((r) => r.id);
    }
    case 'ROLE': {
      const rows = await db
        .select({ id: t.users.id })
        .from(t.users)
        .where(and(base, eq(t.users.role, rule.role as never)));
      return rows.map((r) => r.id);
    }
    case 'USER': {
      // The id comes from the request: only accept someone at the sender's own college.
      if (!rule.userId) return [];
      const rows = await db
        .select({ id: t.users.id })
        .from(t.users)
        .where(and(base, eq(t.users.id, rule.userId)));
      return rows.map((r) => r.id);
    }
    case 'PROGRAM': {
      const rows = await db
        .select({ id: t.users.id })
        .from(t.studentProfiles)
        .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
        .where(and(base, eq(t.studentProfiles.programId, rule.programId!)));
      return rows.map((r) => r.id);
    }
    case 'YEAR': {
      const rows = await db
        .select({ id: t.users.id })
        .from(t.studentProfiles)
        .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
        .where(and(base, eq(t.studentProfiles.currentYear, rule.year!)));
      return rows.map((r) => r.id);
    }
    case 'SECTION': {
      // Students in the section, plus faculty who teach it.
      const students = await db
        .select({ id: t.users.id })
        .from(t.studentProfiles)
        .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
        .where(and(base, eq(t.studentProfiles.sectionId, rule.sectionId!)));

      const faculty = await db
        .select({ id: t.users.id })
        .from(t.courseOfferings)
        .innerJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.courseOfferings.facultyId))
        .innerJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
        .where(
          and(
            eq(t.courseOfferings.institutionId, institutionId),
            eq(t.courseOfferings.sectionId, rule.sectionId!),
          ),
        );

      return [...students.map((r) => r.id), ...faculty.map((r) => r.id)];
    }
    case 'COURSE': {
      const students = await db
        .select({ id: t.users.id })
        .from(t.enrollments)
        .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.enrollments.studentId))
        .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
        .where(and(base, eq(t.enrollments.offeringId, rule.offeringId!)));

      const faculty = await db
        .select({ id: t.users.id })
        .from(t.courseOfferings)
        .innerJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.courseOfferings.facultyId))
        .innerJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
        .where(eq(t.courseOfferings.id, rule.offeringId!));

      return [...students.map((r) => r.id), ...faculty.map((r) => r.id)];
    }
    default:
      return [];
  }
}

async function describeRule(rule: AudienceRule): Promise<string> {
  switch (rule.scope) {
    case 'INSTITUTION': return 'Everyone at the institution';
    case 'ROLE': return `All ${(rule.role ?? '').toLowerCase()}s`;
    case 'YEAR': return `Year ${rule.year} students`;
    case 'DEPARTMENT': {
      const [d] = await db.select({ name: t.departments.name }).from(t.departments).where(eq(t.departments.id, rule.departmentId!)).limit(1);
      return d ? `${d.name} department` : 'A department';
    }
    case 'PROGRAM': {
      const [p] = await db.select({ name: t.programs.name }).from(t.programs).where(eq(t.programs.id, rule.programId!)).limit(1);
      return p ? p.name : 'A programme';
    }
    case 'SECTION': {
      const [sec] = await db.select({ code: t.sections.code }).from(t.sections).where(eq(t.sections.id, rule.sectionId!)).limit(1);
      return sec ? `Section ${sec.code}` : 'A section';
    }
    case 'COURSE': return 'A specific class';
    case 'CAMPUS': return 'A campus';
    case 'USER': return 'A specific person';
    default: return 'Unknown audience';
  }
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  summary?: string;
  category: string;
  priority: string;
  kind: 'OFFICIAL' | 'INFORMATIONAL';
  requiresAcknowledgement?: boolean;
  acknowledgementDeadline?: Date | null;
  expiresAt?: Date | null;
  publishAt?: Date | null;
  allowComments?: boolean;
  isEmergencyBroadcast?: boolean;
  targets: AudienceRule[];
  attachments?: { name: string; url: string }[];
}

/**
 * Creates and (unless scheduled) publishes an announcement.
 *
 * Authorisation rules enforced here, not in the UI:
 *   - OFFICIAL notices require `announcement:create_official`
 *   - emergency broadcasts require `announcement:emergency_broadcast`
 *   - an author without official rights gets PENDING_APPROVAL instead
 */
export async function createAnnouncement(
  user: AuthContext,
  input: CreateAnnouncementInput,
): Promise<{ id: string; reference: string; recipients: number; status: string }> {
  if (input.isEmergencyBroadcast && !user.permissions.has('announcement:emergency_broadcast')) {
    throw new ForbiddenError('Emergency broadcasts require additional authorisation.');
  }

  const canPublishOfficial = user.permissions.has('announcement:create_official');
  if (input.kind === 'OFFICIAL' && !canPublishOfficial &&
      !user.permissions.has('announcement:create_informational')) {
    throw new ForbiddenError('You are not permitted to publish notices.');
  }

  const needsApproval = input.kind === 'OFFICIAL' && !canPublishOfficial;
  const scheduled = input.publishAt && input.publishAt > new Date();

  const audience = await resolveAudience(user.institutionId, input.targets);
  if (audience.userIds.length === 0) {
    throw new AppError(
      'These targeting rules do not reach anyone.',
      400,
      'EMPTY_AUDIENCE',
      undefined,
      'Widen the audience — for example target a programme or year rather than a single section.',
    );
  }

  const reference = await nextReference(user.institutionId);
  const status = needsApproval ? 'PENDING_APPROVAL' : scheduled ? 'SCHEDULED' : 'PUBLISHED';

  const announcementId = await db.transaction(async (tx) => {
    const [announcement] = await tx
      .insert(t.announcements)
      .values({
        institutionId: user.institutionId,
        reference,
        title: input.title,
        body: input.body,
        summary: input.summary ?? input.body.slice(0, 160),
        authorId: user.userId,
        departmentId: user.departmentId,
        kind: input.kind,
        category: input.category as never,
        priority: input.priority as never,
        status: status as never,
        requiresAcknowledgement: input.requiresAcknowledgement ?? false,
        acknowledgementDeadline: input.acknowledgementDeadline ?? null,
        requiresApproval: needsApproval,
        publishAt: input.publishAt ?? new Date(),
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        expiresAt: input.expiresAt ?? null,
        allowComments: input.allowComments ?? false,
        isEmergencyBroadcast: input.isEmergencyBroadcast ?? false,
        attachments: input.attachments ?? [],
        recipientCount: audience.userIds.length,
      })
      .returning({ id: t.announcements.id });

    const id = announcement!.id;

    await tx.insert(t.announcementTargets).values(
      input.targets.map((rule) => ({
        institutionId: user.institutionId,
        announcementId: id,
        scope: rule.scope as never,
        campusId: rule.campusId ?? null,
        departmentId: rule.departmentId ?? null,
        programId: rule.programId ?? null,
        sectionId: rule.sectionId ?? null,
        offeringId: rule.offeringId ?? null,
        year: rule.year ?? null,
        role: rule.role ?? null,
        userId: rule.userId ?? null,
        isExclusion: rule.isExclusion ?? false,
      })),
    );

    if (status === 'PUBLISHED') {
      const recipientRows = audience.userIds.map((userId) => ({
        institutionId: user.institutionId,
        announcementId: id,
        userId,
      }));
      for (let i = 0; i < recipientRows.length; i += 500) {
        await tx.insert(t.announcementRecipients).values(recipientRows.slice(i, i + 500));
      }

      const notificationRows = audience.userIds.map((userId) => ({
        institutionId: user.institutionId,
        userId,
        title: input.title,
        body: input.summary ?? input.body.slice(0, 160),
        priority: input.priority as never,
        category: input.category as never,
        actionUrl: `/announcements/${id}`,
        groupKey: `announcement-${input.category.toLowerCase()}`,
        sourceType: 'announcement',
        sourceId: id,
        // Critical and emergency notices bypass user preferences by design.
        isMandatory: input.priority === 'CRITICAL' || !!input.isEmergencyBroadcast,
      }));
      for (let i = 0; i < notificationRows.length; i += 500) {
        await tx.insert(t.notifications).values(notificationRows.slice(i, i + 500));
      }
    }

    return id;
  });

  await recordAudit(user, {
    action: status === 'PUBLISHED' ? 'ANNOUNCEMENT_PUBLISHED' : 'ANNOUNCEMENT_CREATED',
    entityType: 'announcement',
    entityId: announcementId,
    after: {
      reference,
      title: input.title,
      kind: input.kind,
      priority: input.priority,
      recipients: audience.userIds.length,
      audience: audience.description,
    },
  });

  return {
    id: announcementId,
    reference,
    recipients: audience.userIds.length,
    status,
  };
}

async function nextReference(institutionId: string): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db
    .select({ value: count() })
    .from(t.announcements)
    .where(eq(t.announcements.institutionId, institutionId));
  return `NOTICE-${year}-${String((row?.value ?? 0) + 1).padStart(5, '0')}`;
}

/** Marks a notice read for a user. Idempotent. */
export async function markAnnouncementRead(userId: string, announcementId: string): Promise<void> {
  const result = await db
    .update(t.announcementRecipients)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(t.announcementRecipients.announcementId, announcementId),
        eq(t.announcementRecipients.userId, userId),
        isNull(t.announcementRecipients.readAt),
      ),
    )
    .returning({ id: t.announcementRecipients.id });

  if (result.length > 0) {
    await db
      .update(t.announcements)
      .set({ readCount: sql`${t.announcements.readCount} + 1` })
      .where(eq(t.announcements.id, announcementId));
  }
}

/** Records an explicit acknowledgement — the "I've read this" action. */
export async function acknowledgeAnnouncement(
  userId: string,
  announcementId: string,
): Promise<{ acknowledged: boolean }> {
  const [recipient] = await db
    .select()
    .from(t.announcementRecipients)
    .where(
      and(
        eq(t.announcementRecipients.announcementId, announcementId),
        eq(t.announcementRecipients.userId, userId),
      ),
    )
    .limit(1);

  if (!recipient) {
    throw new AppError('This notice was not addressed to you.', 403, 'NOT_A_RECIPIENT');
  }
  if (recipient.acknowledgedAt) return { acknowledged: true };

  await db.transaction(async (tx) => {
    await tx
      .update(t.announcementRecipients)
      .set({ acknowledgedAt: new Date(), readAt: recipient.readAt ?? new Date() })
      .where(eq(t.announcementRecipients.id, recipient.id));

    await tx
      .update(t.announcements)
      .set({
        acknowledgedCount: sql`${t.announcements.acknowledgedCount} + 1`,
        readCount: recipient.readAt
          ? sql`${t.announcements.readCount}`
          : sql`${t.announcements.readCount} + 1`,
      })
      .where(eq(t.announcements.id, announcementId));
  });

  return { acknowledged: true };
}

/** Who has not acknowledged — the number that ends "I didn't know". */
export async function getAcknowledgementStatus(
  institutionId: string,
  announcementId: string,
): Promise<{
  total: number;
  read: number;
  acknowledged: number;
  pending: { userId: string; name: string; role: string; sectionCode: string | null }[];
}> {
  const rows = await db
    .select({
      userId: t.users.id,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      role: t.users.role,
      readAt: t.announcementRecipients.readAt,
      acknowledgedAt: t.announcementRecipients.acknowledgedAt,
      sectionCode: t.sections.code,
    })
    .from(t.announcementRecipients)
    .innerJoin(t.users, eq(t.users.id, t.announcementRecipients.userId))
    .leftJoin(t.studentProfiles, eq(t.studentProfiles.userId, t.users.id))
    .leftJoin(t.sections, eq(t.sections.id, t.studentProfiles.sectionId))
    .where(
      and(
        eq(t.announcementRecipients.institutionId, institutionId),
        eq(t.announcementRecipients.announcementId, announcementId),
      ),
    );

  return {
    total: rows.length,
    read: rows.filter((r) => r.readAt).length,
    acknowledged: rows.filter((r) => r.acknowledgedAt).length,
    pending: rows
      .filter((r) => !r.acknowledgedAt)
      .slice(0, 200)
      .map((r) => ({
        userId: r.userId,
        name: `${r.firstName} ${r.lastName}`,
        role: r.role,
        sectionCode: r.sectionCode,
      })),
  };
}

/**
 * Records a change and notifies the people it affects.
 * This is the single entry point for the "what changed" feed.
 */
export async function recordChange(
  user: AuthContext,
  input: {
    kind: string;
    title: string;
    summary: string;
    reason: string;
    entityType: string;
    entityId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    affectedSectionIds?: string[];
    affectedUserIds?: string[];
    effectiveFrom?: Date;
    notify?: boolean;
  },
): Promise<string> {
  // Work out who to tell: explicit users, plus everyone in affected sections.
  const userIds = new Set(input.affectedUserIds ?? []);

  if (input.affectedSectionIds?.length) {
    for (const sectionId of input.affectedSectionIds) {
      const ids = await idsForRule(user.institutionId, { scope: 'SECTION', sectionId });
      ids.forEach((id) => userIds.add(id));
    }
  }

  const [change] = await db
    .insert(t.changeEvents)
    .values({
      institutionId: user.institutionId,
      kind: input.kind as never,
      title: input.title,
      summary: input.summary,
      beforeValue: input.before ?? null,
      afterValue: input.after ?? null,
      reason: input.reason,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      changedById: user.userId,
      affectedSectionIds: input.affectedSectionIds ?? [],
      affectedUserIds: [...userIds].slice(0, 2000),
      affectedCount: userIds.size,
      effectiveFrom: input.effectiveFrom ?? new Date(),
    })
    .returning({ id: t.changeEvents.id });

  const changeId = change!.id;

  if (input.notify !== false && userIds.size > 0) {
    const rows = [...userIds].map((userId) => ({
      institutionId: user.institutionId,
      userId,
      title: input.title,
      body: `${input.summary} — ${input.reason}`,
      priority: 'IMPORTANT' as const,
      category: 'ACADEMIC' as const,
      actionUrl: `/changes/${changeId}`,
      groupKey: 'campus-changes',
      sourceType: 'change_event',
      sourceId: changeId,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(t.notifications).values(rows.slice(i, i + 500));
    }
  }

  return changeId;
}
