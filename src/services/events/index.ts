import 'server-only';
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, NotFoundError, pgErrorOf } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { isEnabled } from '@/lib/features';
import {
  DISCOVERY_TABS,
  decideRegistration,
  distanceKm,
  registrationCode,
  relevanceScore,
  whenWindow,
  DEMO_SOURCE,
  type RegistrationStatus,
} from './rules';

export * from './rules';

/**
 * EVENTS SERVICE — discovery and participation (student side).
 * ---------------------------------------------------------------------------
 * Visibility: a student sees every published event of their own college, and
 * PUBLIC events of other active colleges. INSTITUTION-only events of another
 * college are never returned — the same answer as "does not exist".
 */

type Ctx = Pick<AuthContext, 'userId' | 'institutionId' | 'permissions' | 'firstName' | 'fullName' | 'featureFlags'>;

/** Cross-college discovery is a separate module switch from events themselves. */
function discoversOtherColleges(ctx: Ctx): boolean {
  return isEnabled(ctx.featureFlags, 'event_discovery_enabled');
}

const VISIBLE_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;

/** SQL predicate: events this viewer may see in discovery. */
function visibleTo(ctx: Ctx): SQL {
  return and(
    isNull(t.events.deletedAt),
    inArray(t.events.status, [...VISIBLE_STATUSES]),
    discoversOtherColleges(ctx)
      ? or(
          eq(t.events.institutionId, ctx.institutionId),
          and(eq(t.events.visibility, 'PUBLIC'), eq(t.institutions.isActive, true)),
        )
      : eq(t.events.institutionId, ctx.institutionId),
  )!;
}

// Correlated subquery: the outer column must be written fully qualified. Drizzle
// renders ${t.events.id} as a bare "id" inside sql``, which would bind to r.id.
const registeredCountSql = sql<number>`(
  SELECT count(*)::int FROM event_registrations r
   WHERE r.event_id = "events"."id" AND r.status = 'REGISTERED')`;

export interface EventFilters {
  tab?: string;
  q?: string;
  city?: string;
  mode?: 'OFFLINE' | 'ONLINE' | 'HYBRID';
  free?: boolean;
  certificate?: boolean;
  when?: 'today' | 'weekend' | 'week' | 'month' | 'upcoming' | 'past';
  mine?: 'registered' | 'saved' | 'college';
  radiusKm?: number;
  sort?: 'relevance' | 'date';
  limit?: number;
}

export interface EventCard {
  id: string;
  title: string;
  category: string;
  organizerName: string;
  institutionName: string;
  institutionShort: string | null;
  ownCollege: boolean;
  startsAt: Date;
  endsAt: Date;
  mode: string;
  city: string | null;
  area: string | null;
  venue: string | null;
  priceInr: number;
  certificateOffered: boolean;
  tags: string[];
  coverUrl: string | null;
  verification: string;
  status: string;
  capacity: number | null;
  registeredCount: number;
  registrationRequired: boolean;
  registrationDeadline: Date | null;
  myStatus: RegistrationStatus | null;
  saved: boolean;
  distanceKm: number | null;
  demo: boolean;
}

