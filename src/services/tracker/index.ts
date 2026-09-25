import 'server-only';
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { ACHIEVEMENTS, addDays, CHECKIN_XP_DAILY_CAP, localDate, STREAK_MILESTONES, XP } from '@/lib/gamification';
import { completionRate, goalState, heatmap, type Cadence, type GoalCategory } from '@/lib/tracker';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { awardXp, gamificationOn, institutionInfo, refreshProgress } from '@/services/gamification';

/**
 * PERSONAL TRACKER SERVICE
 * ---------------------------------------------------------------------------
 * Goals, habits (daily/weekly check-ins), milestone steps and to-dos. Every
 * row belongs to one student and every query is filtered by ctx.userId — ids
 * in a request only ever select among the caller's own rows. No staff screen
 * reads this data, and it is not written to the audit log (a log of someone's
 * habits would itself be a privacy leak). Erasure is immediate.
 */

export const MAX_ACTIVE_GOALS = 30;
export const MAX_OPEN_TASKS = 300;

export function requireTracker(ctx: AuthContext) {
  if (!isEnabled(ctx.featureFlags, 'personal_tracker_enabled')) {
    throw new AppError('The personal tracker is switched off at your college.', 404, 'FEATURE_DISABLED');
  }
}

async function todayFor(ctx: AuthContext) {
  const info = await institutionInfo(ctx.institutionId);
  return { today: localDate(new Date(), info.timeZone), timeZone: info.timeZone, gamify: gamificationOn(ctx.featureFlags) };
}

async function ownGoal(ctx: AuthContext, goalId: string) {
  const [g] = await db
    .select()
    .from(t.trackerGoals)
    .where(and(eq(t.trackerGoals.id, goalId), eq(t.trackerGoals.userId, ctx.userId)))
    .limit(1);
  if (!g) throw new NotFoundError('Goal');
  return g;
}

/* ---------------------------------- goals --------------------------------- */

export interface GoalInput {
  title: string;
  description?: string | null;
  category: GoalCategory;
  cadence: Cadence;
  targetPerPeriod: number;
  unit?: string | null;
  targetDate?: string | null;
  steps?: string[];
}

export async function createGoal(ctx: AuthContext, input: GoalInput) {
  requireTracker(ctx);
  await enforceRateLimit(keyFor('tracker:goal', ctx.userId), { limit: 40, windowSec: 86_400 }, 'You’ve created a lot of goals today. Try again tomorrow.');
  const [{ n }] = (await db
    .select({ n: count() })
    .from(t.trackerGoals)
    .where(and(eq(t.trackerGoals.userId, ctx.userId), inArray(t.trackerGoals.status, ['ACTIVE', 'PAUSED'])))) as [{ n: number }];
  if (Number(n) >= MAX_ACTIVE_GOALS) throw new ConflictError(`You can have up to ${MAX_ACTIVE_GOALS} goals at once. Complete or archive one first.`);
  const { today } = await todayFor(ctx);
  if (input.targetDate && input.targetDate < today) throw new AppError('The target date is in the past.', 422, 'BAD_DATE');
  if (input.cadence === 'WEEKLY' && input.targetPerPeriod > 7) throw new AppError('A week has 7 days.', 422, 'BAD_TARGET');

  return db.transaction(async (tx) => {
    const [g] = await tx
      .insert(t.trackerGoals)
      .values({
        institutionId: ctx.institutionId,
        userId: ctx.userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        category: input.category,
        cadence: input.cadence,
        targetPerPeriod: input.cadence === 'ONCE' ? 1 : input.targetPerPeriod,
        unit: input.unit?.trim() || null,
        startDate: today,
        targetDate: input.targetDate ?? null,
      })
      .returning({ id: t.trackerGoals.id });
    const steps = (input.steps ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 30);
    if (steps.length) {
      await tx.insert(t.trackerGoalSteps).values(steps.map((title, position) => ({ institutionId: ctx.institutionId, userId: ctx.userId, goalId: g!.id, title, position })));
    }
    return { id: g!.id };
  });
}

