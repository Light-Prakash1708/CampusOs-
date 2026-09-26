import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { DISPLAY_TIME_ZONE } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { recordAudit } from '@/services/audit';
import { onCertificateIssued, onEventAttended } from '@/services/gamification';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { canManageEvent } from './index';
import { certificateCode, updatePriority, verifyPassToken } from './rules';

/**
 * EVENTS — organiser and moderator operations.
 * Organiser = the event's creator (with event:create) or anyone holding
 * event:approve at the event's own college. Moderation needs event:approve.
 */

type Meta = { ipAddress: string | null; userAgent: string | null };

export interface EventInput {
  title: string;
  description?: string | null;
  category: string;
  visibility: 'INSTITUTION' | 'PUBLIC';
  organizerName?: string | null;
  mode: 'OFFLINE' | 'ONLINE' | 'HYBRID';
  venueText?: string | null;
  city?: string | null;
  area?: string | null;
  onlineUrl?: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity?: number | null;
  registrationRequired: boolean;
  registrationDeadline?: Date | null;
  registrationMode: 'INSTANT' | 'APPROVAL' | 'INVITE_ONLY';
  waitlistEnabled: boolean;
  priceInr: number;
  certificateOffered: boolean;
  teamSizeMin: number;
  teamSizeMax: number;
  eligibility?: string | null;
  rules?: string | null;
  prizes?: string | null;
  agenda?: { time: string; title: string }[];
  faqs?: { q: string; a: string }[];
  tags?: string[];
  contactEmail?: string | null;
  coverUrl?: string | null;
}

async function loadManaged(ctx: AuthContext, eventId: string, opts: { forCheckIn?: boolean } = {}) {
  const [e] = await db
    .select()
    .from(t.events)
    .where(and(eq(t.events.id, eventId), eq(t.events.institutionId, ctx.institutionId), isNull(t.events.deletedAt)))
    .limit(1);
  // Check-in desk volunteers (event:checkin) may scan passes at their own college's
  // events without being able to edit or see anything else about them.
  const allowed = e && (canManageEvent(ctx, e) || (opts.forCheckIn && ctx.permissions.has('event:checkin')));
  if (!e || !allowed) throw new NotFoundError('Event');
  return e;
}

/** Organiser type is derived from who is creating it, never trusted from input. */
function organizerTypeFor(ctx: AuthContext): 'COLLEGE' | 'CLUB' | 'STUDENT' {
  if (ctx.permissions.has('event:approve')) return 'COLLEGE';
  if (ctx.permissions.has('club:manage')) return 'CLUB';
  if (ctx.role === 'STUDENT' || ctx.portal === 'student') return 'STUDENT';
  return 'COLLEGE';
}

