import 'server-only';
import { cache } from 'react';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';

/**
 * Campus-wide reads for the student portal: notices addressed to them, the
 * change feed that affects their section, events and holidays.
 */

export interface StudentAnnouncement {
  id: string;
  reference: string;
  title: string;
  body: string;
  summary: string | null;
  kind: string;
  category: string;
  priority: string;
  authorName: string | null;
  departmentName: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  requiresAcknowledgement: boolean;
  acknowledgementDeadline: Date | null;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  matchedScope: string | null;
  attachments: { name: string; url: string; size?: number }[];
}

/**
 * Notices this user is a resolved recipient of. Audience is computed at publish
 * time into `announcement_recipients`, so this is an exact list — never a
 * best-effort filter.
 */
export const getStudentAnnouncements = cache(
  async (institutionId: string, userId: string): Promise<StudentAnnouncement[]> => {
    const rows = await db
      .select({
        id: t.announcements.id,
        reference: t.announcements.reference,
        title: t.announcements.title,
        body: t.announcements.body,
        summary: t.announcements.summary,
        kind: t.announcements.kind,
        category: t.announcements.category,
        priority: t.announcements.priority,
        publishedAt: t.announcements.publishedAt,
        expiresAt: t.announcements.expiresAt,
        requiresAcknowledgement: t.announcements.requiresAcknowledgement,
        acknowledgementDeadline: t.announcements.acknowledgementDeadline,
        attachments: t.announcements.attachments,
        readAt: t.announcementRecipients.readAt,
        acknowledgedAt: t.announcementRecipients.acknowledgedAt,
        matchedScope: t.announcementRecipients.matchedScope,
        authorFirst: t.users.firstName,
        authorLast: t.users.lastName,
        departmentName: t.departments.name,
      })
      .from(t.announcementRecipients)
      .innerJoin(t.announcements, eq(t.announcements.id, t.announcementRecipients.announcementId))
      .leftJoin(t.users, eq(t.users.id, t.announcements.authorId))
      .leftJoin(t.departments, eq(t.departments.id, t.announcements.departmentId))
      .where(
        and(
          eq(t.announcementRecipients.institutionId, institutionId),
          eq(t.announcementRecipients.userId, userId),
          inArray(t.announcements.status, ['PUBLISHED', 'EXPIRED']),
          isNull(t.announcements.deletedAt),
        ),
      )
      .orderBy(desc(t.announcements.publishedAt));

    return rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      title: r.title,
      body: r.body,
      summary: r.summary,
      kind: r.kind,
      category: r.category,
      priority: r.priority,
      authorName: r.authorFirst ? `${r.authorFirst} ${r.authorLast ?? ''}`.trim() : null,
      departmentName: r.departmentName,
      publishedAt: r.publishedAt,
      expiresAt: r.expiresAt,
      requiresAcknowledgement: r.requiresAcknowledgement,
      acknowledgementDeadline: r.acknowledgementDeadline,
      readAt: r.readAt,
      acknowledgedAt: r.acknowledgedAt,
      matchedScope: r.matchedScope,
      attachments: r.attachments ?? [],
    }));
  },
);

export interface StudentChange {
  id: string;
  kind: string;
  title: string;
  summary: string;
  reason: string | null;
  effectiveFrom: Date | null;
  createdAt: Date;
  changedByName: string | null;
  /** True when the change was addressed at this student's section specifically. */
  isTargeted: boolean;
}

/**
 * "What changed?" — entries that name this student's section or this student,
 * plus institution-wide changes (which carry no audience restriction at all).
 */
export async function getStudentChanges(
  institutionId: string,
  sectionId: string | null,
  userId: string,
  limit = 8,
): Promise<StudentChange[]> {
  const audience = [
    sql`${t.changeEvents.affectedSectionIds} @> ${JSON.stringify([sectionId ?? ''])}::jsonb`,
    sql`${t.changeEvents.affectedUserIds} @> ${JSON.stringify([userId])}::jsonb`,
    sql`(coalesce(jsonb_array_length(${t.changeEvents.affectedSectionIds}), 0) = 0 and coalesce(jsonb_array_length(${t.changeEvents.affectedUserIds}), 0) = 0)`,
  ];

  const rows = await db
    .select({
      id: t.changeEvents.id,
      kind: t.changeEvents.kind,
      title: t.changeEvents.title,
      summary: t.changeEvents.summary,
      reason: t.changeEvents.reason,
      effectiveFrom: t.changeEvents.effectiveFrom,
      createdAt: t.changeEvents.createdAt,
      affectedSectionIds: t.changeEvents.affectedSectionIds,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
    })
    .from(t.changeEvents)
    .leftJoin(t.users, eq(t.users.id, t.changeEvents.changedById))
    .where(and(eq(t.changeEvents.institutionId, institutionId), or(...audience)))
    .orderBy(desc(t.changeEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    reason: r.reason,
    effectiveFrom: r.effectiveFrom,
    createdAt: r.createdAt,
    changedByName: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
    isTargeted: !!sectionId && (r.affectedSectionIds ?? []).includes(sectionId),
  }));
}

