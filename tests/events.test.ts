import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import {
  decideRegistration,
  signPassToken,
  verifyPassToken,
  registrationCode,
  certificateCode,
  distanceKm,
  whenWindow,
  updatePriority,
  listEvents,
  getEvent,
  registerForEvent,
  cancelRegistration,
  setSaved,
  verifyCertificate,
} from '@/services/events';
import { cancelEvent, checkIn, createEvent, listManagedEvents, issueCertificates, moderateEvent, postEventUpdate, updateEvent } from '@/services/events/organizer';
import { buildIcs, escapeIcsText, foldIcsLine } from '@/lib/ics';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/* --------------------------------- pure ----------------------------------- */

const base = {
  eventStatus: 'SCHEDULED',
  registrationRequired: true,
  mode: 'INSTANT',
  capacity: 10,
  registeredCount: 0,
  waitlistEnabled: true,
  deadline: null as Date | null,
  endsAt: new Date(Date.now() + 86_400_000),
  now: new Date(),
};

describe('registration decision', () => {
  it('registers, waitlists when full, or refuses with a reason', () => {
    expect(decideRegistration(base)).toEqual({ ok: true, status: 'REGISTERED' });
    expect(decideRegistration({ ...base, registeredCount: 10 })).toEqual({ ok: true, status: 'WAITLISTED' });
    expect(decideRegistration({ ...base, registeredCount: 10, waitlistEnabled: false })).toMatchObject({ ok: false, code: 'FULL' });
    expect(decideRegistration({ ...base, mode: 'APPROVAL' })).toEqual({ ok: true, status: 'PENDING_APPROVAL' });
    expect(decideRegistration({ ...base, mode: 'INVITE_ONLY' })).toMatchObject({ ok: false, code: 'INVITE_ONLY' });
    expect(decideRegistration({ ...base, deadline: new Date(base.now.getTime() - 1000) })).toMatchObject({ ok: false, code: 'CLOSED' });
    expect(decideRegistration({ ...base, endsAt: new Date(base.now.getTime() - 1000) })).toMatchObject({ ok: false, code: 'ENDED' });
    expect(decideRegistration({ ...base, eventStatus: 'PENDING_APPROVAL' })).toMatchObject({ ok: false, code: 'NOT_OPEN' });
    expect(decideRegistration({ ...base, capacity: null, registeredCount: 9999 })).toEqual({ ok: true, status: 'REGISTERED' });
  });
});

describe('QR pass tokens', () => {
  it('round-trips, expires, and rejects tampering', () => {
    const { token } = signPassToken('11111111-1111-1111-1111-111111111111');
    expect(verifyPassToken(token)).toEqual({ registrationId: '11111111-1111-1111-1111-111111111111' });
    const expired = signPassToken('x', Date.now() - 3600_000, 60).token;
    expect(verifyPassToken(expired)).toEqual({ error: 'EXPIRED' });
    const [body, sig] = token.split('.');
    const forged = `${Buffer.from('22222222-2222-2222-2222-222222222222.9999999999').toString('base64url')}.${sig}`;
    expect(verifyPassToken(forged)).toEqual({ error: 'BAD_SIGNATURE' });
    expect(verifyPassToken(`${body}`)).toEqual({ error: 'MALFORMED' });
  });
});