export async function createEvent(ctx: AuthContext, input: EventInput, meta: Meta) {
  if (!ctx.permissions.has('event:create')) throw new ForbiddenError();
  await enforceRateLimit(keyFor('event:create', ctx.userId), { limit: 10, windowSec: 86_400 }, 'You have created many events today.');
  if (input.endsAt <= input.startsAt) throw new AppError('The event must end after it starts.', 422, 'BAD_TIMES');
  if (input.registrationDeadline && input.registrationDeadline > input.endsAt) {
    throw new AppError('Registration must close before the event ends.', 422, 'BAD_DEADLINE');
  }

  // Duplicate detection: same college, same title (normalised), within a day.
  const norm = input.title.trim().toLowerCase().replace(/\s+/g, ' ');
  const [dup] = await db
    .select({ id: t.events.id })
    .from(t.events)
    .where(
      and(
        eq(t.events.institutionId, ctx.institutionId),
        isNull(t.events.deletedAt),
        sql`lower(regexp_replace(trim(${t.events.title}), '\\s+', ' ', 'g')) = ${norm}`,
        gte(t.events.startsAt, new Date(input.startsAt.getTime() - 86_400_000)),
        lte(t.events.startsAt, new Date(input.startsAt.getTime() + 86_400_000)),
      ),
    )
    .limit(1);
  if (dup) throw new ConflictError('An event with this name already exists on that date.', { eventId: dup.id });

  const moderator = ctx.permissions.has('event:approve');
  const organizerType = organizerTypeFor(ctx);
  const [inst] = await db.select({ name: t.institutions.name, city: t.institutions.city }).from(t.institutions).where(eq(t.institutions.id, ctx.institutionId));

  const [created] = await db
    .insert(t.events)
    .values({
      institutionId: ctx.institutionId,
      organizerId: ctx.userId,
      departmentId: ctx.departmentId,
      title: input.title.trim(),
      description: input.description ?? null,
      category: input.category,
      visibility: input.visibility,
      organizerType,
      organizerName: input.organizerName?.trim() || inst?.name || null,
      verification: moderator ? 'VERIFIED_COLLEGE' : 'PENDING',
      mode: input.mode,
      venueText: input.venueText ?? null,
      city: input.city ?? (input.mode === 'ONLINE' ? null : inst?.city ?? null),
      area: input.area ?? null,
      onlineUrl: input.onlineUrl ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      capacity: input.capacity ?? null,
      registrationRequired: input.registrationRequired,
      registrationDeadline: input.registrationDeadline ?? null,
      registrationMode: input.registrationMode,
      waitlistEnabled: input.waitlistEnabled,
      priceInr: input.priceInr,
      certificateOffered: input.certificateOffered,
      teamSizeMin: input.teamSizeMin,
      teamSizeMax: input.teamSizeMax,
      eligibility: input.eligibility ?? null,
      rules: input.rules ?? null,
      prizes: input.prizes ?? null,
      agenda: input.agenda ?? [],
      faqs: input.faqs ?? [],
      tags: input.tags ?? [],
      contactEmail: input.contactEmail ?? null,
      coverUrl: input.coverUrl ?? null,
      status: moderator ? 'SCHEDULED' : 'PENDING_APPROVAL',
      publishedAt: moderator ? new Date() : null,
    })
    .returning({ id: t.events.id, status: t.events.status });

  await recordAudit(ctx, { action: 'EVENT_CREATED', entityType: 'event', entityId: created!.id, after: { title: input.title, status: created!.status, visibility: input.visibility }, ...meta });
  return created!;
}

/* ------------------------------ moderation -------------------------------- */

export async function listModerationQueue(ctx: AuthContext) {
  if (!ctx.permissions.has('event:approve')) throw new ForbiddenError();
  const pending = await db
    .select({ id: t.events.id, title: t.events.title, category: t.events.category, startsAt: t.events.startsAt, organizerName: t.events.organizerName, organizerType: t.events.organizerType, visibility: t.events.visibility, createdAt: t.events.createdAt })
    .from(t.events)
    .where(and(eq(t.events.institutionId, ctx.institutionId), eq(t.events.status, 'PENDING_APPROVAL'), isNull(t.events.deletedAt)))
    .orderBy(asc(t.events.createdAt));
  const reports = await db
    .select({ id: t.eventReports.id, eventId: t.eventReports.eventId, eventTitle: t.events.title, reason: t.eventReports.reason, details: t.eventReports.details, createdAt: t.eventReports.createdAt })
    .from(t.eventReports)
    .innerJoin(t.events, eq(t.events.id, t.eventReports.eventId))
    .where(and(eq(t.eventReports.institutionId, ctx.institutionId), eq(t.eventReports.status, 'OPEN')))
    .orderBy(desc(t.eventReports.createdAt));
  return { pending, reports };
}

