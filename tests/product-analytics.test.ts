import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { actorHash, markActive, sanitizeProps, track, EVENTS, purgeOldProductEvents } from '@/services/product-events';
import { getPlatformMetrics } from '@/services/product-metrics';
import { clearCampusInterest, collegeKey, getCampusDemand, MIN_VISIBLE, recordCampusInterest } from '@/services/campus-demand';
import { acknowledgeAnnouncement, markAnnouncementRead } from '@/services/communication';
import { createTenant, createUser, ctxFor, dropTenant, type TestTenant } from './helpers';

/**
 * CAMPUSOS-003 / 012 / 010: product analytics are pseudonymous and
 * allowlisted, operator-only, and campus demand is aggregate-only.
 */

let college: TestTenant;
let personal: TestTenant;
let personal2: TestTenant;

beforeAll(async () => {
  college = await createTenant();
  personal = await createTenant();
  personal2 = await createTenant();
  await db.update(t.institutions).set({ kind: 'PERSONAL' }).where(eq(t.institutions.id, personal.id));
  await db.update(t.institutions).set({ kind: 'PERSONAL' }).where(eq(t.institutions.id, personal2.id));
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  for (const x of [college, personal, personal2]) await dropTenant(x.id);
  await pool.end();
});

describe('product events', () => {
  it('drops unknown properties and wrong-shaped values', () => {
    expect(sanitizeProps('grievance_created', { anonymous: true, subject: 'my hostel warden', email: 'x@y.z' })).toEqual({ anonymous: true });
    expect(sanitizeProps('ai_query', { provider: 'something-else' })).toEqual({});
    expect(sanitizeProps('grievance_escalated', { level: 2.7 })).toEqual({ level: 3 });
    expect(Object.keys(EVENTS)).not.toContain('page_view');
  });

  it('stores a pseudonymous actor, a coarse role and nothing identifying', async () => {
    const s = await createUser(college, { role: 'STUDENT' });
    await track({ userId: s.id, institutionId: college.id, role: 'STUDENT' }, 'grievance_created', { anonymous: false, description: 'secret text' });
    const rows = await db.select().from(t.productEvents).where(eq(t.productEvents.institutionId, college.id));
    const row = rows.find((r) => r.event === 'grievance_created')!;
    expect(row.actorHash).toBe(actorHash(s.id));
    expect(row.actorHash).not.toContain(s.id);
    expect(row.props).toEqual({ anonymous: false });
    expect(JSON.stringify(rows)).not.toContain(s.email);
    expect(JSON.stringify(rows)).not.toContain('secret text');
  });

  it('ignores unknown events and never throws', async () => {
    await expect(track({ userId: 'x', institutionId: college.id, role: 'STUDENT' }, 'nope' as never)).resolves.toBeUndefined();
    await expect(track({ userId: 'x', institutionId: '00000000-0000-0000-0000-000000000000', role: 'STUDENT' }, 'notice_viewed')).resolves.toBeUndefined();
  });

  it('records one active day per person per day', async () => {
    const s = await createUser(college, { role: 'FACULTY' });
    const actor = { userId: s.id, institutionId: college.id, role: 'FACULTY' };
    await markActive(actor);
    await markActive(actor);
    const rows = await db.select().from(t.productActiveDays).where(eq(t.productActiveDays.actorHash, actorHash(s.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.role).toBe('FACULTY');
  });

  it('purges rows past the retention period', async () => {
    const s = await createUser(college, { role: 'STUDENT' });
    await db.insert(t.productEvents).values({ institutionId: college.id, actorHash: actorHash(s.id), role: 'STUDENT', event: 'notice_viewed', createdAt: new Date(Date.now() - 500 * 86_400_000) });
    expect(await purgeOldProductEvents()).toBeGreaterThanOrEqual(1);
  });
});

describe('platform metrics', () => {
  it('are for platform operators only', async () => {
    const admin = await createUser(college, { role: 'SUPER_ADMIN' });
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', '');
    await expect(getPlatformMetrics(await ctxFor(admin.id))).rejects.toMatchObject({ status: 403 });
    await expect(getCampusDemand(await ctxFor(admin.id))).rejects.toMatchObject({ status: 403 });
  });

  it('count sign-ups, active people and acknowledgement rates', async () => {
    const op = await createUser(college, { role: 'SUPER_ADMIN' });
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', op.email);
    const before = await getPlatformMetrics(await ctxFor(op.id), 30);
    const s = await createUser(personal, { role: 'STUDENT' });
    await track({ userId: s.id, institutionId: personal.id, role: 'STUDENT' }, 'student_signup');
    await markActive({ userId: s.id, institutionId: personal.id, role: 'STUDENT' });
    const after = await getPlatformMetrics(await ctxFor(op.id), 30);
    expect(after.acquisition.signups).toBe(before.acquisition.signups + 1);
    expect(after.engagement.dau).toBeGreaterThanOrEqual(1);
    expect(after.adoption.map((a) => a.feature)).toContain('Attendance');
    expect(after.byInstitution.some((i) => i.id === personal.id)).toBe(false); // personal workspaces are not colleges
  });
});

describe('acknowledgements', () => {
  async function notice(requires = true) {
    const author = await createUser(college, { role: 'ADMIN' });
    const [a] = await db
      .insert(t.announcements)
      .values({ institutionId: college.id, reference: `N-${Math.random()}`, title: 'Exam form', body: 'Submit by Friday', authorId: author.id, status: 'PUBLISHED', publishedAt: new Date(), requiresAcknowledgement: requires, recipientCount: 1 })
      .returning();
    return a!;
  }

  it('counts one acknowledgement per student even under concurrent clicks', async () => {
    const a = await notice();
    const s = await createUser(college, { role: 'STUDENT' });
    await db.insert(t.announcementRecipients).values({ institutionId: college.id, announcementId: a.id, userId: s.id });
    const ctx = await ctxFor(s.id);
    await Promise.all([acknowledgeAnnouncement(ctx, a.id), acknowledgeAnnouncement(ctx, a.id), acknowledgeAnnouncement(ctx, a.id)]);
    await markAnnouncementRead(ctx, a.id);
    const [row] = await db.select().from(t.announcements).where(eq(t.announcements.id, a.id));
    expect(row).toMatchObject({ acknowledgedCount: 1, readCount: 1 });
  });

  it('refuses someone who was not addressed, and other colleges', async () => {
    const a = await notice();
    const stranger = await createUser(college, { role: 'STUDENT' });
    await expect(acknowledgeAnnouncement(await ctxFor(stranger.id), a.id)).rejects.toMatchObject({ status: 403 });
    const foreign = await createUser(personal, { role: 'STUDENT' });
    await db.insert(t.announcementRecipients).values({ institutionId: college.id, announcementId: a.id, userId: foreign.id });
    // The recipient row belongs to another tenant than the caller's session.
    await expect(acknowledgeAnnouncement(await ctxFor(foreign.id), a.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe('campus demand', () => {
  it('normalises college names', () => {
    expect(collegeKey("St. Xavier's College", 'Kolkata')).toBe(collegeKey('st xaviers   COLLEGE', 'kolkata'));
    expect(collegeKey('Institute of Engineering & Management')).toBe(collegeKey('engineering and management'));
  });

  it('only students in a personal workspace can name a college', async () => {
    const collegeStudent = await createUser(college, { role: 'STUDENT' });
    await expect(recordCampusInterest(await ctxFor(collegeStudent.id), { name: 'Somewhere College' })).rejects.toMatchObject({ status: 409 });
    const teacher = await createUser(personal, { role: 'FACULTY' });
    await expect(recordCampusInterest(await ctxFor(teacher.id), { name: 'Somewhere College' })).rejects.toMatchObject({ status: 403 });
  });

  it('shows aggregates only, above the floor, and forgets a student once verified', async () => {
    const op = await createUser(college, { role: 'SUPER_ADMIN' });
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', op.email);
    vi.stubEnv('CAMPUS_DEMAND_THRESHOLD', String(MIN_VISIBLE));
    const name = `Pilot Demand College ${Math.random().toString(36).slice(2, 7)}`;
    const students = [];
    for (let i = 0; i < MIN_VISIBLE; i++) {
      const tenant = i % 2 ? personal : personal2;
      const s = await createUser(tenant, { role: 'STUDENT' });
      students.push(s);
      await recordCampusInterest(await ctxFor(s.id), { name: i === 0 ? name.toUpperCase() : name, city: 'Kolkata' });
    }
    // Re-submitting does not double count.
    await recordCampusInterest(await ctxFor(students[0]!.id), { name, city: 'Kolkata' });
    let demand = await getCampusDemand(await ctxFor(op.id));
    const hit = demand.warm.find((d) => d.key === collegeKey(name, 'Kolkata'));
    expect(hit?.students).toBe(MIN_VISIBLE);
    expect(JSON.stringify(demand)).not.toContain(students[0]!.id);
    expect(JSON.stringify(demand)).not.toContain(students[0]!.email);

    await clearCampusInterest(students[0]!.id);
    demand = await getCampusDemand(await ctxFor(op.id));
    expect(demand.warm.find((d) => d.key === collegeKey(name, 'Kolkata'))).toBeUndefined(); // below the floor now
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM campus_interest`)).rows as [{ n: number }];
    expect(n).toBeGreaterThanOrEqual(MIN_VISIBLE - 1);
  });
});
