/**
 * DEMO DATA — West Bengal events network (fictional).
 *
 * Adds three more fictional colleges around Kolkata and a set of clearly
 * labelled demo events so discovery, registration, waitlists, check-in and
 * certificates have something real to show. Every event carries
 * source_name = 'CampusOS demo seed' and the UI marks it "Demo".
 *
 * Dates are relative to the moment the seed runs, so events stay upcoming.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as s from '../src/lib/db/schema';
import { purgeTenant } from './lib/purge';
import { certificateCode, registrationCode, DEMO_SOURCE } from '../src/services/events/rules';

const PARTNERS = [
  { slug: 'demo-biu', name: 'Bengal Innovation University', short: 'BIU', city: 'Kolkata', area: 'Salt Lake', lat: 22.5806, lng: 88.4175 },
  { slug: 'demo-etu', name: 'Eastern Tech University', short: 'ETU', city: 'Kolkata', area: 'New Town', lat: 22.5920, lng: 88.4846 },
  { slug: 'demo-ksm', name: 'Kolkata School of Management', short: 'KSM', city: 'Howrah', area: 'Howrah', lat: 22.5958, lng: 88.2636 },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = NodePgDatabase<any>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A date `days` from now at `hour`:`min` IST. */
function at(days: number, hour: number, min = 0): Date {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour - 5, min - 30, 0, 0); // IST = UTC+5:30
  return d;
}