export interface CampusEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  roomCode: string | null;
  venueText: string | null;
  speaker: string | null;
  status: string;
  registrationRequired: boolean;
  registrationDeadline: Date | null;
  blocksClasses: boolean;
  isRegistered: boolean;
}

export async function getCampusEvents(
  institutionId: string,
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<CampusEvent[]> {
  const rows = await db
    .select({
      id: t.events.id,
      title: t.events.title,
      description: t.events.description,
      startsAt: t.events.startsAt,
      endsAt: t.events.endsAt,
      roomCode: t.rooms.code,
      venueText: t.events.venueText,
      speaker: t.events.speaker,
      status: t.events.status,
      registrationRequired: t.events.registrationRequired,
      registrationDeadline: t.events.registrationDeadline,
      blocksClasses: t.events.blocksClasses,
      registrationId: t.eventRegistrations.id,
      cancelledAt: t.eventRegistrations.cancelledAt,
    })
    .from(t.events)
    .leftJoin(t.rooms, eq(t.rooms.id, t.events.roomId))
    .leftJoin(
      t.eventRegistrations,
      and(eq(t.eventRegistrations.eventId, t.events.id), eq(t.eventRegistrations.userId, userId)),
    )
    .where(
      and(
        eq(t.events.institutionId, institutionId),
        inArray(t.events.status, ['SCHEDULED', 'CANCELLED', 'COMPLETED']),
        isNull(t.events.deletedAt),
        gte(t.events.startsAt, new Date(`${fromIso}T00:00:00.000Z`)),
        lt(t.events.startsAt, new Date(`${toIso}T00:00:00.000Z`)),
      ),
    )
    .orderBy(asc(t.events.startsAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    roomCode: r.roomCode,
    venueText: r.venueText,
    speaker: r.speaker,
    status: r.status,
    registrationRequired: r.registrationRequired,
    registrationDeadline: r.registrationDeadline,
    blocksClasses: r.blocksClasses,
    isRegistered: !!r.registrationId && !r.cancelledAt,
  }));
}

export interface CampusHoliday {
  id: string;
  name: string;
  date: string;
  isHalfDay: boolean;
  description: string | null;
}

export async function getHolidays(
  institutionId: string,
  fromIso: string,
  toIso: string,
): Promise<CampusHoliday[]> {
  const rows = await db
    .select({
      id: t.holidays.id,
      name: t.holidays.name,
      date: t.holidays.date,
      isHalfDay: t.holidays.isHalfDay,
      description: t.holidays.description,
    })
    .from(t.holidays)
    .where(
      and(
        eq(t.holidays.institutionId, institutionId),
        gte(t.holidays.date, fromIso),
        lt(t.holidays.date, toIso),
      ),
    )
    .orderBy(asc(t.holidays.date));

  return rows;
}

export interface StudentNotification {
  id: string;
  title: string;
  body: string | null;
  priority: string;
  category: string;
  actionUrl: string | null;
  groupKey: string | null;
  readAt: Date | null;
  isMandatory: boolean;
  createdAt: Date;
}

export async function getStudentNotifications(
  institutionId: string,
  userId: string,
  limit = 100,
): Promise<StudentNotification[]> {
  return db
    .select({
      id: t.notifications.id,
      title: t.notifications.title,
      body: t.notifications.body,
      priority: t.notifications.priority,
      category: t.notifications.category,
      actionUrl: t.notifications.actionUrl,
      groupKey: t.notifications.groupKey,
      readAt: t.notifications.readAt,
      isMandatory: t.notifications.isMandatory,
      createdAt: t.notifications.createdAt,
    })
    .from(t.notifications)
    .where(
      and(eq(t.notifications.institutionId, institutionId), eq(t.notifications.userId, userId)),
    )
    .orderBy(desc(t.notifications.createdAt))
    .limit(limit);
}