export async function listEvents(ctx: Ctx, filters: EventFilters = {}, now = new Date()): Promise<EventCard[]> {
  const conds: SQL[] = [visibleTo(ctx)];
  const tab = DISCOVERY_TABS.find((d) => d.key === filters.tab);
  if (tab?.categories) conds.push(inArray(t.events.category, tab.categories));
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        ilike(t.events.title, q),
        ilike(t.events.description, q),
        ilike(t.events.organizerName, q),
        ilike(t.institutions.name, q),
        sql`${t.events.tags}::text ILIKE ${q}`,
      )!,
    );
  }
  if (filters.city) {
    conds.push(or(ilike(t.events.city, filters.city), eq(t.events.mode, 'ONLINE'))!);
  }
  if (filters.mode) conds.push(eq(t.events.mode, filters.mode));
  if (filters.free) conds.push(eq(t.events.priceInr, 0));
  if (filters.certificate) conds.push(eq(t.events.certificateOffered, true));
  if (filters.mine === 'college') conds.push(eq(t.events.institutionId, ctx.institutionId));
  // "Mine" filters run in SQL, before the LIMIT — filtering afterwards dropped
  // registrations once there were more upcoming events than the limit.
  if (filters.mine === 'registered') {
    conds.push(and(isNotNull(t.eventRegistrations.id), notInArray(t.eventRegistrations.status, ['CANCELLED', 'REJECTED']))!);
  }
  if (filters.mine === 'saved') conds.push(isNotNull(t.eventSaves.id));

  if (filters.when === 'past') {
    conds.push(lt(t.events.endsAt, now));
  } else {
    const w = whenWindow(filters.when ?? 'upcoming', now);
    conds.push(gte(t.events.endsAt, w.from));
    if (w.to) conds.push(lt(t.events.startsAt, w.to));
  }

  const rows = await db
    .select({
      id: t.events.id,
      title: t.events.title,
      category: t.events.category,
      organizerName: t.events.organizerName,
      institutionId: t.events.institutionId,
      institutionName: t.institutions.name,
      institutionShort: t.institutions.shortName,
      instLat: t.institutions.latitude,
      instLng: t.institutions.longitude,
      startsAt: t.events.startsAt,
      endsAt: t.events.endsAt,
      mode: t.events.mode,
      city: t.events.city,
      area: t.events.area,
      venueText: t.events.venueText,
      roomCode: t.rooms.code,
      lat: t.events.latitude,
      lng: t.events.longitude,
      priceInr: t.events.priceInr,
      certificateOffered: t.events.certificateOffered,
      tags: t.events.tags,
      coverUrl: t.events.coverUrl,
      verification: t.events.verification,
      status: t.events.status,
      capacity: t.events.capacity,
      registrationRequired: t.events.registrationRequired,
      registrationDeadline: t.events.registrationDeadline,
      registeredCount: registeredCountSql,
      myStatus: t.eventRegistrations.status,
      savedId: t.eventSaves.id,
      sourceName: t.events.sourceName,
    })
    .from(t.events)
    .innerJoin(t.institutions, eq(t.institutions.id, t.events.institutionId))
    .leftJoin(t.rooms, eq(t.rooms.id, t.events.roomId))
    .leftJoin(t.eventRegistrations, and(eq(t.eventRegistrations.eventId, t.events.id), eq(t.eventRegistrations.userId, ctx.userId)))
    .leftJoin(t.eventSaves, and(eq(t.eventSaves.eventId, t.events.id), eq(t.eventSaves.userId, ctx.userId)))
    .where(and(...conds))
    .orderBy(filters.when === 'past' ? desc(t.events.startsAt) : asc(t.events.startsAt))
    .limit(Math.min(filters.limit ?? 60, 200));

  // The viewer's campus location, for distance.
  const [home] = await db
    .select({ lat: t.institutions.latitude, lng: t.institutions.longitude })
    .from(t.institutions)
    .where(eq(t.institutions.id, ctx.institutionId));
  const homePt = home?.lat && home?.lng ? { lat: Number(home.lat), lng: Number(home.lng) } : null;

  let cards: EventCard[] = rows.map((r) => {
    const pt = r.lat && r.lng ? { lat: Number(r.lat), lng: Number(r.lng) } : r.instLat && r.instLng ? { lat: Number(r.instLat), lng: Number(r.instLng) } : null;
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      organizerName: r.organizerName ?? r.institutionName,
      institutionName: r.institutionName,
      institutionShort: r.institutionShort,
      ownCollege: r.institutionId === ctx.institutionId,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      mode: r.mode,
      city: r.city,
      area: r.area,
      venue: r.roomCode ?? r.venueText,
      priceInr: r.priceInr,
      certificateOffered: r.certificateOffered,
      tags: r.tags ?? [],
      coverUrl: r.coverUrl,
      verification: r.verification,
      status: r.status,
      capacity: r.capacity,
      registeredCount: Number(r.registeredCount ?? 0),
      registrationRequired: r.registrationRequired,
      registrationDeadline: r.registrationDeadline,
      myStatus: (r.myStatus as RegistrationStatus | null) ?? null,
      saved: !!r.savedId,
      distanceKm: homePt && pt && r.mode !== 'ONLINE' ? Math.round(distanceKm(homePt, pt) * 10) / 10 : null,
      demo: r.sourceName === DEMO_SOURCE,
    };
  });

  if (filters.radiusKm) cards = cards.filter((c) => c.mode === 'ONLINE' || (c.distanceKm !== null && c.distanceKm <= filters.radiusKm!));
  if ((filters.sort ?? 'relevance') === 'relevance' && filters.when !== 'past') {
    cards.sort((a, b) => relevanceScore(b, now) - relevanceScore(a, now));
  }
  return cards;
}

