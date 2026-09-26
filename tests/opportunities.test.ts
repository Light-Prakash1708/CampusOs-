import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { buildToday } from '@/lib/today';
import { JsonFeedProvider } from '@/services/opportunities/providers';
import { adminOpportunities, importFeed, listForStudent, moderateOpportunity, setCareerGoal, skillMatch, submitOpportunity, trackOpportunity } from '@/services/opportunities';
import { getStudentSkillProfile } from '@/services/skills';
import { buildPersonalDataExport } from '@/services/privacy';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

const DAY = 86_400_000;
const base = { kind: 'INTERNSHIP' as const, organization: 'Hooghly Analytics (test)', workMode: 'ONSITE' as const, applyUrl: 'https://example.org/apply' };

/* --------------------------------- pure ----------------------------------- */

describe('skill match', () => {
  it('matches case-insensitively and lists what is missing', () => {
    expect(skillMatch(['Excel', 'SQL', 'Python'], new Set(['excel', 'sql']))).toEqual({ matched: ['Excel', 'SQL'], missing: ['Python'] });
    expect(skillMatch([], new Set(['excel']))).toEqual({ matched: [], missing: [] });
  });
  it('reminds about saved applications closing today or tomorrow', () => {
    const now = Date.now();
    const items = buildToday({
      today: new Date(now).toISOString().slice(0, 10),
      nowMinutes: 0,
      timeZone: 'UTC',
      classes: [],
      nextClass: null,
      assignments: [],
      attentionSubjects: [],
      events: [],
      notices: [],
      applications: [
        { id: 'soon', title: 'Soon', organization: 'X', deadline: new Date(now + 3600_000) },
        { id: 'past', title: 'Past', organization: 'X', deadline: new Date(now - 3600_000) },
        { id: 'far', title: 'Far', organization: 'X', deadline: new Date(now + 10 * DAY) },
      ],
    });
    expect(items.map((i) => i.key)).toEqual(['opp-soon']);
  });
});