export async function updateGoal(
  ctx: AuthContext,
  goalId: string,
  input: Partial<Pick<GoalInput, 'title' | 'description' | 'category' | 'targetPerPeriod' | 'unit' | 'targetDate'>> & { status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' },
) {
  requireTracker(ctx);
  const g = await ownGoal(ctx, goalId);
  if (g.status === 'COMPLETED' && input.status && input.status !== 'ARCHIVED') throw new ConflictError('This goal is already complete.');
  if (input.targetPerPeriod !== undefined && g.cadence === 'WEEKLY' && input.targetPerPeriod > 7) throw new AppError('A week has 7 days.', 422, 'BAD_TARGET');
  if (input.targetDate && input.targetDate < g.startDate) throw new AppError('The target date is before the goal started.', 422, 'BAD_DATE');
  await db
    .update(t.trackerGoals)
    .set({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.targetPerPeriod !== undefined && g.cadence !== 'ONCE' ? { targetPerPeriod: input.targetPerPeriod } : {}),
      ...(input.unit !== undefined ? { unit: input.unit?.trim() || null } : {}),
      ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(t.trackerGoals.id, g.id));
  return { id: g.id };
}

export async function deleteGoal(ctx: AuthContext, goalId: string) {
  requireTracker(ctx);
  const g = await ownGoal(ctx, goalId);
  await db.delete(t.trackerGoals).where(eq(t.trackerGoals.id, g.id)); // steps and check-ins cascade; tasks are kept, unlinked
  return { deleted: true };
}

/**
 * Mark a goal complete. XP is paid once per goal, and only for real progress:
 * a milestone with all its steps ticked, or a habit with at least one check-in.
 */
export async function completeGoal(ctx: AuthContext, goalId: string) {
  requireTracker(ctx);
  const g = await ownGoal(ctx, goalId);
  if (g.status === 'COMPLETED') return { id: g.id, xp: 0 };
  const steps = await db.select({ doneAt: t.trackerGoalSteps.doneAt }).from(t.trackerGoalSteps).where(eq(t.trackerGoalSteps.goalId, g.id));
  const [{ n: checkins }] = (await db.select({ n: count() }).from(t.trackerCheckins).where(eq(t.trackerCheckins.goalId, g.id))) as [{ n: number }];
  if (steps.length && steps.some((s) => !s.doneAt)) throw new ConflictError('Tick off every step first, or remove the ones you no longer need.');
  const earned = steps.length > 0 || Number(checkins) > 0;

  await db.update(t.trackerGoals).set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() }).where(eq(t.trackerGoals.id, g.id));
  const { today, timeZone, gamify } = await todayFor(ctx);
  let xp = 0;
  if (gamify && earned) {
    const fresh = await awardXp(db, {
      userId: ctx.userId,
      institutionId: ctx.institutionId,
      amount: XP.GOAL_COMPLETED,
      source: 'GOAL_COMPLETED',
      verified: false,
      reason: `Completed: ${g.title}`,
      refId: g.id,
      key: `goal:${g.id}`,
      localDate: today,
    });
    if (fresh) xp = XP.GOAL_COMPLETED;
  }
  if (gamify) await refreshProgress(ctx.userId, ctx.institutionId, timeZone);
  return { id: g.id, xp };
}

/* ------------------------------- check-ins -------------------------------- */

/**
 * Log a check-in for today (or yesterday — people forget at midnight). One
 * row per goal per day; more check-ins raise the count. The first check-in of
 * a goal on a day earns XP, up to CHECKIN_XP_DAILY_CAP goals a day.
 */
