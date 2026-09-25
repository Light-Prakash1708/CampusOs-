import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { addDays, earnedAchievements, levelFor, localDate, weekStart, xpForLevel } from '@/lib/gamification';
import { completionRate, goalState, heatmap } from '@/lib/tracker';
import {
  checkInGoal,
  completeGoal,
  createGoal,
  createTask,
  deleteTask,
  getTrackerOverview,
  undoCheckIn,
  updateGoal,
  updateTask,
  addStep,
  setStepDone,
} from '@/services/tracker';
import { getLeaderboard, getProgress, levelOf, onEventAttended } from '@/services/gamification';
import { anonymousHandle, buildPersonalDataExport, requestDeletion } from '@/services/privacy';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/* --------------------------------- pure ----------------------------------- */

describe('levels', () => {
  it('follows 0, 100, 300, 600, 1000 … and is monotonic', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelFor(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNext: 100 });
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 200 });
    expect(levelFor(599).level).toBe(3);
    expect(levelFor(-50).level).toBe(1);
    let last = 1;
    for (let xp = 0; xp < 20000; xp += 37) {
      const l = levelFor(xp);
      expect(l.level).toBeGreaterThanOrEqual(last);
      expect(xp).toBeGreaterThanOrEqual(xpForLevel(l.level));
      expect(xp).toBeLessThan(xpForLevel(l.level + 1));
      last = l.level;
    }
  });
  it('awards badges only when the threshold is met', () => {
    const zero = { totalXp: 0, checkinDays: 0, bestStreak: 0, goalsCompleted: 0, tasksDone: 0, eventsAttended: 0, certificates: 0 };
    expect(earnedAchievements(zero)).toEqual([]);
    expect(earnedAchievements({ ...zero, checkinDays: 1, bestStreak: 7 })).toEqual(['FIRST_CHECKIN', 'STREAK_7']);
    expect(earnedAchievements({ ...zero, totalXp: 1000 })).toEqual(['LEVEL_5']);
  });
});