/* ------------------------------ event detail ------------------------------ */

export async function getEvent(ctx: Ctx, eventId: string) {
  const [row] = await db
    .select({
      event: t.events,
      institutionName: t.institutions.name,
      institutionShort: t.institutions.shortName,
      institutionActive: t.institutions.isActive,
      roomCode: t.rooms.code,
      registeredCount: registeredCountSql,
    })
    .from(t.events)
    .innerJoin(t.institutions, eq(t.institutions.id, t.events.institutionId))
    .leftJoin(t.rooms, eq(t.rooms.id, t.events.roomId))
    .where(and(eq(t.events.id, eventId), isNull(t.events.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError('Event');
  const e = row.event;
  const own = e.institutionId === ctx.institutionId;
  const manager = canManageEvent(ctx, e);
  const published = (VISIBLE_STATUSES as readonly string[]).includes(e.status);
  const visible = manager || (published && (own || (discoversOtherColleges(ctx) && e.visibility === 'PUBLIC' && row.institutionActive)));
  if (!visible) throw new NotFoundError('Event');

  const [reg] = await db
    .select()
    .from(t.eventRegistrations)
    .where(and(eq(t.eventRegistrations.eventId, e.id), eq(t.eventRegistrations.userId, ctx.userId)))
    .limit(1);
  const [saved] = await db
    .select({ id: t.eventSaves.id })
    .from(t.eventSaves)
    .where(and(eq(t.eventSaves.eventId, e.id), eq(t.eventSaves.userId, ctx.userId)))
    .limit(1);
  const [checkin] = reg
    ? await db.select({ at: t.eventCheckins.createdAt }).from(t.eventCheckins).where(eq(t.eventCheckins.registrationId, reg.id)).limit(1)
    : [];
  const waitlistPosition =
    reg?.status === 'WAITLISTED'
      ? Number(
          (
            await db.execute<{ n: number }>(sql`
              SELECT count(*)::int + 1 AS n FROM event_registrations
               WHERE event_id = ${e.id} AND status = 'WAITLISTED' AND registered_at < ${reg.registeredAt}`)
          ).rows[0]?.n ?? 1,
        )
      : null;
  const updates = await db
    .select({ id: t.eventUpdates.id, kind: t.eventUpdates.kind, title: t.eventUpdates.title, body: t.eventUpdates.body, createdAt: t.eventUpdates.createdAt })
    .from(t.eventUpdates)
    .where(eq(t.eventUpdates.eventId, e.id))
    .orderBy(desc(t.eventUpdates.createdAt))
    .limit(20);
  const [certificate] = reg
    ? await db
        .select({ id: t.eventCertificates.id, code: t.eventCertificates.verificationCode, kind: t.eventCertificates.kind })
        .from(t.eventCertificates)
        .where(and(eq(t.eventCertificates.registrationId, reg.id), isNull(t.eventCertificates.revokedAt)))
        .limit(1)
    : [];

  return {
    event: e,
    institutionName: row.institutionName,
    institutionShort: row.institutionShort,
    ownCollege: own,
    venue: row.roomCode ?? e.venueText,
    registeredCount: Number(row.registeredCount ?? 0),
    registration: reg
      ? { id: reg.id, status: reg.status as RegistrationStatus, code: reg.code, teamName: reg.teamName, registeredAt: reg.registeredAt, checkedInAt: checkin?.at ?? reg.attendedAt ?? null, waitlistPosition }
      : null,
    saved: !!saved,
    updates,
    certificate: certificate ?? null,
    canManage: manager,
  };
}

/** Organiser, or a moderator of the event's own college. */
export function canManageEvent(ctx: Ctx, e: { institutionId: string; organizerId: string | null }): boolean {
  if (e.institutionId !== ctx.institutionId) return false;
  if (ctx.permissions.has('event:approve')) return true;
  return e.organizerId === ctx.userId && ctx.permissions.has('event:create');
}

/* ---------------------------- registration -------------------------------- */

export async function registerForEvent(
  ctx: Ctx & { institutionId: string },
  eventId: string,
  input: { teamName?: string | null; note?: string | null } = {},
  now = new Date(),
): Promise<{ status: RegistrationStatus; code: string | null; waitlistPosition?: number }> {
  await enforceRateLimit(keyFor('event:register', ctx.userId), { limit: 60, windowSec: 3600 }, 'Too many registrations in a short time.');
  const detail = await getEvent(ctx, eventId); // visibility check
  const e = detail.event;
  if (!e.registrationRequired) {
    throw new AppError('This event does not need registration — just turn up!', 400, 'NO_REGISTRATION');
  }
  if (detail.registration && ['REGISTERED', 'WAITLISTED', 'PENDING_APPROVAL'].includes(detail.registration.status)) {
    return { status: detail.registration.status, code: detail.registration.code }; // idempotent
  }
  if (detail.registration?.status === 'REJECTED') {
    throw new AppError('The organisers declined your earlier registration for this event.', 409, 'REJECTED');
  }

  const attempt = async (forceWaitlist: boolean) =>
    db.transaction(async (tx) => {
      const [locked] = await tx.execute<{ capacity: number | null }>(
        sql`SELECT capacity FROM events WHERE id = ${e.id} FOR UPDATE`,
      ).then((r) => r.rows);
      const [{ n }] = (await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM event_registrations WHERE event_id = ${e.id} AND status = 'REGISTERED'`)).rows as [{ n: number }];
      const decision = decideRegistration({
        eventStatus: e.status,
        registrationRequired: e.registrationRequired,
        mode: e.registrationMode,
        capacity: locked?.capacity ?? null,
        registeredCount: n,
        waitlistEnabled: e.waitlistEnabled,
        deadline: e.registrationDeadline,
        endsAt: e.endsAt,
        now,
      });
      if (!decision.ok) throw new AppError(decision.message, 409, decision.code);
      const status = forceWaitlist ? 'WAITLISTED' : decision.status;
      const code = registrationCode();
      const values = {
        status,
        code,
        teamName: input.teamName ?? null,
        note: input.note ?? null,
        registeredAt: now,
        cancelledAt: null,
        attendeeInstitutionId: ctx.institutionId,
      };
      if (detail.registration) {
        await tx.update(t.eventRegistrations).set(values).where(eq(t.eventRegistrations.id, detail.registration.id));
      } else {
        await tx.insert(t.eventRegistrations).values({ institutionId: e.institutionId, eventId: e.id, userId: ctx.userId, ...values });
      }
      // Registering follows the event, so organiser updates reach you.
      await tx.insert(t.eventSaves).values({ institutionId: e.institutionId, eventId: e.id, userId: ctx.userId }).onConflictDoNothing();
      await tx.insert(t.notifications).values({
        institutionId: ctx.institutionId,
        userId: ctx.userId,
        title:
          status === 'REGISTERED' ? `You're registered: ${e.title}`
            : status === 'WAITLISTED' ? `You're on the waitlist: ${e.title}`
              : `Registration sent: ${e.title}`,
        body: status === 'PENDING_APPROVAL' ? 'The organisers will confirm your place.' : `Your pass code is ${code}.`,
        priority: 'NORMAL',
        category: 'EVENT',
        actionUrl: `/student/events/${e.id}`,
        groupKey: `event:${e.id}`,
        sourceType: 'event',
        sourceId: e.id,
      });
      return { status: status as RegistrationStatus, code };
    });

  try {
    return await attempt(false);
  } catch (error) {
    // Lost the race for the last seat: the DB trigger refused. Join the waitlist instead.
    if (pgErrorOf(error).constraint === 'event_registration_capacity' || /this event is full/.test(String((error as Error)?.message) + String((error as { cause?: Error })?.cause?.message))) {
      if (e.waitlistEnabled) return attempt(true);
      throw new AppError('Registration is full.', 409, 'FULL');
    }
    if (pgErrorOf(error).constraint === 'event_registration_deadline') {
      throw new AppError('Registration for this event has closed.', 409, 'CLOSED');
    }
    throw error;
  }
}

export async function cancelRegistration(ctx: Ctx, eventId: string): Promise<{ promoted: boolean }> {
  const detail = await getEvent(ctx, eventId);
  const reg = detail.registration;
  if (!reg || reg.status === 'CANCELLED' || reg.status === 'REJECTED') throw new NotFoundError('Registration');
  if (reg.checkedInAt) throw new ConflictError('You have already checked in to this event.');

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`);
    await tx
      .update(t.eventRegistrations)
      .set({ status: 'CANCELLED', cancelledAt: new Date() })
      .where(eq(t.eventRegistrations.id, reg.id));
    if (reg.status !== 'REGISTERED') return { promoted: false };

    const [next] = await tx
      .select({ id: t.eventRegistrations.id, userId: t.eventRegistrations.userId, attendeeInstitutionId: t.eventRegistrations.attendeeInstitutionId })
      .from(t.eventRegistrations)
      .where(and(eq(t.eventRegistrations.eventId, eventId), eq(t.eventRegistrations.status, 'WAITLISTED')))
      .orderBy(asc(t.eventRegistrations.registeredAt))
      .limit(1);
    if (!next) return { promoted: false };
    await tx.update(t.eventRegistrations).set({ status: 'REGISTERED' }).where(eq(t.eventRegistrations.id, next.id));
    await tx.insert(t.notifications).values({
      institutionId: next.attendeeInstitutionId ?? detail.event.institutionId,
      userId: next.userId,
      title: `A place opened up — you're in: ${detail.event.title}`,
      body: 'You moved off the waitlist. Your pass is ready.',
      priority: 'IMPORTANT',
      category: 'EVENT',
      actionUrl: `/student/events/${eventId}`,
      groupKey: `event:${eventId}`,
      sourceType: 'event',
      sourceId: eventId,
    });
    return { promoted: true };
  });
}