export async function checkInGoal(ctx: AuthContext, goalId: string, input: { amount?: number | null; note?: string | null; day?: 'today' | 'yesterday' }) {
  requireTracker(ctx);
  await enforceRateLimit(keyFor('tracker:checkin', ctx.userId), { limit: 300, windowSec: 3600 }, 'Too many check-ins. Take a breath and try again shortly.');
  const g = await ownGoal(ctx, goalId);
  if (g.status !== 'ACTIVE') throw new ConflictError(g.status === 'PAUSED' ? 'This goal is paused. Resume it to check in.' : 'This goal is no longer active.');
  const { today, timeZone, gamify } = await todayFor(ctx);
  const date = input.day === 'yesterday' ? addDays(today, -1) : today;
  if (date < g.startDate && input.day === 'yesterday') throw new AppError('This goal started today.', 422, 'BEFORE_START');

  const [row] = await db
    .insert(t.trackerCheckins)
    .values({ institutionId: ctx.institutionId, userId: ctx.userId, goalId: g.id, localDate: date, count: 1, amount: input.amount ?? null, note: input.note?.trim() || null })
    .onConflictDoUpdate({
      target: [t.trackerCheckins.goalId, t.trackerCheckins.localDate],
      set: {
        count: sql`least(${t.trackerCheckins.count} + 1, 50)`,
        amount: input.amount != null ? sql`coalesce(${t.trackerCheckins.amount}, 0) + ${input.amount}` : sql`${t.trackerCheckins.amount}`,
        note: input.note?.trim() ? input.note.trim() : sql`${t.trackerCheckins.note}`,
        updatedAt: new Date(),
      },
    })
    .returning({ count: t.trackerCheckins.count });

  let xp = 0;
  const milestones: number[] = [];
  if (gamify) {
    const [{ n: paidToday }] = (await db
      .select({ n: count() })
      .from(t.xpEvents)
      .where(and(eq(t.xpEvents.userId, ctx.userId), eq(t.xpEvents.source, 'GOAL_CHECKIN'), eq(t.xpEvents.localDate, date)))) as [{ n: number }];
    if (Number(paidToday) < CHECKIN_XP_DAILY_CAP) {
      const fresh = await awardXp(db, {
        userId: ctx.userId,
        institutionId: ctx.institutionId,
        amount: XP.GOAL_CHECKIN,
        source: 'GOAL_CHECKIN',
        verified: false,
        reason: `Check-in: ${g.title}`,
        refId: g.id,
        key: `checkin:${g.id}:${date}`,
        localDate: date,
      });
      if (fresh) xp += XP.GOAL_CHECKIN;
    }
    // Streak milestones — once per run (a new run after a break can earn them again).
    const history = await db
      .select({ date: t.trackerCheckins.localDate, count: t.trackerCheckins.count })
      .from(t.trackerCheckins)
      .where(eq(t.trackerCheckins.goalId, g.id));
    const state = goalState({ cadence: g.cadence as Cadence, targetPerPeriod: g.targetPerPeriod }, history, today);
    for (const [len, bonus] of Object.entries(STREAK_MILESTONES)) {
      const m = Number(len);
      if (state.current < m || g.cadence === 'ONCE') continue;
      const step = g.cadence === 'WEEKLY' ? 7 : 1;
      const runStart = addDays(today, -(state.current - 1) * step);
      const fresh = await awardXp(db, {
        userId: ctx.userId,
        institutionId: ctx.institutionId,
        amount: bonus,
        source: 'STREAK_MILESTONE',
        verified: false,
        reason: `${m}-${g.cadence === 'WEEKLY' ? 'week' : 'day'} streak: ${g.title}`,
        refId: g.id,
        key: `streak:${g.id}:${m}:${runStart}`,
        localDate: today,
      });
      if (fresh) {
        xp += bonus;
        milestones.push(m);
      }
    }
    await refreshProgress(ctx.userId, ctx.institutionId, timeZone);
  }
  return { date, count: row!.count, xp, milestones };
}

/** Undo the last check-in on a day. XP paid for that day's first check-in is reversed. */
export async function undoCheckIn(ctx: AuthContext, goalId: string, day: 'today' | 'yesterday' = 'today') {
  requireTracker(ctx);
  const g = await ownGoal(ctx, goalId);
  const { today } = await todayFor(ctx);
  const date = day === 'yesterday' ? addDays(today, -1) : today;
  const [row] = await db
    .select()
    .from(t.trackerCheckins)
    .where(and(eq(t.trackerCheckins.goalId, g.id), eq(t.trackerCheckins.localDate, date)))
    .limit(1);
  if (!row) throw new NotFoundError('Check-in');
  if (row.count > 1) {
    await db.update(t.trackerCheckins).set({ count: row.count - 1, updatedAt: new Date() }).where(eq(t.trackerCheckins.id, row.id));
    return { date, count: row.count - 1 };
  }
  await db.delete(t.trackerCheckins).where(eq(t.trackerCheckins.id, row.id));
  const [paid] = await db
    .select({ amount: t.xpEvents.amount })
    .from(t.xpEvents)
    .where(and(eq(t.xpEvents.userId, ctx.userId), eq(t.xpEvents.idempotencyKey, `checkin:${g.id}:${date}`)))
    .limit(1);
  if (paid) {
    await awardXp(db, {
      userId: ctx.userId,
      institutionId: ctx.institutionId,
      amount: -paid.amount,
      source: 'REVERSAL',
      verified: false,
      reason: `Check-in removed: ${g.title}`,
      refId: g.id,
      key: `reversal:checkin:${g.id}:${date}`,
      localDate: date,
    });
  }
  return { date, count: 0 };
}