export async function moderateEvent(
  ctx: AuthContext,
  eventId: string,
  input: { action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'SUSPEND'; note?: string | null },
  meta: Meta,
) {
  if (!ctx.permissions.has('event:approve')) throw new ForbiddenError();
  const [e] = await db.select().from(t.events).where(and(eq(t.events.id, eventId), eq(t.events.institutionId, ctx.institutionId))).limit(1);
  if (!e) throw new NotFoundError('Event');

  const verification = e.organizerType === 'CLUB' ? 'VERIFIED_CLUB' : e.organizerType === 'COLLEGE' ? 'VERIFIED_COLLEGE' : e.organizerType === 'EXTERNAL' ? 'VERIFIED_ORGANIZER' : 'COMMUNITY';
  const patch =
    input.action === 'APPROVE'
      ? { status: 'SCHEDULED' as const, verification, publishedAt: new Date(), moderationNote: input.note ?? null }
      : input.action === 'SUSPEND'
        ? { status: 'CANCELLED' as const, moderationNote: input.note ?? 'Suspended by moderators' }
        : { status: 'DRAFT' as const, moderationNote: input.note ?? (input.action === 'REJECT' ? 'Rejected' : 'Changes requested') };
  if (input.action === 'APPROVE' && e.status !== 'PENDING_APPROVAL') throw new ConflictError('Only pending events can be approved.');
  await db.update(t.events).set(patch).where(eq(t.events.id, e.id));

  if (e.organizerId) {
    await db.insert(t.notifications).values({
      institutionId: ctx.institutionId,
      userId: e.organizerId,
      title:
        input.action === 'APPROVE' ? `Your event is live: ${e.title}`
          : input.action === 'SUSPEND' ? `Your event was suspended: ${e.title}`
            : input.action === 'REJECT' ? `Your event was not approved: ${e.title}`
              : `Changes requested: ${e.title}`,
      body: input.note ?? null,
      priority: 'IMPORTANT',
      category: 'EVENT',
      actionUrl: `/organize/${e.id}`,
      sourceType: 'event',
      sourceId: e.id,
    });
  }
  if (input.action === 'SUSPEND') {
    await notifyAudience(e, { title: `Cancelled: ${e.title}`, body: input.note ?? 'This event has been cancelled.', priority: 'IMPORTANT' }, 'FOLLOWERS');
    await db.update(t.eventReports).set({ status: 'ACTIONED', resolvedById: ctx.userId, resolvedAt: new Date() }).where(and(eq(t.eventReports.eventId, e.id), eq(t.eventReports.status, 'OPEN')));
  }
  await recordAudit(ctx, {
    action: input.action === 'APPROVE' ? 'EVENT_APPROVED' : input.action === 'SUSPEND' ? 'EVENT_SUSPENDED' : 'EVENT_REJECTED',
    entityType: 'event',
    entityId: e.id,
    before: { status: e.status },
    after: { status: patch.status },
    reason: input.note ?? null,
    ...meta,
  });
}

export async function resolveReport(ctx: AuthContext, reportId: string, action: 'DISMISS' | 'ACTIONED') {
  if (!ctx.permissions.has('event:approve')) throw new ForbiddenError();
  const rows = await db
    .update(t.eventReports)
    .set({ status: action === 'DISMISS' ? 'DISMISSED' : 'ACTIONED', resolvedById: ctx.userId, resolvedAt: new Date() })
    .where(and(eq(t.eventReports.id, reportId), eq(t.eventReports.institutionId, ctx.institutionId)))
    .returning({ id: t.eventReports.id });
  if (!rows.length) throw new NotFoundError('Report');
}

/* ------------------------------ organiser --------------------------------- */

export async function listManagedEvents(ctx: AuthContext) {
  const conds = [eq(t.events.institutionId, ctx.institutionId), isNull(t.events.deletedAt)];
  if (!ctx.permissions.has('event:approve')) conds.push(eq(t.events.organizerId, ctx.userId));
  return db
    .select({
      id: t.events.id,
      title: t.events.title,
      status: t.events.status,
      startsAt: t.events.startsAt,
      category: t.events.category,
      visibility: t.events.visibility,
      capacity: t.events.capacity,
      registered: sql<number>`(SELECT count(*)::int FROM event_registrations r WHERE r.event_id = "events"."id" AND r.status = 'REGISTERED')`,
      checkedIn: sql<number>`(SELECT count(*)::int FROM event_checkins c WHERE c.event_id = "events"."id")`,
    })
    .from(t.events)
    .where(and(...conds))
    .orderBy(desc(t.events.startsAt))
    .limit(200);
}