export async function setSaved(ctx: Ctx, eventId: string, saved: boolean): Promise<{ saved: boolean }> {
  const detail = await getEvent(ctx, eventId);
  if (saved) {
    await db.insert(t.eventSaves).values({ institutionId: detail.event.institutionId, eventId, userId: ctx.userId }).onConflictDoNothing();
  } else {
    await db.delete(t.eventSaves).where(and(eq(t.eventSaves.eventId, eventId), eq(t.eventSaves.userId, ctx.userId)));
  }
  return { saved };
}

export async function reportEvent(ctx: Ctx, eventId: string, input: { reason: string; details?: string | null }) {
  await enforceRateLimit(keyFor('event:report', ctx.userId), { limit: 20, windowSec: 86_400 }, 'Too many reports today.');
  const detail = await getEvent(ctx, eventId);
  await db
    .insert(t.eventReports)
    .values({ institutionId: detail.event.institutionId, eventId, reporterId: ctx.userId, reason: input.reason, details: input.details ?? null })
    .onConflictDoNothing();
  return { reported: true };
}

/* ----------------------------- certificates ------------------------------- */

export async function listMyCertificates(ctx: Pick<AuthContext, 'userId'>) {
  return db
    .select({
      id: t.eventCertificates.id,
      code: t.eventCertificates.verificationCode,
      kind: t.eventCertificates.kind,
      issuedAt: t.eventCertificates.issuedAt,
      eventId: t.events.id,
      eventTitle: t.events.title,
      eventDate: t.events.startsAt,
      organizerName: t.events.organizerName,
      institutionName: t.institutions.name,
    })
    .from(t.eventCertificates)
    .innerJoin(t.events, eq(t.events.id, t.eventCertificates.eventId))
    .innerJoin(t.institutions, eq(t.institutions.id, t.events.institutionId))
    .where(and(eq(t.eventCertificates.userId, ctx.userId), isNull(t.eventCertificates.revokedAt)))
    .orderBy(desc(t.eventCertificates.issuedAt));
}