/* ---------------------------------- steps --------------------------------- */

export async function addStep(ctx: AuthContext, goalId: string, title: string) {
  requireTracker(ctx);
  const g = await ownGoal(ctx, goalId);
  if (g.status === 'COMPLETED') throw new ConflictError('This goal is already complete.');
  const [{ n }] = (await db.select({ n: count() }).from(t.trackerGoalSteps).where(eq(t.trackerGoalSteps.goalId, g.id))) as [{ n: number }];
  if (Number(n) >= 30) throw new ConflictError('A goal can have up to 30 steps.');
  const [row] = await db
    .insert(t.trackerGoalSteps)
    .values({ institutionId: ctx.institutionId, userId: ctx.userId, goalId: g.id, title: title.trim(), position: Number(n) })
    .returning({ id: t.trackerGoalSteps.id });
  return { id: row!.id };
}

export async function setStepDone(ctx: AuthContext, stepId: string, done: boolean) {
  requireTracker(ctx);
  const rows = await db
    .update(t.trackerGoalSteps)
    .set({ doneAt: done ? new Date() : null })
    .where(and(eq(t.trackerGoalSteps.id, stepId), eq(t.trackerGoalSteps.userId, ctx.userId)))
    .returning({ id: t.trackerGoalSteps.id });
  if (!rows.length) throw new NotFoundError('Step');
  return { id: stepId, done };
}

export async function deleteStep(ctx: AuthContext, stepId: string) {
  requireTracker(ctx);
  const rows = await db
    .delete(t.trackerGoalSteps)
    .where(and(eq(t.trackerGoalSteps.id, stepId), eq(t.trackerGoalSteps.userId, ctx.userId)))
    .returning({ id: t.trackerGoalSteps.id });
  if (!rows.length) throw new NotFoundError('Step');
  return { deleted: true };
}

/* ---------------------------------- tasks --------------------------------- */

export async function createTask(ctx: AuthContext, input: { title: string; dueDate?: string | null; goalId?: string | null }) {
  requireTracker(ctx);
  await enforceRateLimit(keyFor('tracker:task', ctx.userId), { limit: 200, windowSec: 86_400 }, 'That’s a lot of tasks for one day. Try again tomorrow.');
  const [{ n }] = (await db
    .select({ n: count() })
    .from(t.trackerTasks)
    .where(and(eq(t.trackerTasks.userId, ctx.userId), isNull(t.trackerTasks.doneAt)))) as [{ n: number }];
  if (Number(n) >= MAX_OPEN_TASKS) throw new ConflictError(`You have ${MAX_OPEN_TASKS} open tasks. Finish or delete some first.`);
  if (input.goalId) await ownGoal(ctx, input.goalId);
  const [row] = await db
    .insert(t.trackerTasks)
    .values({ institutionId: ctx.institutionId, userId: ctx.userId, title: input.title.trim(), dueDate: input.dueDate ?? null, goalId: input.goalId ?? null })
    .returning({ id: t.trackerTasks.id });
  return { id: row!.id };
}

export async function updateTask(ctx: AuthContext, taskId: string, input: { title?: string; dueDate?: string | null; done?: boolean }) {
  requireTracker(ctx);
  const rows = await db
    .update(t.trackerTasks)
    .set({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.done !== undefined ? { doneAt: input.done ? new Date() : null } : {}),
    })
    .where(and(eq(t.trackerTasks.id, taskId), eq(t.trackerTasks.userId, ctx.userId)))
    .returning({ id: t.trackerTasks.id });
  if (!rows.length) throw new NotFoundError('Task');
  if (input.done && gamificationOn(ctx.featureFlags)) {
    const info = await institutionInfo(ctx.institutionId);
    await refreshProgress(ctx.userId, ctx.institutionId, info.timeZone);
  }
  return { id: taskId };
}

export async function deleteTask(ctx: AuthContext, taskId: string) {
  requireTracker(ctx);
  const rows = await db
    .delete(t.trackerTasks)
    .where(and(eq(t.trackerTasks.id, taskId), eq(t.trackerTasks.userId, ctx.userId)))
    .returning({ id: t.trackerTasks.id });
  if (!rows.length) throw new NotFoundError('Task');
  return { deleted: true };
}

/* -------------------------------- read models ----------------------------- */