describe('json feed provider', () => {
  const fakeFetch = (body: unknown, status = 200) => (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('validates items and reports the bad ones', async () => {
    const p = new JsonFeedProvider('https://feed.test/x.json', undefined, fakeFetch({
      items: [
        { id: 'a1', kind: 'JOB', title: 'Analyst', organization: 'Org', applyUrl: 'https://org.test/a1', skills: ['Excel'] },
        { id: 'a2', kind: 'NOT_A_KIND', title: 'Bad', organization: 'Org' },
        { id: 'a3', kind: 'JOB', title: 'Bad link', organization: 'Org', applyUrl: 'javascript:alert(1)' },
      ],
    }));
    const r = await p.fetch();
    expect(r.items.map((i) => i.id)).toEqual(['a1']);
    expect(r.rejected.map((x) => x.index)).toEqual([1, 2]);
  });
  it('fails clearly on bad responses', async () => {
    await expect(new JsonFeedProvider('https://f.test', undefined, fakeFetch('nope')).fetch()).rejects.toThrow(/not valid JSON/);
    await expect(new JsonFeedProvider('https://f.test', undefined, fakeFetch({ a: 1 })).fetch()).rejects.toThrow(/array/);
    await expect(new JsonFeedProvider('https://f.test', undefined, fakeFetch([], 500)).fetch()).rejects.toThrow(/HTTP 500/);
  });
});

/* ------------------------------ integration ------------------------------- */

let A: TestTenant;
let B: TestTenant;

beforeAll(async () => {
  A = await createTenant();
  B = await createTenant();
  for (const id of [A.id, B.id]) {
    await db.update(t.institutions).set({ featureFlags: { opportunity_hub_enabled: true, skill_engine_enabled: true } }).where(eq(t.institutions.id, id));
  }
});

afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

const staff = async (tenant: TestTenant = A) => ctxFor((await createUser(tenant, { role: 'ADMIN' })).id);
const student = async (tenant: TestTenant = A) => ctxFor((await createUser(tenant)).id);

describe('listings', () => {
  it('publishes staff listings at once and holds student submissions for review', async () => {
    const admin = await staff();
    const s1 = await student();
    const s2 = await student();
    const pub = await submitOpportunity(admin, { ...base, title: 'Finance intern' }, meta());
    expect(pub.status).toBe('PUBLISHED');
    const sub = await submitOpportunity(s1, { ...base, title: 'Hackathon I found', kind: 'HACKATHON' }, meta());
    expect(sub.status).toBe('PENDING');
    let seen = (await listForStudent(s2)).map((o) => o.id);
    expect(seen).toContain(pub.id);
    expect(seen).not.toContain(sub.id);
    await expect(moderateOpportunity(s2, sub.id, { action: 'APPROVE' }, meta())).rejects.toThrow();
    await expect(moderateOpportunity(admin, sub.id, { action: 'REJECT', note: '' }, meta())).rejects.toThrow(/Say why/);
    await moderateOpportunity(admin, sub.id, { action: 'APPROVE' }, meta());
    seen = (await listForStudent(s2)).map((o) => o.id);
    expect(seen).toContain(sub.id);
    const [n] = await db.select().from(t.notifications).where(and(eq(t.notifications.userId, s1.userId), eq(t.notifications.sourceId, sub.id)));
    expect(n?.title).toMatch(/Published/);
    // Another college never sees it.
    expect((await listForStudent(await student(B))).map((o) => o.id)).not.toContain(pub.id);
  });

  it('hides expired and department-targeted listings from those they are not for', async () => {
    const admin = await staff();
    const [otherDept] = await db.insert(t.departments).values({ institutionId: A.id, name: 'Engineering', code: `ENG${Date.now() % 10000}` }).returning();
    const targeted = await submitOpportunity(admin, { ...base, title: 'Engineering only', departmentId: otherDept!.id }, meta());
    const soon = await submitOpportunity(admin, { ...base, title: 'Closing soon', deadline: new Date(Date.now() + 60_000) }, meta());
    const s = await student();
    await trackOpportunity(s, soon.id, { status: 'APPLIED' });
    await db.update(t.opportunities).set({ deadline: new Date(Date.now() - 1000) }).where(eq(t.opportunities.id, soon.id));
    const discover = (await listForStudent(s)).map((o) => o.id);
    expect(discover).not.toContain(targeted.id);
    expect(discover).not.toContain(soon.id);
    // …but an application already tracked stays in "My applications".
    expect((await listForStudent(s, { tracked: true })).map((o) => o.id)).toEqual([soon.id]);
    await expect(submitOpportunity(admin, { ...base, title: 'Past', deadline: new Date(Date.now() - DAY) }, meta())).rejects.toThrow(/already passed/);
  });

  it('keeps each student’s tracker private; staff see counts only', async () => {
    const admin = await staff();
    const { id } = await submitOpportunity(admin, { ...base, title: 'Tracked role' }, meta());
    const s1 = await student();
    const s2 = await student();
    await trackOpportunity(s1, id, { status: 'SAVED' });
    await trackOpportunity(s1, id, { status: 'APPLIED', note: 'Sent CV' });
    const mine = (await listForStudent(s1)).find((o) => o.id === id)!;
    expect(mine).toMatchObject({ track: 'APPLIED', trackNote: 'Sent CV' });
    expect(mine.appliedAt).toBeTruthy();
    expect((await listForStudent(s2)).find((o) => o.id === id)!.track).toBeNull();
    const view = await adminOpportunities(admin, 'PUBLISHED');
    const row = view.rows.find((r) => r.id === id)!;
    expect(row.applications).toBe(1);
    expect(JSON.stringify(row)).not.toContain(s1.userId);
    await trackOpportunity(s1, id, { status: 'NONE' });
    expect((await listForStudent(s1, { tracked: true })).map((o) => o.id)).not.toContain(id);
    const outsider = await student(B);
    await expect(trackOpportunity(outsider, id, { status: 'SAVED' })).rejects.toThrow(/not found/i);
  });

  it('imports a feed as pending, idempotently', async () => {
    const admin = await staff();
    const feed = {
      name: 'json-feed',
      fetch: async () => ({
        items: [
          { id: 'x1', kind: 'JOB' as const, title: 'Feed job', organization: 'Org', workMode: 'REMOTE' as const, skills: [] },
          { id: 'x2', kind: 'INTERNSHIP' as const, title: 'Old', organization: 'Org', workMode: 'ONSITE' as const, skills: [], deadline: new Date(Date.now() - DAY) },
        ],
        rejected: [{ index: 2, problem: 'bad' }],
      }),
    };
    const first = await importFeed(admin, meta(), feed);
    expect(first).toMatchObject({ fetched: 2, imported: 1, invalid: 1 });
    const again = await importFeed(admin, meta(), feed);
    expect(again.imported).toBe(0);
    const pending = await adminOpportunities(admin, 'PENDING');
    expect(pending.rows.filter((r) => r.title === 'Feed job')).toHaveLength(1);
    expect((await listForStudent(await student())).map((o) => o.title)).not.toContain('Feed job');
    await expect(importFeed(admin, meta(), null)).rejects.toThrow(/No opportunities feed/);
  });
});

describe('career goal', () => {
  it('lets a student pick a role from their own college only', async () => {
    const s = await student();
    const [role] = await db.insert(t.careerRoles).values({ institutionId: A.id, title: 'Financial Analyst', slug: `fa-${Date.now()}` } as typeof t.careerRoles.$inferInsert).returning();
    const [foreign] = await db.insert(t.careerRoles).values({ institutionId: B.id, title: 'Other', slug: `o-${Date.now()}` } as typeof t.careerRoles.$inferInsert).returning();
    await expect(setCareerGoal(s, foreign!.id)).rejects.toThrow(/not found/i);
    await setCareerGoal(s, role!.id);
    const profile = await getStudentSkillProfile(A.id, s.studentProfileId!);
    expect(profile.careerGoal?.title).toBe('Financial Analyst');
    await setCareerGoal(s, null);
    expect((await getStudentSkillProfile(A.id, s.studentProfileId!)).careerGoal).toBeNull();
  });

  it('exports the tracker', async () => {
    const admin = await staff();
    const s = await student();
    const { id } = await submitOpportunity(admin, { ...base, title: 'Export role' }, meta());
    await trackOpportunity(s, id, { status: 'INTERVIEWING', note: 'Round 2' });
    const data = await buildPersonalDataExport(s);
    expect(data.career.applications).toEqual([expect.objectContaining({ title: 'Export role', status: 'INTERVIEWING', note: 'Round 2' })]);
  });
});