export async function getMyCertificate(ctx: Pick<AuthContext, 'userId'>, id: string) {
  const [row] = await db
    .select({
      id: t.eventCertificates.id,
      code: t.eventCertificates.verificationCode,
      kind: t.eventCertificates.kind,
      recipientName: t.eventCertificates.recipientName,
      issuedAt: t.eventCertificates.issuedAt,
      eventTitle: t.events.title,
      eventStart: t.events.startsAt,
      eventEnd: t.events.endsAt,
      organizerName: t.events.organizerName,
      institutionName: t.institutions.name,
    })
    .from(t.eventCertificates)
    .innerJoin(t.events, eq(t.events.id, t.eventCertificates.eventId))
    .innerJoin(t.institutions, eq(t.institutions.id, t.events.institutionId))
    .where(and(eq(t.eventCertificates.id, id), eq(t.eventCertificates.userId, ctx.userId), isNull(t.eventCertificates.revokedAt)))
    .limit(1);
  if (!row) throw new NotFoundError('Certificate');
  return row;
}

/**
 * Public verification. Shows only what a verifier needs: that this code was
 * issued, for which event, by whom, when, and to a name shortened to first
 * name + initial. No email, college ID or other personal data.
 */
export async function verifyCertificate(code: string) {
  const normalised = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(normalised)) return null;
  const [row] = await db
    .select({
      kind: t.eventCertificates.kind,
      recipientName: t.eventCertificates.recipientName,
      issuedAt: t.eventCertificates.issuedAt,
      revokedAt: t.eventCertificates.revokedAt,
      eventTitle: t.events.title,
      eventDate: t.events.startsAt,
      organizerName: t.events.organizerName,
      institutionName: t.institutions.name,
    })
    .from(t.eventCertificates)
    .innerJoin(t.events, eq(t.events.id, t.eventCertificates.eventId))
    .innerJoin(t.institutions, eq(t.institutions.id, t.events.institutionId))
    .where(eq(t.eventCertificates.verificationCode, normalised))
    .limit(1);
  if (!row) return null;
  const [first, ...rest] = row.recipientName.split(/\s+/);
  const last = rest.pop();
  return { ...row, recipientName: last ? `${first} ${last[0]}.` : (first ?? '') };
}

/** Registrations of the caller for the "My events" view. */
export async function myEventCounts(ctx: Pick<AuthContext, 'userId'>) {
  const rows = await db
    .select({ status: t.eventRegistrations.status, n: sql<number>`count(*)::int` })
    .from(t.eventRegistrations)
    .where(and(eq(t.eventRegistrations.userId, ctx.userId), ne(t.eventRegistrations.status, 'CANCELLED')))
    .groupBy(t.eventRegistrations.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}