export async function getTrackerOverview(ctx: AuthContext) {
  requireTracker(ctx);
  const { today } = await todayFor(ctx);
  const goals = await db
    .select()
    .from(t.trackerGoals)
    .where(and(eq(t.trackerGoals.userId, ctx.userId), ne(t.trackerGoals.status, 'ARCHIVED')))
    .orderBy(asc(t.trackerGoals.status), desc(t.trackerGoals.createdAt));
  const ids = goals.map((g) => g.id);
  const since = addDays(today, -400);
  const [checkins, steps, tasks] = await Promise.all([
    ids.length
      ? db
          .select({ goalId: t.trackerCheckins.goalId, date: t.trackerCheckins.localDate, count: t.trackerCheckins.count, amount: t.trackerCheckins.amount })
          .from(t.trackerCheckins)
          .where(and(eq(t.trackerCheckins.userId, ctx.userId), inArray(t.trackerCheckins.goalId, ids), sql`${t.trackerCheckins.localDate} >= ${since}`))
      : Promise.resolve([] as { goalId: string; date: string; count: number; amount: number | null }[]),
    ids.length
      ? db.select().from(t.trackerGoalSteps).where(and(eq(t.trackerGoalSteps.userId, ctx.userId), inArray(t.trackerGoalSteps.goalId, ids))).orderBy(asc(t.trackerGoalSteps.position))
      : Promise.resolve([] as (typeof t.trackerGoalSteps.$inferSelect)[]),
    db
      .select()
      .from(t.trackerTasks)
      .where(
        and(
          eq(t.trackerTasks.userId, ctx.userId),
          or(isNull(t.trackerTasks.doneAt), sql`${t.trackerTasks.doneAt} > now() - interval '7 days'`),
        ),
      )
      .orderBy(sql`${t.trackerTasks.doneAt} IS NOT NULL`, sql`${t.trackerTasks.dueDate} ASC NULLS LAST`, desc(t.trackerTasks.createdAt))
      .limit(200),
  ]);

  const goalViews = goals.map((g) => {
    const mine = checkins.filter((c) => c.goalId === g.id);
    const gsteps = steps.filter((s) => s.goalId === g.id);
    return {
      id: g.id,
      title: g.title,
      description: g.description,
      category: g.category as GoalCategory,
      cadence: g.cadence as Cadence,
      targetPerPeriod: g.targetPerPeriod,
      unit: g.unit,
      status: g.status as 'ACTIVE' | 'PAUSED' | 'COMPLETED',
      startDate: g.startDate,
      targetDate: g.targetDate,
      completedAt: g.completedAt,
      state: goalState({ cadence: g.cadence as Cadence, targetPerPeriod: g.targetPerPeriod }, mine, today),
      rate30: completionRate({ cadence: g.cadence as Cadence, targetPerPeriod: g.targetPerPeriod, startDate: g.startDate }, mine, today),
      heatmap: heatmap(mine, today, 35),
      totalAmount: mine.reduce((s, c) => s + (c.amount ?? 0), 0),
      steps: gsteps.map((s) => ({ id: s.id, title: s.title, done: !!s.doneAt })),
    };
  });

  const active = goalViews.filter((g) => g.status === 'ACTIVE');
  const weekFrom = addDays(today, -6);
  return {
    today,
    goals: goalViews,
    tasks: tasks.map((x) => ({ id: x.id, title: x.title, dueDate: x.dueDate, done: !!x.doneAt, goalId: x.goalId, overdue: !x.doneAt && !!x.dueDate && x.dueDate < today })),
    heatmap: heatmap(checkins, today, 35),
    summary: {
      activeGoals: active.length,
      dueToday: active.filter((g) => g.cadence === 'DAILY' && !g.state.period.met).length,
      checkinsThisWeek: checkins.filter((c) => c.date >= weekFrom).reduce((s, c) => s + c.count, 0),
      bestCurrentStreak: active.reduce((m, g) => Math.max(m, g.state.current), 0),
      openTasks: tasks.filter((x) => !x.doneAt).length,
    },
  };
}

/** For "Your Day": today's open tasks and habits not yet checked in. */
export async function trackerForToday(ctx: AuthContext) {
  if (!isEnabled(ctx.featureFlags, 'personal_tracker_enabled')) return { tasks: [], goals: [] };
  const o = await getTrackerOverview(ctx);
  return {
    tasks: o.tasks.filter((x) => !x.done && (!x.dueDate || x.dueDate <= o.today)).slice(0, 5).map((x) => ({ id: x.id, title: x.title, dueDate: x.dueDate, href: '/student/tracker#tasks' })),
    goals: o.goals
      .filter((g) => g.status === 'ACTIVE' && g.cadence === 'DAILY')
      .map((g) => ({ id: g.id, title: g.title, streak: g.state.current, doneToday: g.state.period.met, href: `/student/tracker/${g.id}` })),
  };
}