export async function getManagedEvent(ctx: AuthContext, eventId: string) {
  const e = await loadManaged(ctx, eventId);
  const registrations = await db
    .select({
      id: t.eventRegistrations.id,
      status: t.eventRegistrations.status,
      code: t.eventRegistrations.code,
      teamName: t.eventRegistrations.teamName,
      note: t.eventRegistrations.note,
      registeredAt: t.eventRegistrations.registeredAt,
      attendedAt: t.eventRegistrations.attendedAt,
      name: sql<string>`${t.users.firstName} || ' ' || ${t.users.lastName}`,
      email: t.users.email,
      college: t.institutions.name,
      attendeeInstitutionId: t.eventRegistrations.attendeeInstitutionId,
    })
    .from(t.eventRegistrations)
    .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
    .leftJoin(t.institutions, eq(t.institutions.id, t.eventRegistrations.attendeeInstitutionId))
    .where(eq(t.eventRegistrations.eventId, e.id))
    .orderBy(asc(t.eventRegistrations.registeredAt));
  const certificates = await db.select({ registrationId: t.eventCertificates.registrationId }).from(t.eventCertificates).where(and(eq(t.eventCertificates.eventId, e.id), isNull(t.eventCertificates.revokedAt)));
  const updates = await db.select().from(t.eventUpdates).where(eq(t.eventUpdates.eventId, e.id)).orderBy(desc(t.eventUpdates.createdAt));
  const certSet = new Set(certificates.map((c) => c.registrationId));
  const active = registrations.filter((r) => r.status !== 'CANCELLED');
  return {
    event: e,
    // Staff see every attendee's email; a student organiser sees emails only for
    // attendees from their own college (other colleges' students stay private).
    registrations: registrations.map((r) => ({
      ...r,
      email: ctx.permissions.has('event:approve') || r.attendeeInstitutionId === ctx.institutionId || r.attendeeInstitutionId === null ? r.email : null,
      certified: certSet.has(r.id),
    })),
    updates,
    stats: {
      registered: active.filter((r) => r.status === 'REGISTERED').length,
      waitlisted: active.filter((r) => r.status === 'WAITLISTED').length,
      pending: active.filter((r) => r.status === 'PENDING_APPROVAL').length,
      checkedIn: active.filter((r) => r.attendedAt).length,
      noShows: e.endsAt < new Date() ? active.filter((r) => r.status === 'REGISTERED' && !r.attendedAt).length : 0,
      certificates: certSet.size,
    },
  };
}