export async function seedEventsNetwork(db: DB, ctx: {
  mainInstitutionId: string;
  passwordHash: string;
  demoStudentUserId: string;
  otherStudentUserIds: string[];
  eventOrganizerUserId: string;
}) {
  console.log('  · West Bengal events network (demo)…');

  // Remove previous partner tenants (development only).
  const existing = await db.select({ id: s.institutions.id }).from(s.institutions).where(inArray(s.institutions.slug, PARTNERS.map((p) => p.slug)));
  for (const e of existing) await purgeTenant(db, e.id);

  await db
    .update(s.institutions)
    .set({
      latitude: '22.553000',
      longitude: '88.352000',
      featureFlags: sql`${s.institutions.featureFlags} || '{"event_discovery_enabled": true}'::jsonb`,
    })
    .where(eq(s.institutions.id, ctx.mainInstitutionId));

  const partnerIds: Record<string, string> = {};
  for (const p of PARTNERS) {
    const [inst] = await db
      .insert(s.institutions)
      .values({
        slug: p.slug,
        name: p.name,
        shortName: p.short,
        city: p.city,
        state: 'West Bengal',
        latitude: String(p.lat),
        longitude: String(p.lng),
        subscriptionTier: 'STARTER',
        featureFlags: { events_enabled: true, event_discovery_enabled: true },
        setupCompletedAt: new Date(),
      })
      .returning({ id: s.institutions.id });
    partnerIds[p.slug] = inst!.id;
    await db.insert(s.users).values({
      institutionId: inst!.id,
      email: `events@${p.slug}.demo.campusos.local`,
      passwordHash: ctx.passwordHash,
      firstName: p.short,
      lastName: 'Events Office',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });
  }

  const KBI = ctx.mainInstitutionId;
  const common = { status: 'SCHEDULED' as const, publishedAt: new Date(), sourceName: DEMO_SOURCE, lastVerifiedAt: new Date(), registrationRequired: true };
  const demo = (d: string) => `${d}\n\nDemo event — fictional, created by the CampusOS seed for demonstration.`;

  const rows: (typeof s.events.$inferInsert & { key: string })[] = [
    {
      key: 'hackathon', institutionId: partnerIds['demo-etu']!, title: 'Kolkata Inter-College Hackathon 2026', category: 'HACKATHON', visibility: 'PUBLIC',
      organizerType: 'COLLEGE', organizerName: 'Eastern Tech University', verification: 'VERIFIED_COLLEGE', mode: 'OFFLINE', city: 'Kolkata', area: 'New Town',
      latitude: '22.592000', longitude: '88.484600', venueText: 'ETU Innovation Hall, New Town',
      startsAt: at(12, 9), endsAt: at(13, 18), registrationDeadline: at(10, 23, 59), capacity: 200, teamSizeMin: 2, teamSizeMax: 4,
      certificateOffered: true, priceInr: 0, tags: ['Hackathon', 'Tech', 'AI'],
      description: demo('A 36-hour build sprint for student teams from colleges across Kolkata. Tracks: civic tech, fintech and AI for education.'),
      eligibility: 'Undergraduate and postgraduate students from any college. Teams of 2–4.',
      rules: '1. All code must be written during the event.\n2. Use of open-source libraries is allowed with attribution.\n3. Judges’ decisions are final.',
      prizes: '1st: ₹50,000 · 2nd: ₹25,000 · 3rd: ₹10,000 · Best first-year team: ₹5,000',
      agenda: [{ time: 'Day 1 · 9:00', title: 'Check-in & kickoff' }, { time: 'Day 1 · 11:00', title: 'Hacking begins' }, { time: 'Day 2 · 15:00', title: 'Demos' }, { time: 'Day 2 · 17:30', title: 'Results' }],
      faqs: [{ q: 'Do I need a team?', a: 'Yes — form a team of 2–4 before registering, or find one in the Discord.' }, { q: 'Is food provided?', a: 'Meals and snacks are provided for registered participants.' }],
      contactEmail: 'events@demo-etu.demo.campusos.local', ...common,
    },
    {
      key: 'case', institutionId: partnerIds['demo-ksm']!, title: 'Finance Case Challenge', category: 'CASE_COMPETITION', visibility: 'PUBLIC',
      organizerType: 'COLLEGE', organizerName: 'Kolkata School of Management', verification: 'VERIFIED_COLLEGE', mode: 'OFFLINE', city: 'Howrah', area: 'Howrah',
      latitude: '22.595800', longitude: '88.263600', venueText: 'KSM Auditorium',
      startsAt: at(8, 10), endsAt: at(8, 17), registrationDeadline: at(6, 23, 59), capacity: 60, teamSizeMin: 2, teamSizeMax: 3,
      certificateOffered: true, tags: ['Competition', 'Finance'],
      description: demo('Crack a live valuation case in teams, present to a panel of practitioners.'),
      eligibility: 'BBA, BCom, BMS and MBA students.', prizes: 'Winners: ₹20,000 and internship interviews.', ...common,
    },
    {
      key: 'pitch', institutionId: KBI, title: 'Startup Pitch Night', category: 'ENTREPRENEURSHIP', visibility: 'PUBLIC',
      organizerType: 'CLUB', organizerName: 'E-Cell, Kolkata Business Institute', verification: 'VERIFIED_CLUB', mode: 'OFFLINE', city: 'Kolkata', area: 'Park Street',
      venueText: 'KBI Seminar Hall 1', startsAt: at(5, 18), endsAt: at(5, 21), capacity: 120, organizerId: ctx.eventOrganizerUserId, tags: ['Startup', 'Networking'],
      description: demo('Five student founders pitch to angel investors. Open networking after.'), ...common,
    },
    {
      key: 'fest', institutionId: partnerIds['demo-biu']!, title: 'Utsav — Annual Cultural Fest', category: 'FEST', visibility: 'PUBLIC',
      organizerType: 'COLLEGE', organizerName: 'Bengal Innovation University', verification: 'VERIFIED_COLLEGE', mode: 'OFFLINE', city: 'Kolkata', area: 'Salt Lake',
      latitude: '22.580600', longitude: '88.417500', venueText: 'BIU Main Grounds, Sector V',
      startsAt: at(20, 10), endsAt: at(22, 22), capacity: null, tags: ['Cultural', 'Music'],
      description: demo('Three days of music, dance, theatre and food stalls. Entry free with college ID.'), ...common, registrationRequired: false,
    },
    {
      key: 'mun', institutionId: partnerIds['demo-biu']!, title: 'MUN Kolkata 2026', category: 'MUN', visibility: 'PUBLIC',
      organizerType: 'CLUB', organizerName: 'BIU Debating Society', verification: 'VERIFIED_CLUB', mode: 'OFFLINE', city: 'Kolkata', area: 'Salt Lake',
      venueText: 'BIU Conference Centre', startsAt: at(15, 9), endsAt: at(16, 17), capacity: 3, waitlistEnabled: true, certificateOffered: true,
      tags: ['MUN', 'Politics'], description: demo('Committees: UNSC, UNHRC, Lok Sabha. Delegates allocated on registration order.'), ...common,
    },
    {
      key: 'ai', institutionId: partnerIds['demo-etu']!, title: 'Hands-on AI Workshop', category: 'WORKSHOP', visibility: 'PUBLIC',
      organizerType: 'COLLEGE', organizerName: 'Eastern Tech University', verification: 'VERIFIED_COLLEGE', mode: 'ONLINE', onlineUrl: 'https://example.org/demo-ai-workshop',
      startsAt: at(3, 16), endsAt: at(3, 18), capacity: 500, certificateOffered: true, tags: ['Workshop', 'AI'],
      description: demo('Build and evaluate a small text classifier. No prior ML experience needed.'), ...common,
    },
    {
      key: 'talk', institutionId: KBI, title: 'E-Cell Founder Talk', category: 'SEMINAR', visibility: 'INSTITUTION',
      organizerType: 'CLUB', organizerName: 'E-Cell, Kolkata Business Institute', verification: 'VERIFIED_CLUB', mode: 'OFFLINE', city: 'Kolkata',
      venueText: 'KBI Seminar Hall 1', startsAt: at(2, 15), endsAt: at(2, 16, 30), capacity: 150, organizerId: ctx.eventOrganizerUserId, tags: ['Startup', 'Seminar'],
      description: demo('A KBI alumna on building a D2C brand from Kolkata.'), ...common,
    },
    {
      key: 'football', institutionId: partnerIds['demo-ksm']!, title: 'Inter-College Football Tournament', category: 'SPORTS', visibility: 'PUBLIC',
      organizerType: 'COLLEGE', organizerName: 'Kolkata School of Management', verification: 'VERIFIED_COLLEGE', mode: 'OFFLINE', city: 'Howrah',
      venueText: 'Howrah Maidan', startsAt: at(26, 8), endsAt: at(28, 18), capacity: 16, teamSizeMin: 7, teamSizeMax: 11, tags: ['Sports', 'Football'],
      description: demo('7-a-side knockout. Register one captain per team.'), ...common,
    },
    {
      key: 'design', institutionId: partnerIds['demo-biu']!, title: 'Design Sprint Weekend', category: 'WORKSHOP', visibility: 'PUBLIC',
      organizerType: 'COLLEGE', organizerName: 'Bengal Innovation University', verification: 'VERIFIED_COLLEGE', mode: 'HYBRID', city: 'Kolkata', area: 'Salt Lake',
      onlineUrl: 'https://example.org/demo-design-sprint', venueText: 'BIU Design Studio', startsAt: at(9, 10), endsAt: at(10, 17), capacity: 40, registrationMode: 'APPROVAL',
      tags: ['Workshop', 'Design'], description: demo('Google-style design sprint on a real campus problem. Applications reviewed by the design club.'), ...common,
    },
    {
      key: 'bootcamp', institutionId: KBI, title: 'Placement Bootcamp', category: 'CAREER', visibility: 'INSTITUTION',
      organizerType: 'COLLEGE', organizerName: 'Placement Cell, KBI', verification: 'VERIFIED_COLLEGE', mode: 'OFFLINE', city: 'Kolkata',
      venueText: 'KBI Auditorium', startsAt: at(14, 10), endsAt: at(14, 16), capacity: 200, tags: ['Career', 'Placement'],
      description: demo('Aptitude practice, GD simulations and mock interviews with recruiters.'), ...common,
    },
    // Past events so Campus Activity, check-in and certificates have history.
    {
      key: 'hunt', institutionId: KBI, title: 'Orientation Treasure Hunt', category: 'CLUB', visibility: 'INSTITUTION',
      organizerType: 'CLUB', organizerName: 'Student Council, KBI', verification: 'VERIFIED_CLUB', mode: 'OFFLINE', city: 'Kolkata',
      venueText: 'KBI Campus', startsAt: at(-20, 14), endsAt: at(-20, 17), capacity: 100, certificateOffered: true, organizerId: ctx.eventOrganizerUserId,
      tags: ['Cultural'], description: demo('Clues across the campus for new students.'), ...common, status: 'COMPLETED',
    },
    {
      key: 'excel', institutionId: KBI, title: 'Excel for Finance Workshop', category: 'WORKSHOP', visibility: 'INSTITUTION',
      organizerType: 'COLLEGE', organizerName: 'Department of Management, KBI', verification: 'VERIFIED_COLLEGE', mode: 'OFFLINE', city: 'Kolkata',
      venueText: 'Computer Lab 2', startsAt: at(-9, 11), endsAt: at(-9, 13), capacity: 40, certificateOffered: true, tags: ['Workshop', 'Finance'],
      description: demo('Financial modelling shortcuts, lookups and pivot tables.'), ...common, status: 'COMPLETED',
    },
  ];

  const ids: Record<string, string> = {};
  for (const { key, ...values } of rows) {
    const [e] = await db.insert(s.events).values(values).returning({ id: s.events.id });
    ids[key] = e!.id;
  }
  const inst = (key: string) => rows.find((r) => r.key === key)!.institutionId as string;

  const reg = async (key: string, userId: string, status = 'REGISTERED', attended = false) => {
    const [r] = await db
      .insert(s.eventRegistrations)
      .values({ institutionId: inst(key), eventId: ids[key]!, userId, status, code: registrationCode(), attendeeInstitutionId: KBI, attendedAt: attended ? new Date() : null, registeredAt: new Date(Date.now() - 40 * DAY) })
      .returning({ id: s.eventRegistrations.id });
    return r!.id;
  };

  // The demo student's participation history.
  await reg('hackathon', ctx.demoStudentUserId);
  const hunt = await reg('hunt', ctx.demoStudentUserId, 'REGISTERED', true);
  await reg('excel', ctx.demoStudentUserId);
  await db.insert(s.eventCheckins).values({ institutionId: KBI, eventId: ids.hunt!, registrationId: hunt, method: 'QR' });
  const [student] = await db.select({ first: s.users.firstName, last: s.users.lastName }).from(s.users).where(eq(s.users.id, ctx.demoStudentUserId));
  await db.insert(s.eventCertificates).values({ institutionId: KBI, eventId: ids.hunt!, registrationId: hunt, userId: ctx.demoStudentUserId, verificationCode: certificateCode(), recipientName: `${student!.first} ${student!.last}`, issuedById: ctx.eventOrganizerUserId });
  await db.insert(s.eventSaves).values([
    { institutionId: inst('hackathon'), eventId: ids.hackathon!, userId: ctx.demoStudentUserId },
    { institutionId: inst('case'), eventId: ids.case!, userId: ctx.demoStudentUserId },
  ]);

  // MUN is full, so the demo student meets a waitlist.
  for (const u of ctx.otherStudentUserIds.slice(0, 3)) await reg('mun', u);
  for (const u of ctx.otherStudentUserIds.slice(3, 40)) await reg('pitch', u);

  await db.insert(s.eventUpdates).values({
    institutionId: inst('hackathon'), eventId: ids.hackathon!, kind: 'VENUE_CHANGED', title: 'Venue moved to ETU Innovation Hall B',
    body: 'Same building, second floor. Check-in desk at the main entrance.', priority: 'IMPORTANT', audience: 'FOLLOWERS', recipientCount: 1,
  });
  await db.insert(s.notifications).values({
    institutionId: KBI, userId: ctx.demoStudentUserId, title: 'Kolkata Inter-College Hackathon 2026: Venue moved to ETU Innovation Hall B',
    body: 'Same building, second floor.', priority: 'IMPORTANT', category: 'EVENT', actionUrl: `/student/events/${ids.hackathon}`, groupKey: `event:${ids.hackathon}`,
    sourceType: 'event', sourceId: ids.hackathon, deliveryPlannedAt: new Date(),
  });
}