describe('streaks', () => {
  const today = '2026-09-24'; // Thursday
  const days = (...ds: string[]) => ds.map((date) => ({ date, count: 1 }));

  it('counts a daily run ending today, or yesterday while today is still open', () => {
    const run = days('2026-09-21', '2026-09-22', '2026-09-23');
    expect(goalState({ cadence: 'DAILY', targetPerPeriod: 1 }, run, today)).toMatchObject({ current: 3, best: 3, checkedToday: false, period: { met: false } });
    expect(goalState({ cadence: 'DAILY', targetPerPeriod: 1 }, [...run, ...days(today)], today).current).toBe(4);
    // A gap breaks it; the best run is remembered.
    const broken = days('2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-22');
    expect(goalState({ cadence: 'DAILY', targetPerPeriod: 1 }, broken, today)).toMatchObject({ current: 0, best: 4 });
  });
  it('needs the per-day target to count a day', () => {
    const s = goalState({ cadence: 'DAILY', targetPerPeriod: 2 }, [{ date: '2026-09-23', count: 2 }, { date: today, count: 1 }], today);
    expect(s).toMatchObject({ current: 1, checkedToday: true, period: { done: 1, target: 2, met: false } });
  });
  it('counts weeks for weekly goals and never counts the future', () => {
    // Weeks of 7, 14 and 21 Sept each have 3 days; this week (21st) has 3 so far.
    const hist = days('2026-09-07', '2026-09-08', '2026-09-09', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-01');
    expect(goalState({ cadence: 'WEEKLY', targetPerPeriod: 3 }, hist, today)).toMatchObject({ current: 3, period: { done: 3, target: 3, met: true } });
    expect(goalState({ cadence: 'WEEKLY', targetPerPeriod: 4 }, hist, today).current).toBe(0);
  });
  it('builds heatmaps and completion rates over real days only', () => {
    const h = heatmap(days('2026-09-24', '2026-09-24'), today, 7);
    expect(h).toHaveLength(7);
    expect(h[6]).toEqual({ date: today, count: 2 });
    expect(h[0]!.date).toBe('2026-09-18');
    expect(completionRate({ cadence: 'DAILY', targetPerPeriod: 1, startDate: '2026-09-23' }, days('2026-09-23'), today)).toBe(50);
    expect(completionRate({ cadence: 'ONCE', targetPerPeriod: 1, startDate: '2026-09-01' }, [], today)).toBeNull();
  });
  it('local dates follow the college timezone, not UTC', () => {
    expect(localDate(new Date('2026-09-23T19:00:00Z'), 'Asia/Kolkata')).toBe('2026-09-24'); // 00:30 IST
    expect(weekStart('2026-09-27')).toBe('2026-09-21');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

/* ------------------------------ integration ------------------------------- */

let A: TestTenant;
let B: TestTenant;

beforeAll(async () => {
  A = await createTenant();
  B = await createTenant();
  for (const id of [A.id, B.id]) {
    await db
      .update(t.institutions)
      .set({ featureFlags: { personal_tracker_enabled: true, gamification_enabled: true, leaderboards_enabled: true, events_enabled: true } })
      .where(eq(t.institutions.id, id));
  }
});

afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

const student = async (tenant: TestTenant = A) => ctxFor((await createUser(tenant)).id);
const xpRows = (userId: string) => db.select().from(t.xpEvents).where(eq(t.xpEvents.userId, userId));

describe('goals and check-ins', () => {
  it('checks in once per call, pays XP once per goal-day, caps paid check-ins per day, and reverses on undo', async () => {
    const me = await student();
    const goals = await Promise.all([1, 2, 3, 4].map((i) => createGoal(me, { title: `Habit ${i}`, category: 'STUDY', cadence: 'DAILY', targetPerPeriod: 1 })));
    const first = await checkInGoal(me, goals[0]!.id, {});
    expect(first).toMatchObject({ count: 1, xp: 5 });
    const again = await checkInGoal(me, goals[0]!.id, {});
    expect(again).toMatchObject({ count: 2, xp: 0 }); // same goal, same day: no second payment
    await checkInGoal(me, goals[1]!.id, {});
    await checkInGoal(me, goals[2]!.id, {});
    expect((await checkInGoal(me, goals[3]!.id, {})).xp).toBe(0); // daily cap of 3 reached
    expect((await xpRows(me.userId)).filter((x) => x.source === 'GOAL_CHECKIN')).toHaveLength(3);

    await undoCheckIn(me, goals[1]!.id); // count 1 → 0: reversed
    const after = await xpRows(me.userId);
    expect(after.find((x) => x.source === 'REVERSAL')?.amount).toBe(-5);
    // Checking in again that day can't earn it back (no farming by undo/redo).
    expect((await checkInGoal(me, goals[1]!.id, {})).xp).toBe(0);
  });

  it('pays a streak milestone once per run', async () => {
    const me = await student();
    const { id } = await createGoal(me, { title: 'Read', category: 'READING', cadence: 'DAILY', targetPerPeriod: 1 });
    const info = await db.select({ tz: t.institutions.timezone }).from(t.institutions).where(eq(t.institutions.id, A.id));
    const today = localDate(new Date(), info[0]!.tz);
    await db.update(t.trackerGoals).set({ startDate: addDays(today, -10) }).where(eq(t.trackerGoals.id, id));
    await db.insert(t.trackerCheckins).values([1, 2, 3, 4, 5, 6].map((n) => ({ institutionId: A.id, userId: me.userId, goalId: id, localDate: addDays(today, -n) })));
    const r = await checkInGoal(me, id, {});
    expect(r.milestones).toEqual([7]);
    await undoCheckIn(me, id);
    expect((await checkInGoal(me, id, {})).milestones).toEqual([]);
    expect((await xpRows(me.userId)).filter((x) => x.source === 'STREAK_MILESTONE')).toHaveLength(1);
    const badges = await db.select().from(t.userAchievements).where(eq(t.userAchievements.userId, me.userId));
    expect(badges.map((b) => b.code)).toEqual(expect.arrayContaining(['FIRST_CHECKIN', 'STREAK_7']));
  });

  it('pays goal completion only for real progress, and only once', async () => {
    const me = await student();
    const empty = await createGoal(me, { title: 'Nothing done', category: 'PERSONAL', cadence: 'DAILY', targetPerPeriod: 1 });
    expect((await completeGoal(me, empty.id)).xp).toBe(0);
    const steps = await createGoal(me, { title: 'SQL course', category: 'SKILL', cadence: 'ONCE', targetPerPeriod: 1, steps: ['Week 1', 'Week 2'] });
    await expect(completeGoal(me, steps.id)).rejects.toThrow(/every step/);
    const o = await getTrackerOverview(me);
    for (const s of o.goals.find((g) => g.id === steps.id)!.steps) await setStepDone(me, s.id, true);
    expect((await completeGoal(me, steps.id)).xp).toBe(30);
    expect((await completeGoal(me, steps.id)).xp).toBe(0);
    await expect(addStep(me, steps.id, 'More')).rejects.toThrow(/already complete/);
  });

  it('never lets a student read or change another student’s goals or tasks', async () => {
    const owner = await student();
    const other = await student();
    const otherCollege = await student(B);
    const { id } = await createGoal(owner, { title: 'Mine', category: 'STUDY', cadence: 'DAILY', targetPerPeriod: 1 });
    const task = await createTask(owner, { title: 'Private task' });
    for (const intruder of [other, otherCollege]) {
      await expect(checkInGoal(intruder, id, {})).rejects.toThrow(/not found/i);
      await expect(updateGoal(intruder, id, { title: 'Hacked' })).rejects.toThrow(/not found/i);
      await expect(updateTask(intruder, task.id, { done: true })).rejects.toThrow(/not found/i);
      await expect(deleteTask(intruder, task.id)).rejects.toThrow(/not found/i);
      await expect(createTask(intruder, { title: 'x', goalId: id })).rejects.toThrow(/not found/i);
      expect((await getTrackerOverview(intruder)).goals.map((g) => g.id)).not.toContain(id);
    }
  });

  it('respects the flag, pausing, and validation', async () => {
    const me = await student();
    const { id } = await createGoal(me, { title: 'Run', category: 'HEALTH', cadence: 'WEEKLY', targetPerPeriod: 3 });
    await updateGoal(me, id, { status: 'PAUSED' });
    await expect(checkInGoal(me, id, {})).rejects.toThrow(/paused/);
    await expect(createGoal(me, { title: 'Bad', category: 'HEALTH', cadence: 'WEEKLY', targetPerPeriod: 8 })).rejects.toThrow(/7 days/);
    await expect(checkInGoal({ ...me, featureFlags: { ...me.featureFlags, personal_tracker_enabled: false } }, id, {})).rejects.toThrow(/switched off/);
  });

  it('keeps the XP ledger append-only', async () => {
    const me = await student();
    const { id } = await createGoal(me, { title: 'Ledger', category: 'STUDY', cadence: 'DAILY', targetPerPeriod: 1 });
    await checkInGoal(me, id, {});
    const error = await db.execute(sql`UPDATE xp_events SET amount = 999 WHERE user_id = ${me.userId}`).then(() => null, (e: { cause?: { message?: string } }) => e);
    expect(error?.cause?.message).toMatch(/append-only/);
  });
});

describe('verified XP, challenges and leaderboards', () => {
  async function attendedEvent(tenant: TestTenant, userIds: string[]) {
    const admin = await createUser(tenant, { role: 'ADMIN' });
    const start = new Date(Date.now() - 3600_000);
    const [ev] = await db
      .insert(t.events)
      .values({ institutionId: tenant.id, organizerId: admin.id, title: `Fest ${Math.random().toString(36).slice(2, 6)}`, category: 'WORKSHOP', startsAt: start, endsAt: new Date(start.getTime() + 7200_000), status: 'SCHEDULED' } as typeof t.events.$inferInsert)
      .returning({ id: t.events.id });
    for (const uid of userIds) {
      const [r] = await db
        .insert(t.eventRegistrations)
        .values({ institutionId: tenant.id, eventId: ev!.id, userId: uid, status: 'REGISTERED', code: Math.random().toString(36).slice(2, 8).toUpperCase(), attendeeInstitutionId: tenant.id } as typeof t.eventRegistrations.$inferInsert)
        .returning({ id: t.eventRegistrations.id });
      await db.insert(t.eventCheckins).values({ institutionId: tenant.id, eventId: ev!.id, registrationId: r!.id, checkedInById: admin.id, method: 'CODE' } as typeof t.eventCheckins.$inferInsert);
      await onEventAttended(uid, ev!.id);
      await onEventAttended(uid, ev!.id); // a double scan pays once
    }
    return ev!.id;
  }

  it('pays verified XP once per event, completes the weekly event challenge, and earns the badge', async () => {
    const me = await student();
    await attendedEvent(A, [me.userId]);
    const rows = await xpRows(me.userId);
    expect(rows.filter((x) => x.source === 'EVENT_ATTENDED')).toEqual([expect.objectContaining({ amount: 40, verified: true })]);
    expect(rows.filter((x) => x.source === 'CHALLENGE_COMPLETED')).toHaveLength(1);
    const p = await getProgress(me);
    expect(p.verifiedXp).toBe(40);
    expect(p.totalXp).toBe(65);
    expect(p.challenges.find((c) => c.code === 'WEEK_EVENT_1')).toMatchObject({ done: true, progress: 1 });
    expect(p.achievements.find((a) => a.code === 'EVENT_1')?.earnedAt).toBeTruthy();
    expect((await levelOf(me.userId)).level).toBe(1);
  });

  it('ranks only verified XP, and only students who opted in (private: self only; opt-out: nobody)', async () => {
    const T = await createTenant();
    await db.update(t.institutions).set({ featureFlags: { gamification_enabled: true, leaderboards_enabled: true, personal_tracker_enabled: true } }).where(eq(t.institutions.id, T.id));
    try {
      const [pub, anon, priv, out] = await Promise.all([1, 2, 3, 4].map(async () => ctxFor((await createUser(T)).id)));
      const vis = [['PUBLIC', pub], ['ANONYMOUS', anon], ['OPT_OUT', out]] as const;
      for (const [v, c] of vis) await db.insert(t.privacyPreferences).values({ institutionId: T.id, userId: c!.userId, leaderboardVisibility: v });
      await attendedEvent(T, [pub!.userId, anon!.userId, priv!.userId, out!.userId]);
      // Lots of self-reported XP must not move anyone on the board.
      const g = await createGoal(anon!, { title: 'Grind', category: 'STUDY', cadence: 'DAILY', targetPerPeriod: 1 });
      await checkInGoal(anon!, g.id, {});

      const seenByPub = await getLeaderboard(pub!, 'college', 'week');
      expect(seenByPub.rows.map((r) => r.xp)).toEqual([40, 40]);
      expect(seenByPub.rows.every((r) => r.rank === 1)).toBe(true);
      expect(seenByPub.rows.map((r) => r.name).sort()).toEqual([expect.stringMatching(/^Student [0-9A-F]{4}$/), expect.stringMatching(/\(you\)$/)].sort());
      expect(JSON.stringify(seenByPub)).not.toContain(priv!.userId);

      const seenByPrivate = await getLeaderboard(priv!, 'college', 'week');
      expect(seenByPrivate.me).toMatchObject({ xp: 40 });
      expect(seenByPrivate.rows).toHaveLength(3);
      expect((await getLeaderboard(pub!, 'college', 'week')).rows).toHaveLength(2); // private student never shown to others

      const seenByOptOut = await getLeaderboard(out!, 'college', 'all');
      expect(seenByOptOut.me).toBeNull();
      expect(seenByOptOut.rows).toHaveLength(2);

      // Another college never appears.
      const outsider = await student(A);
      const board = JSON.stringify(await getLeaderboard(outsider, 'college', 'all'));
      expect(board).not.toContain(anonymousHandle(anon!.userId));
    } finally {
      await dropTenant(T.id);
    }
  });
});

describe('privacy', () => {
  it('exports tracker data and XP, and erasure removes self-reported data but keeps verified XP', async () => {
    const me = await student();
    const { id } = await createGoal(me, { title: 'Export me', category: 'CAREER', cadence: 'DAILY', targetPerPeriod: 1, unit: 'minutes' });
    await checkInGoal(me, id, { amount: 25, note: 'mock interview' });
    await createTask(me, { title: 'Update CV' });
    const [evId] = [await (async () => {
      const admin = await createUser(A, { role: 'ADMIN' });
      const [ev] = await db
        .insert(t.events)
        .values({ institutionId: A.id, organizerId: admin.id, title: 'Talk', category: 'WORKSHOP', startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 3600_000), status: 'SCHEDULED' } as typeof t.events.$inferInsert)
        .returning({ id: t.events.id });
      return ev!.id;
    })()];
    await db.insert(t.xpEvents).values({ institutionId: A.id, userId: me.userId, amount: 40, source: 'EVENT_ATTENDED', verified: true, reason: 'x', refId: evId, idempotencyKey: `event:${evId}`, localDate: '2026-09-01' });

    const exported = await buildPersonalDataExport(me);
    expect(exported.tracker.goals.map((g) => g.title)).toContain('Export me');
    expect(exported.tracker.checkins[0]).toMatchObject({ amount: 25, note: 'mock interview' });
    expect(exported.tracker.tasks.map((x) => x.title)).toContain('Update CV');
    expect(exported.tracker.xpLedger.length).toBeGreaterThanOrEqual(2);

    const r = await requestDeletion(me, { scope: 'PERSONAL_TRACKER' }, meta());
    expect(r.status).toBe('COMPLETED');
    expect(await db.select().from(t.trackerGoals).where(eq(t.trackerGoals.userId, me.userId))).toHaveLength(0);
    expect(await db.select().from(t.trackerTasks).where(eq(t.trackerTasks.userId, me.userId))).toHaveLength(0);
    const left = await xpRows(me.userId);
    expect(left.map((x) => x.source)).toEqual(['EVENT_ATTENDED']);
    const badges = await db.select().from(t.userAchievements).where(and(eq(t.userAchievements.userId, me.userId), eq(t.userAchievements.code, 'FIRST_CHECKIN')));
    expect(badges).toHaveLength(0);
  });
});