describe('codes, distance, windows, priority', () => {
  it('generates unambiguous codes', () => {
    expect(registrationCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(certificateCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  });
  it('computes plausible distances around Kolkata', () => {
    const saltLake = { lat: 22.5806, lng: 88.4175 };
    const howrah = { lat: 22.5958, lng: 88.2636 };
    const d = distanceKm(saltLake, howrah);
    expect(d).toBeGreaterThan(14);
    expect(d).toBeLessThan(18);
  });
  it('builds date windows', () => {
    const now = new Date('2026-09-23T06:00:00Z'); // Wednesday
    const wk = whenWindow('weekend', now);
    expect(wk.from.toISOString().slice(0, 10)).toBe('2026-09-26');
    expect(wk.to!.toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(whenWindow('upcoming', now).to).toBeNull();
  });
  it('escalates venue/time changes and emergencies', () => {
    expect(updatePriority('EMERGENCY')).toBe('CRITICAL');
    expect(updatePriority('VENUE_CHANGED')).toBe('IMPORTANT');
    expect(updatePriority('RESULTS')).toBe('NORMAL');
  });
});

/* ------------------------------ integration ------------------------------- */

let A: TestTenant;
let B: TestTenant;

beforeAll(async () => {
  A = await createTenant();
  B = await createTenant();
  for (const id of [A.id, B.id]) {
    await db.update(t.institutions).set({ featureFlags: { events_enabled: true, event_discovery_enabled: true } }).where(eq(t.institutions.id, id));
  }
});

afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

type EventInputT = Parameters<typeof createEvent>[1];

function eventInput(over: Partial<EventInputT> = {}): EventInputT {
  const start = new Date(Date.now() + 5 * 86_400_000);
  return {
    title: `Test Event ${Math.random().toString(36).slice(2, 8)}`,
    category: 'WORKSHOP',
    visibility: 'INSTITUTION',
    mode: 'OFFLINE',
    startsAt: start,
    endsAt: new Date(start.getTime() + 3 * 3600_000),
    registrationRequired: true,
    registrationMode: 'INSTANT',
    waitlistEnabled: true,
    priceInr: 0,
    certificateOffered: true,
    teamSizeMin: 1,
    teamSizeMax: 1,
    ...over,
  } as EventInputT;
}

async function newEvent(tenant: TestTenant, over: Partial<Parameters<typeof createEvent>[1]> = {}) {
  const admin = await ctxFor((await createUser(tenant, { role: 'ADMIN' })).id);
  const start = new Date(Date.now() + 5 * 86_400_000);
  const created = await createEvent(
    admin,
    {
      title: `Test Event ${Math.random().toString(36).slice(2, 8)}`,
      category: 'WORKSHOP',
      visibility: 'INSTITUTION',
      mode: 'OFFLINE',
      startsAt: start,
      endsAt: new Date(start.getTime() + 3 * 3600_000),
      registrationRequired: true,
      registrationMode: 'INSTANT',
      waitlistEnabled: true,
      priceInr: 0,
      certificateOffered: true,
      teamSizeMin: 1,
      teamSizeMax: 1,
      ...over,
    },
    meta(),
  );
  return { id: created.id, admin };
}

describe('visibility across colleges', () => {
  it('never shows another college’s college-only event, but shows its public ones', async () => {
    const privateEv = await newEvent(B, { visibility: 'INSTITUTION' });
    const publicEv = await newEvent(B, { visibility: 'PUBLIC' });
    const studentA = await ctxFor((await createUser(A)).id);
    const ids = (await listEvents(studentA)).map((e) => e.id);
    expect(ids).toContain(publicEv.id);
    expect(ids).not.toContain(privateEv.id);
    await expect(getEvent(studentA, privateEv.id)).rejects.toMatchObject({ status: 404 });
    await expect(registerForEvent(studentA, privateEv.id)).rejects.toMatchObject({ status: 404 });
  });

  it('hides other colleges entirely when discovery is off for the viewer’s college', async () => {
    const publicEv = await newEvent(B, { visibility: 'PUBLIC' });
    const studentA = { ...(await ctxFor((await createUser(A)).id)), featureFlags: { events_enabled: true, event_discovery_enabled: false } };
    expect((await listEvents(studentA)).map((e) => e.id)).not.toContain(publicEv.id);
  });

  it('keeps student-created events hidden until a moderator approves them', async () => {
    const student = await ctxFor((await createUser(A)).id);
    const start = new Date(Date.now() + 3 * 86_400_000);
    const created = await createEvent(student, {
      title: 'Chess club meetup', category: 'CLUB', visibility: 'INSTITUTION', mode: 'OFFLINE', startsAt: start,
      endsAt: new Date(start.getTime() + 3600_000), registrationRequired: false, registrationMode: 'INSTANT', waitlistEnabled: true,
      priceInr: 0, certificateOffered: false, teamSizeMin: 1, teamSizeMax: 1,
    }, meta());
    expect(created.status).toBe('PENDING_APPROVAL');
    const other = await ctxFor((await createUser(A)).id);
    expect((await listEvents(other)).map((e) => e.id)).not.toContain(created.id);
    const moderator = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    await moderateEvent(moderator, created.id, { action: 'APPROVE' }, meta());
    expect((await listEvents(other)).map((e) => e.id)).toContain(created.id);
    const [row] = await db.select({ v: t.events.verification }).from(t.events).where(eq(t.events.id, created.id));
    expect(row!.v).toBe('COMMUNITY');
  });

  it('rejects an obvious duplicate', async () => {
    const ev = await newEvent(A);
    const [e] = await db.select().from(t.events).where(eq(t.events.id, ev.id));
    await expect(
      createEvent(ev.admin, { title: `  ${e!.title.toUpperCase()} `, category: 'WORKSHOP', visibility: 'INSTITUTION', mode: 'OFFLINE', startsAt: e!.startsAt, endsAt: e!.endsAt, registrationRequired: true, registrationMode: 'INSTANT', waitlistEnabled: true, priceInr: 0, certificateOffered: false, teamSizeMin: 1, teamSizeMax: 1 }, meta()),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('registration, capacity and waitlist', () => {
  it('never exceeds capacity under concurrent registrations', async () => {
    const ev = await newEvent(A, { capacity: 5 });
    const students = await Promise.all(Array.from({ length: 12 }, async () => ctxFor((await createUser(A)).id)));
    const results = await Promise.all(students.map((s) => registerForEvent(s, ev.id)));
    expect(results.filter((r) => r.status === 'REGISTERED')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'WAITLISTED')).toHaveLength(7);
    const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM event_registrations WHERE event_id = ${ev.id} AND status = 'REGISTERED'`)).rows as [{ n: number }];
    expect(n).toBe(5);
  });

  it('the database itself refuses a registration beyond capacity', async () => {
    const ev = await newEvent(A, { capacity: 1 });
    const [u1, u2] = [await createUser(A), await createUser(A)];
    await db.insert(t.eventRegistrations).values({ institutionId: A.id, eventId: ev.id, userId: u1.id, status: 'REGISTERED', code: 'AAAAAA' });
    await expect(
      db.insert(t.eventRegistrations).values({ institutionId: A.id, eventId: ev.id, userId: u2.id, status: 'REGISTERED', code: 'BBBBBB' }),
    ).rejects.toThrow();
  });

  it('the database refuses registrations after the deadline', async () => {
    const start = new Date(Date.now() + 86_400_000);
    const ev = await newEvent(A, { startsAt: start, endsAt: new Date(start.getTime() + 3600_000), registrationDeadline: new Date(Date.now() + 60_000) });
    await db.update(t.events).set({ registrationDeadline: new Date(Date.now() - 60_000) }).where(eq(t.events.id, ev.id));
    const u = await createUser(A);
    await expect(db.insert(t.eventRegistrations).values({ institutionId: A.id, eventId: ev.id, userId: u.id, status: 'REGISTERED', code: 'CCCCCC' })).rejects.toThrow();
    await expect(registerForEvent(await ctxFor(u.id), ev.id)).rejects.toMatchObject({ code: 'CLOSED' });
  });

  it('is idempotent, and promotes the first waitlisted student on cancellation', async () => {
    const ev = await newEvent(A, { capacity: 1 });
    const first = await ctxFor((await createUser(A)).id);
    const second = await ctxFor((await createUser(A)).id);
    const r1 = await registerForEvent(first, ev.id);
    expect(await registerForEvent(first, ev.id)).toEqual({ status: 'REGISTERED', code: r1.code });
    expect((await registerForEvent(second, ev.id)).status).toBe('WAITLISTED');
    expect((await getEvent(second, ev.id)).registration?.waitlistPosition).toBe(1);
    expect(await cancelRegistration(first, ev.id)).toEqual({ promoted: true });
    expect((await getEvent(second, ev.id)).registration?.status).toBe('REGISTERED');
    const notes = await db.select().from(t.notifications).where(and(eq(t.notifications.userId, second.userId), eq(t.notifications.priority, 'IMPORTANT')));
    expect(notes.some((n) => n.title.includes('place opened up'))).toBe(true);
  });

  it('reports the true registered count in listings and management views', async () => {
    const ev = await newEvent(A, { capacity: 50 });
    for (let i = 0; i < 3; i++) await registerForEvent(await ctxFor((await createUser(A)).id), ev.id);
    const viewer = await ctxFor((await createUser(A)).id);
    const listed = (await listEvents(viewer)).find((e) => e.id === ev.id);
    expect(listed?.registeredCount).toBe(3);
    expect((await getEvent(viewer, ev.id)).registeredCount).toBe(3);
    const managed = (await listManagedEvents(ev.admin)).find((e) => e.id === ev.id);
    expect(managed?.registered).toBe(3);
  });

  it('lets a student of another college register for a public event', async () => {
    const ev = await newEvent(B, { visibility: 'PUBLIC' });
    const studentA = await ctxFor((await createUser(A)).id);
    expect((await registerForEvent(studentA, ev.id)).status).toBe('REGISTERED');
    const [reg] = await db.select().from(t.eventRegistrations).where(and(eq(t.eventRegistrations.eventId, ev.id), eq(t.eventRegistrations.userId, studentA.userId)));
    expect(reg!.institutionId).toBe(B.id); // the organiser's tenant
    expect(reg!.attendeeInstitutionId).toBe(A.id); // the attendee's own college
  });
});

describe('check-in and certificates', () => {
  it('checks in once by QR, refuses forged or foreign passes, and certifies only attendees', async () => {
    const ev = await newEvent(A, { capacity: 10 });
    const attendee = await ctxFor((await createUser(A)).id);
    const noShow = await ctxFor((await createUser(A)).id);
    await registerForEvent(attendee, ev.id);
    await registerForEvent(noShow, ev.id);
    const reg = (await getEvent(attendee, ev.id)).registration!;

    const { token } = signPassToken(reg.id);
    expect(await checkIn(ev.admin, ev.id, { token })).toMatchObject({ status: 'CHECKED_IN' });
    expect(await checkIn(ev.admin, ev.id, { token })).toMatchObject({ status: 'ALREADY_CHECKED_IN' });
    const rows = await db.select().from(t.eventCheckins).where(eq(t.eventCheckins.registrationId, reg.id));
    expect(rows).toHaveLength(1);
    expect(await checkIn(ev.admin, ev.id, { token: `${token}x` })).toMatchObject({ status: 'INVALID' });

    const other = await newEvent(A);
    expect(await checkIn(other.admin, other.id, { token })).toMatchObject({ status: 'WRONG_EVENT' });
    // An organiser of another college cannot even see the event.
    const foreignAdmin = await ctxFor((await createUser(B, { role: 'ADMIN' })).id);
    await expect(checkIn(foreignAdmin, ev.id, { token })).rejects.toMatchObject({ status: 404 });

    const { issued } = await issueCertificates(ev.admin, ev.id, {}, meta());
    expect(issued).toBe(1);
    expect((await issueCertificates(ev.admin, ev.id, {}, meta())).issued).toBe(0); // no duplicates
    const [cert] = await db.select().from(t.eventCertificates).where(eq(t.eventCertificates.eventId, ev.id));
    expect(cert!.userId).toBe(attendee.userId);

    const verified = await verifyCertificate(cert!.verificationCode);
    expect(verified?.eventTitle).toBeDefined();
    expect(verified?.recipientName).toMatch(/^Test [A-Z]\.$/); // first name + initial only
    expect(JSON.stringify(verified)).not.toContain('@');
    expect(await verifyCertificate('ZZZZZ-ZZZZZ')).toBeNull();
  });
});

describe('organiser updates', () => {
  it('reaches registrants and followers once each, with priority by kind', async () => {
    const ev = await newEvent(A);
    const registrant = await ctxFor((await createUser(A)).id);
    const follower = await ctxFor((await createUser(A)).id);
    await registerForEvent(registrant, ev.id); // auto-follows too
    await setSaved(follower, ev.id, true);
    const { recipients } = await postEventUpdate(ev.admin, ev.id, { kind: 'VENUE_CHANGED', title: 'Moved to Hall B', audience: 'FOLLOWERS' }, meta());
    expect(recipients).toBe(2);
    const [n] = await db.select().from(t.notifications).where(and(eq(t.notifications.userId, follower.userId), eq(t.notifications.sourceId, ev.id)));
    expect(n!.priority).toBe('IMPORTANT');
    const registeredOnly = await postEventUpdate(ev.admin, ev.id, { kind: 'RESULTS', title: 'Results are out', audience: 'REGISTERED' }, meta());
    expect(registeredOnly.recipients).toBe(1);
  });
});

describe('"my events" filters (regression)', () => {
  it('finds my registration beyond the page limit and excludes rejected ones', async () => {
    const early = await Promise.all([1, 2, 3].map(() => newEvent(A, { capacity: 50 })));
    const later = await newEvent(A, {
      capacity: 50,
      startsAt: new Date(Date.now() + 40 * 86_400_000),
      endsAt: new Date(Date.now() + 40 * 86_400_000 + 3600_000),
    });
    const me = await ctxFor((await createUser(A)).id);
    await registerForEvent(me, later.id);
    await setSaved(me, early[0]!.id, true);
    const mine = await listEvents(me, { mine: 'registered', when: 'upcoming', sort: 'date', limit: 2 });
    expect(mine.map((e) => e.id)).toContain(later.id);
    expect((await listEvents(me, { mine: 'saved', when: 'upcoming', sort: 'date', limit: 1 })).map((e) => e.id)).toContain(early[0]!.id);

    const approval = await newEvent(A, { registrationMode: 'APPROVAL', capacity: 10 });
    await registerForEvent(me, approval.id);
    await db.update(t.eventRegistrations).set({ status: 'REJECTED' }).where(and(eq(t.eventRegistrations.eventId, approval.id), eq(t.eventRegistrations.userId, me.userId)));
    expect((await listEvents(me, { mine: 'registered', when: 'upcoming' })).map((e) => e.id)).not.toContain(approval.id);
  });
});

describe('calendar file (.ics)', () => {
  it('escapes text, folds long lines and writes UTC times', () => {
    expect(escapeIcsText('Hall A, Block 2; bring ID\\n')).toBe('Hall A\\, Block 2\\; bring ID\\\\n');
    const long = `DESCRIPTION:${'অ'.repeat(40)}`; // 3-byte characters
    const folded = foldIcsLine(long);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
    const ics = buildIcs(
      { uid: 'x@campusos', title: 'Fest', startsAt: new Date('2026-10-01T04:30:00Z'), endsAt: new Date('2026-10-01T08:00:00Z'), cancelled: true },
      new Date('2026-09-26T00:00:00Z'),
    );
    expect(ics).toContain('DTSTART:20261001T043000Z');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics.endsWith('\r\n')).toBe(true);
  });
});

describe('editing and cancelling events', () => {
  it('announces a time or venue change to registrants and followers, once', async () => {
    const input = eventInput({ capacity: 20, venueText: 'Seminar Hall' });
    const created = await createEvent((await ctxFor((await createUser(A, { role: 'ADMIN' })).id)), input, meta());
    const [row] = await db.select({ organizerId: t.events.organizerId }).from(t.events).where(eq(t.events.id, created.id));
    const admin = await ctxFor(row!.organizerId!);
    const student = await ctxFor((await createUser(A)).id);
    await registerForEvent(student, created.id);

    // A description-only edit announces nothing.
    const quiet = await updateEvent(admin, created.id, { ...input, description: 'Bring a laptop.' }, meta());
    expect(quiet.announced).toEqual([]);

    const moved = await updateEvent(admin, created.id, { ...input, venueText: 'Main Auditorium' }, meta());
    expect(moved.announced).toEqual(['VENUE_CHANGED']);
    const notes = await db.select().from(t.notifications).where(and(eq(t.notifications.userId, student.userId), eq(t.notifications.sourceId, created.id)));
    expect(notes.filter((n) => n.title.includes('New venue'))).toHaveLength(1);
    expect(notes.find((n) => n.title.includes('New venue'))!.priority).toBe('IMPORTANT');

    const later = new Date(input.startsAt.getTime() + 3600_000);
    const retimed = await updateEvent(admin, created.id, { ...input, venueText: 'Main Auditorium', startsAt: later, endsAt: new Date(later.getTime() + 3600_000) }, meta());
    expect(retimed.announced).toEqual(['TIME_CHANGED']);
    const updates = await db.select().from(t.eventUpdates).where(eq(t.eventUpdates.eventId, created.id));
    expect(updates.map((u) => u.kind).sort()).toEqual(['TIME_CHANGED', 'VENUE_CHANGED']);
  });

  it('refuses a capacity below the registered count, and promotes the waitlist when seats are added', async () => {
    const input = eventInput({ capacity: 1 });
    const admin = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    const { id } = await createEvent(admin, input, meta());
    const [first, second, third] = await Promise.all([1, 2, 3].map(async () => ctxFor((await createUser(A)).id)));
    await registerForEvent(first!, id);
    await registerForEvent(second!, id);
    await registerForEvent(third!, id);
    await expect(updateEvent(admin, id, { ...input, capacity: 0 as unknown as number }, meta())).rejects.toThrow();

    const r = await updateEvent(admin, id, { ...input, capacity: 2 }, meta());
    expect(r.promoted).toBe(1);
    const regs = await db.select().from(t.eventRegistrations).where(eq(t.eventRegistrations.eventId, id));
    const byUser = new Map(regs.map((x) => [x.userId, x.status]));
    expect(byUser.get(second!.userId)).toBe('REGISTERED'); // first in the queue
    expect(byUser.get(third!.userId)).toBe('WAITLISTED');
  });

  it('sends a live event back for verification when a non-moderator opens it to all colleges', async () => {
    const admin = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    const organiser = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    const input = eventInput();
    const { id } = await createEvent(organiser, input, meta());
    await moderateEvent(admin, id, { action: 'APPROVE' }, meta());
    const r = await updateEvent(organiser, id, { ...input, visibility: 'PUBLIC' }, meta());
    expect(r.status).toBe('PENDING_APPROVAL');
    const outsider = await ctxFor((await createUser(B)).id);
    await expect(getEvent(outsider, id)).rejects.toThrow();
  });

  it('only the organiser or a moderator of the host college can edit or cancel', async () => {
    const ev = await newEvent(A);
    const otherStudent = await ctxFor((await createUser(A)).id);
    const otherCollegeAdmin = await ctxFor((await createUser(B, { role: 'ADMIN' })).id);
    await expect(updateEvent(otherStudent, ev.id, eventInput(), meta())).rejects.toThrow();
    await expect(cancelEvent(otherCollegeAdmin, ev.id, 'Not mine', meta())).rejects.toThrow();
  });

  it('cancels once, tells registrants, and blocks further edits', async () => {
    const ev = await newEvent(A);
    const student = await ctxFor((await createUser(A)).id);
    await registerForEvent(student, ev.id);
    const r = await cancelEvent(ev.admin, ev.id, 'Venue unavailable due to rain', meta());
    expect(r.notified).toBe(1);
    const [n] = await db.select().from(t.notifications).where(and(eq(t.notifications.userId, student.userId), eq(t.notifications.title, `Cancelled: ${(await db.select({ title: t.events.title }).from(t.events).where(eq(t.events.id, ev.id)))[0]!.title}`)));
    expect(n?.body).toBe('Venue unavailable due to rain');
    await expect(cancelEvent(ev.admin, ev.id, 'Again please', meta())).rejects.toThrow(/already cancelled/);
    await expect(updateEvent(ev.admin, ev.id, eventInput(), meta())).rejects.toThrow(/cancelled/);
    const [audit] = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.entityId, ev.id), eq(t.auditLogs.action, 'EVENT_CANCELLED')));
    expect(audit).toBeTruthy();
  });

  it('filters by area and host college, within visibility', async () => {
    const tag = `Area${Math.random().toString(36).slice(2, 7)}`;
    const mine = await newEvent(A, { area: tag, city: 'Kolkata' });
    const theirs = await newEvent(B, { area: tag, city: 'Kolkata', visibility: 'PUBLIC' });
    const hidden = await newEvent(B, { area: tag, city: 'Kolkata', visibility: 'INSTITUTION' });
    const viewer = await ctxFor((await createUser(A)).id);
    const inArea = (await listEvents(viewer, { area: tag.toLowerCase() })).map((e) => e.id);
    expect(inArea).toEqual(expect.arrayContaining([mine.id, theirs.id]));
    expect(inArea).not.toContain(hidden.id);
    const hostB = (await listEvents(viewer, { area: tag, college: B.id })).map((e) => e.id);
    expect(hostB).toEqual([theirs.id]);
    expect(await listEvents(viewer, { area: tag, college: 'not-a-uuid' })).toHaveLength(2);
  });
});