/* ------------------------------ privacy hooks ----------------------------- */

const SELF_REPORTED_SOURCES = ['GOAL_CHECKIN', 'GOAL_COMPLETED', 'STREAK_MILESTONE', 'CHALLENGE_COMPLETED', 'REVERSAL'];
const SELF_REPORTED_BADGES = ACHIEVEMENTS.filter((a) => !a.verified).map((a) => a.code);

/**
 * Erase a student's tracker and everything derived from it (self-reported XP
 * and badges). Verified XP — from event check-ins and certificates — belongs
 * to the event record and is kept unless the whole account is deleted.
 */
export async function eraseTrackerData(tx: typeof db, ctx: Pick<AuthContext, 'userId'>, opts: { includeVerified?: boolean } = {}): Promise<number> {
  const uid = ctx.userId;
  let removed = 0;
  removed += (await tx.delete(t.trackerTasks).where(eq(t.trackerTasks.userId, uid)).returning({ id: t.trackerTasks.id })).length;
  removed += (await tx.delete(t.trackerCheckins).where(eq(t.trackerCheckins.userId, uid)).returning({ id: t.trackerCheckins.id })).length;
  removed += (await tx.delete(t.trackerGoalSteps).where(eq(t.trackerGoalSteps.userId, uid)).returning({ id: t.trackerGoalSteps.id })).length;
  removed += (await tx.delete(t.trackerGoals).where(eq(t.trackerGoals.userId, uid)).returning({ id: t.trackerGoals.id })).length;
  removed += (
    await tx
      .delete(t.xpEvents)
      .where(and(eq(t.xpEvents.userId, uid), opts.includeVerified ? sql`true` : inArray(t.xpEvents.source, SELF_REPORTED_SOURCES)))
      .returning({ id: t.xpEvents.id })
  ).length;
  removed += (
    await tx
      .delete(t.userAchievements)
      .where(and(eq(t.userAchievements.userId, uid), opts.includeVerified ? sql`true` : inArray(t.userAchievements.code, SELF_REPORTED_BADGES)))
      .returning({ id: t.userAchievements.id })
  ).length;
  return removed;
}

/** Everything the tracker and XP ledger hold about a student, for the data export. */
export async function exportTrackerData(userId: string) {
  const [goals, steps, checkins, tasks, xp, badges] = await Promise.all([
    db.select().from(t.trackerGoals).where(eq(t.trackerGoals.userId, userId)),
    db.select({ goalId: t.trackerGoalSteps.goalId, title: t.trackerGoalSteps.title, doneAt: t.trackerGoalSteps.doneAt }).from(t.trackerGoalSteps).where(eq(t.trackerGoalSteps.userId, userId)),
    db
      .select({ goalId: t.trackerCheckins.goalId, date: t.trackerCheckins.localDate, count: t.trackerCheckins.count, amount: t.trackerCheckins.amount, note: t.trackerCheckins.note })
      .from(t.trackerCheckins)
      .where(eq(t.trackerCheckins.userId, userId)),
    db.select({ title: t.trackerTasks.title, dueDate: t.trackerTasks.dueDate, doneAt: t.trackerTasks.doneAt, createdAt: t.trackerTasks.createdAt }).from(t.trackerTasks).where(eq(t.trackerTasks.userId, userId)),
    db
      .select({ amount: t.xpEvents.amount, source: t.xpEvents.source, verified: t.xpEvents.verified, reason: t.xpEvents.reason, date: t.xpEvents.localDate })
      .from(t.xpEvents)
      .where(eq(t.xpEvents.userId, userId)),
    db.select({ code: t.userAchievements.code, earnedAt: t.userAchievements.earnedAt }).from(t.userAchievements).where(eq(t.userAchievements.userId, userId)),
  ]);
  return {
    goals: goals.map((g) => ({ id: g.id, title: g.title, description: g.description, category: g.category, cadence: g.cadence, target: g.targetPerPeriod, unit: g.unit, status: g.status, startDate: g.startDate, targetDate: g.targetDate, completedAt: g.completedAt })),
    steps,
    checkins,
    tasks,
    xpLedger: xp,
    achievements: badges,
  };
}