export async function decideAttendee(ctx: AuthContext, eventId: string, registrationId: string, approve: boolean) {
  const e = await loadManaged(ctx, eventId);
  await db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(t.eventRegistrations)
      .where(and(eq(t.eventRegistrations.id, registrationId), eq(t.eventRegistrations.eventId, e.id)))
      .limit(1);
    if (!r || r.status !== 'PENDING_APPROVAL') throw new ConflictError('This registration is not waiting for a decision.');
    const [{ n }] = (await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM event_registrations WHERE event_id = ${e.id} AND status = 'REGISTERED'`)).rows as [{ n: number }];
    const full = e.capacity !== null && n >= e.capacity;
    const status = !approve ? 'REJECTED' : full ? (e.waitlistEnabled ? 'WAITLISTED' : null) : 'REGISTERED';
    if (!status) throw new ConflictError('The event is full and has no waitlist.');
    await tx.update(t.eventRegistrations).set({ status }).where(eq(t.eventRegistrations.id, r.id));
    await tx.insert(t.notifications).values({
      institutionId: r.attendeeInstitutionId ?? e.institutionId,
      userId: r.userId,
      title: status === 'REGISTERED' ? `Approved: ${e.title}` : status === 'WAITLISTED' ? `Approved — on the waitlist: ${e.title}` : `Not selected this time: ${e.title}`,
      priority: 'NORMAL',
      category: 'EVENT',
      actionUrl: `/student/events/${e.id}`,
      groupKey: `event:${e.id}`,
      sourceType: 'event',
      sourceId: e.id,
    });
  });
}

export type CheckInResult =
  | { status: 'CHECKED_IN' | 'ALREADY_CHECKED_IN'; name: string; code: string | null; registrationId: string }
  | { status: 'INVALID' | 'EXPIRED' | 'NOT_REGISTERED' | 'WRONG_EVENT'; message: string };

/**
 * Checks in by QR token (signed, short-lived) or by the pass code. Idempotent:
 * the unique index on event_checkins.registration_id means a second scan can
 * never create a second attendance record.
 */
export async function checkIn(ctx: AuthContext, eventId: string, input: { token?: string; code?: string }): Promise<CheckInResult> {
  const e = await loadManaged(ctx, eventId, { forCheckIn: true });

  let registrationId: string | null = null;
  let method: 'QR' | 'CODE' = 'CODE';
  if (input.token) {
    const v = verifyPassToken(input.token);
    if ('error' in v) {
      return v.error === 'EXPIRED'
        ? { status: 'EXPIRED', message: 'This pass has expired. Ask the attendee to reopen their pass.' }
        : { status: 'INVALID', message: 'This is not a valid CampusOS pass.' };
    }
    registrationId = v.registrationId;
    method = 'QR';
  }
  const where = registrationId
    ? eq(t.eventRegistrations.id, registrationId)
    : and(eq(t.eventRegistrations.eventId, e.id), eq(t.eventRegistrations.code, (input.code ?? '').trim().toUpperCase()));
  const [r] = await db
    .select({ id: t.eventRegistrations.id, eventId: t.eventRegistrations.eventId, status: t.eventRegistrations.status, code: t.eventRegistrations.code, userId: t.eventRegistrations.userId, first: t.users.firstName, last: t.users.lastName })
    .from(t.eventRegistrations)
    .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
    .where(where)
    .limit(1);
  if (!r) return { status: 'INVALID', message: 'No registration matches this code.' };
  if (r.eventId !== e.id) return { status: 'WRONG_EVENT', message: 'This pass is for a different event.' };
  if (r.status !== 'REGISTERED') return { status: 'NOT_REGISTERED', message: `This registration is ${r.status.toLowerCase().replace('_', ' ')}, not confirmed.` };

  const inserted = await db
    .insert(t.eventCheckins)
    .values({ institutionId: e.institutionId, eventId: e.id, registrationId: r.id, checkedInById: ctx.userId, method })
    .onConflictDoNothing()
    .returning({ id: t.eventCheckins.id });
  if (inserted.length) {
    await db.update(t.eventRegistrations).set({ attendedAt: new Date() }).where(and(eq(t.eventRegistrations.id, r.id), isNull(t.eventRegistrations.attendedAt)));
    await onVerifiedAttendance(r.userId, e.id);
  }
  return { status: inserted.length ? 'CHECKED_IN' : 'ALREADY_CHECKED_IN', name: `${r.first} ${r.last}`, code: r.code, registrationId: r.id };
}

/**
 * Verified attendance feeds gamification (XP, badges, weekly challenges). A
 * failure there must never fail a check-in at the door, so it is logged, not thrown.
 */
async function onVerifiedAttendance(userId: string, eventId: string) {
  await onEventAttended(userId, eventId).catch((error) => logger.warn('gamification.event_attended_failed', { eventId, error: String(error) }));
}

export async function issueCertificates(
  ctx: AuthContext,
  eventId: string,
  input: { kind?: string; registrationIds?: string[] },
  meta: Meta,
): Promise<{ issued: number }> {
  const e = await loadManaged(ctx, eventId);
  const kind = input.kind ?? 'PARTICIPATION';
  const conds = [eq(t.eventRegistrations.eventId, e.id), eq(t.eventRegistrations.status, 'REGISTERED'), isNotNull(t.eventRegistrations.attendedAt)];
  if (input.registrationIds?.length) conds.push(inArray(t.eventRegistrations.id, input.registrationIds));
  const eligible = await db
    .select({ id: t.eventRegistrations.id, userId: t.eventRegistrations.userId, inst: t.eventRegistrations.attendeeInstitutionId, first: t.users.firstName, last: t.users.lastName })
    .from(t.eventRegistrations)
    .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
    .where(and(...conds));
  // Certificates certify attendance: only checked-in registrants are eligible.
  let issued = 0;
  for (const r of eligible) {
    const rows = await db
      .insert(t.eventCertificates)
      .values({ institutionId: e.institutionId, eventId: e.id, registrationId: r.id, userId: r.userId, verificationCode: certificateCode(), kind, recipientName: `${r.first} ${r.last}`, issuedById: ctx.userId })
      .onConflictDoNothing()
      .returning({ id: t.eventCertificates.id });
    if (rows.length) {
      issued++;
      await db.insert(t.notifications).values({
        institutionId: r.inst ?? e.institutionId,
        userId: r.userId,
        title: `Certificate available: ${e.title}`,
        priority: 'NORMAL',
        category: 'EVENT',
        actionUrl: `/student/certificates/${rows[0]!.id}`,
        groupKey: `event:${e.id}`,
        sourceType: 'event_certificate',
        sourceId: rows[0]!.id,
      });
      await onCertificateIssued(r.userId, rows[0]!.id, e.title).catch((error) =>
        logger.warn('gamification.certificate_failed', { eventId: e.id, error: String(error) }),
      );
    }
  }
  await recordAudit(ctx, { action: 'CERTIFICATES_ISSUED', entityType: 'event', entityId: e.id, after: { kind, issued }, ...meta });
  return { issued };
}

async function notifyAudience(
  e: { id: string; institutionId: string; title: string },
  message: { title: string; body?: string | null; priority: 'CRITICAL' | 'IMPORTANT' | 'NORMAL' },
  audience: 'REGISTERED' | 'FOLLOWERS',
): Promise<number> {
  const live = and(eq(t.users.status, 'ACTIVE'), isNull(t.users.deletedAt));
  const registrants = await db
    .select({ userId: t.eventRegistrations.userId, inst: t.users.institutionId })
    .from(t.eventRegistrations)
    .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
    .where(and(eq(t.eventRegistrations.eventId, e.id), inArray(t.eventRegistrations.status, ['REGISTERED', 'WAITLISTED', 'PENDING_APPROVAL']), live));
  // Followers from other colleges only while the event is still open to them.
  const [current] = await db.select({ visibility: t.events.visibility }).from(t.events).where(eq(t.events.id, e.id)).limit(1);
  const savers =
    audience === 'FOLLOWERS'
      ? await db
          .select({ userId: t.eventSaves.userId, inst: t.users.institutionId })
          .from(t.eventSaves)
          .innerJoin(t.users, eq(t.users.id, t.eventSaves.userId))
          .where(and(eq(t.eventSaves.eventId, e.id), live, current?.visibility === 'PUBLIC' ? sql`true` : eq(t.users.institutionId, e.institutionId)))
      : [];
  const recipients = new Map<string, string>();
  for (const r of [...registrants, ...savers]) recipients.set(r.userId, r.inst);
  const rows = [...recipients].map(([userId, inst]) => ({
    institutionId: inst,
    userId,
    title: message.title,
    body: message.body ?? null,
    priority: message.priority,
    category: 'EVENT' as const,
    actionUrl: `/events/${e.id}`,
    groupKey: `event:${e.id}`,
    sourceType: 'event',
    sourceId: e.id,
  }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(t.notifications).values(rows.slice(i, i + 500));
  return rows.length;
}

/**
 * One update, one audience — instead of a message pasted into five WhatsApp
 * groups. Priority follows the kind (venue/time change → important,
 * emergency → critical) and delivery follows each student's preferences.
 */
export async function postEventUpdate(
  ctx: AuthContext,
  eventId: string,
  input: { kind: string; title: string; body?: string | null; audience: 'REGISTERED' | 'FOLLOWERS' },
  meta: Meta,
) {
  const e = await loadManaged(ctx, eventId);
  await enforceRateLimit(keyFor('event:update', e.id), { limit: 12, windowSec: 86_400 }, 'This event has sent many updates today.');
  const priority = updatePriority(input.kind);
  const count = await notifyAudience(e, { title: `${e.title}: ${input.title}`, body: input.body, priority }, input.audience);
  const [row] = await db
    .insert(t.eventUpdates)
    .values({ institutionId: e.institutionId, eventId: e.id, authorId: ctx.userId, kind: input.kind, title: input.title, body: input.body ?? null, priority, audience: input.audience, recipientCount: count })
    .returning({ id: t.eventUpdates.id });
  await recordAudit(ctx, { action: 'EVENT_UPDATE_POSTED', entityType: 'event', entityId: e.id, after: { kind: input.kind, recipients: count }, ...meta });
  return { id: row!.id, recipients: count };
}

/* ------------------------------ edit & cancel ------------------------------ */

const sameTime = (a: Date | null | undefined, b: Date | null | undefined) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Edit an event (organiser or moderator). Guard rails:
 *   · past or cancelled events can't be edited;
 *   · capacity can't drop below the number already registered;
 *   · a non-moderator editing a returned (DRAFT) event resubmits it; widening
 *     a live event to PUBLIC sends it back for approval;
 *   · a changed time or venue is announced automatically to registrants and
 *     followers as an IMPORTANT update — nobody turns up at the old place.
 */
export async function updateEvent(ctx: AuthContext, eventId: string, input: EventInput, meta: Meta) {
  const e = await loadManaged(ctx, eventId);
  if (e.status === 'CANCELLED') throw new ConflictError('This event was cancelled and can no longer be edited.');
  if (e.endsAt < new Date()) throw new ConflictError('This event has already ended.');
  if (input.endsAt <= input.startsAt) throw new AppError('The event must end after it starts.', 422, 'BAD_TIMES');
  if (input.registrationDeadline && input.registrationDeadline > input.endsAt) {
    throw new AppError('Registration must close before the event ends.', 422, 'BAD_DEADLINE');
  }
  const moderator = ctx.permissions.has('event:approve');
  let status = e.status;
  let verification = e.verification;
  if (!moderator && e.status === 'DRAFT') status = 'PENDING_APPROVAL';
  if (!moderator && e.status === 'SCHEDULED' && e.visibility !== 'PUBLIC' && input.visibility === 'PUBLIC') {
    status = 'PENDING_APPROVAL';
    verification = 'PENDING';
  }

  // Same default as creation: an in-person event without a city keeps its current one.
  const city = input.city ?? (input.mode === 'ONLINE' ? null : (e.city ?? null));
  const timeChanged = !sameTime(e.startsAt, input.startsAt) || !sameTime(e.endsAt, input.endsAt);
  const venueChanged =
    e.mode !== input.mode ||
    (e.venueText ?? null) !== (input.venueText ?? null) ||
    (e.area ?? null) !== (input.area ?? null) ||
    (e.city ?? null) !== city ||
    (e.onlineUrl ?? null) !== (input.onlineUrl ?? null);

  // One transaction, with the event row locked: registrations take the same
  // lock, so the capacity check can't race a sign-up.
  const promoted = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM events WHERE id = ${e.id} FOR UPDATE`);
    const [{ n: registered }] = (
      await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM event_registrations WHERE event_id = ${e.id} AND status = 'REGISTERED'`)
    ).rows as [{ n: number }];
    if (input.capacity != null && input.capacity < registered) {
      throw new ConflictError(`${registered} people are already registered — capacity can’t be lower than that.`);
    }
    await tx
      .update(t.events)
      .set({
        title: input.title.trim(),
        description: input.description ?? null,
        category: input.category,
        visibility: input.visibility,
        organizerName: input.organizerName?.trim() || e.organizerName,
        mode: input.mode,
        venueText: input.venueText ?? null,
        city,
        area: input.area ?? null,
        onlineUrl: input.onlineUrl ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        capacity: input.capacity ?? null,
        registrationRequired: input.registrationRequired,
        registrationDeadline: input.registrationDeadline ?? null,
        registrationMode: input.registrationMode,
        waitlistEnabled: input.waitlistEnabled,
        priceInr: input.priceInr,
        certificateOffered: input.certificateOffered,
        teamSizeMin: input.teamSizeMin,
        teamSizeMax: input.teamSizeMax,
        eligibility: input.eligibility ?? null,
        rules: input.rules ?? null,
        prizes: input.prizes ?? null,
        agenda: input.agenda ?? [],
        faqs: input.faqs ?? [],
        tags: input.tags ?? [],
        contactEmail: input.contactEmail ?? null,
        coverUrl: input.coverUrl ?? e.coverUrl,
        status,
        verification,
        updatedAt: new Date(),
      })
      .where(eq(t.events.id, e.id));

    // More seats (or no limit any more): move people off the waitlist, in order.
    if (status !== 'SCHEDULED')
      return [] as {
        id: string;
        userId: string;
        attendeeInstitutionId: string | null;
      }[];
    const free = input.capacity == null ? null : input.capacity - registered;
    if (free !== null && free <= 0) return [];
    const next = await tx
      .select({
        id: t.eventRegistrations.id,
        userId: t.eventRegistrations.userId,
        attendeeInstitutionId: t.eventRegistrations.attendeeInstitutionId,
      })
      .from(t.eventRegistrations)
      .where(and(eq(t.eventRegistrations.eventId, e.id), eq(t.eventRegistrations.status, 'WAITLISTED')))
      .orderBy(asc(t.eventRegistrations.registeredAt))
      .limit(free ?? 10_000);
    if (next.length) {
      await tx
        .update(t.eventRegistrations)
        .set({ status: 'REGISTERED' })
        .where(
          inArray(
            t.eventRegistrations.id,
            next.map((r) => r.id),
          ),
        );
      await tx.insert(t.notifications).values(
        next.map((r) => ({
          institutionId: r.attendeeInstitutionId ?? e.institutionId,
          userId: r.userId,
          title: `A place opened up — you're in: ${input.title.trim()}`,
          body: 'You moved off the waitlist. Your pass is ready.',
          priority: 'IMPORTANT' as const,
          category: 'EVENT' as const,
          actionUrl: `/student/events/${e.id}`,
          groupKey: `event:${e.id}`,
          sourceType: 'event',
          sourceId: e.id,
        })),
      );
    }
    return next;
  });

  const announced: string[] = [];
  if (e.status === 'SCHEDULED' && status === 'SCHEDULED' && (timeChanged || venueChanged)) {
    const where = input.mode === 'ONLINE' ? 'Online' : [input.venueText, input.area, city].filter(Boolean).join(', ');
    const when = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: DISPLAY_TIME_ZONE,
    }).format(input.startsAt);
    const kind = timeChanged ? 'TIME_CHANGED' : 'VENUE_CHANGED';
    const title = timeChanged && venueChanged ? `New time and place: ${when} · ${where}` : timeChanged ? `New time: ${when}` : `New venue: ${where}`;
    const priority = updatePriority(kind);
    const count = await notifyAudience(
      { id: e.id, institutionId: e.institutionId, title: input.title },
      { title: `${input.title}: ${title}`, priority },
      'FOLLOWERS',
    );
    await db.insert(t.eventUpdates).values({
      institutionId: e.institutionId,
      eventId: e.id,
      authorId: ctx.userId,
      kind,
      title,
      body: null,
      priority,
      audience: 'FOLLOWERS',
      recipientCount: count,
    });
    announced.push(kind);
  }

  await recordAudit(ctx, {
    action: 'EVENT_EDITED',
    entityType: 'event',
    entityId: e.id,
    before: {
      status: e.status,
      startsAt: e.startsAt.toISOString(),
      venue: e.venueText,
      visibility: e.visibility,
      capacity: e.capacity,
    },
    after: {
      status,
      startsAt: input.startsAt.toISOString(),
      venue: input.venueText ?? null,
      visibility: input.visibility,
      capacity: input.capacity ?? null,
      announced,
      promoted: promoted.length,
    },
    ...meta,
  });
  return { id: e.id, status, announced, promoted: promoted.length };
}

/** Cancel an event and tell everyone registered, waitlisted or following. */
export async function cancelEvent(ctx: AuthContext, eventId: string, reason: string, meta: Meta) {
  const e = await loadManaged(ctx, eventId);
  if (e.status === 'CANCELLED') throw new ConflictError('This event is already cancelled.');
  if (e.endsAt < new Date()) throw new ConflictError('This event has already ended.');
  await db.update(t.events).set({ status: 'CANCELLED', moderationNote: reason, updatedAt: new Date() }).where(eq(t.events.id, e.id));
  let count = 0;
  if (e.status === 'SCHEDULED') {
    count = await notifyAudience(e, { title: `Cancelled: ${e.title}`, body: reason, priority: 'IMPORTANT' }, 'FOLLOWERS');
    await db.insert(t.eventUpdates).values({
      institutionId: e.institutionId,
      eventId: e.id,
      authorId: ctx.userId,
      kind: 'CANCELLED',
      title: 'This event has been cancelled',
      body: reason,
      priority: 'IMPORTANT',
      audience: 'FOLLOWERS',
      recipientCount: count,
    });
  }
  await recordAudit(ctx, {
    action: 'EVENT_CANCELLED',
    entityType: 'event',
    entityId: e.id,
    before: { status: e.status },
    after: { status: 'CANCELLED', reason, notified: count },
    ...meta,
  });
  return { id: e.id, notified: count };
}
