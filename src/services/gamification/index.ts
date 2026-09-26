import 'server-only';
import { cache } from 'react';
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import {
  ACHIEVEMENTS,
  addDays,
  earnedAchievements,
  levelFor,
  localDate,
  statValue,
  weekStart,
  WEEKLY_CHALLENGES,
  XP,
  type ProgressStats,
  type WeekStats,
  type XpSource,
} from '@/lib/gamification';
import { goalState, type Cadence } from '@/lib/tracker';
import { leaderboardIdentity, type PrivacyPrefs } from '@/services/privacy/rules';

/**
 * GAMIFICATION SERVICE
 * ---------------------------------------------------------------------------
 * Rules live in src/lib/gamification.ts. This file reads real records and
 * writes the append-only ledger. Every award is idempotent: the unique
 * (user_id, idempotency_key) index makes a retried request, a double scan or a
 * re-run a no-op, so nobody can be paid twice for one thing.
 */

type Exec = Pick<typeof db, 'insert' | 'select' | 'execute'>;

export interface Award {
  userId: string;
  institutionId: string;
  amount: number;
  source: XpSource;
  verified: boolean;
  reason: string;
  refId?: string | null;
  key: string;
  localDate: string;
}

/** Returns true if this award was new. */
export async function awardXp(exec: Exec, a: Award): Promise<boolean> {
  const rows = await exec
    .insert(t.xpEvents)
    .values({
      institutionId: a.institutionId,
      userId: a.userId,
      amount: a.amount,
      source: a.source,
      verified: a.verified,
      reason: a.reason.slice(0, 200),
      refId: a.refId ?? null,
      idempotencyKey: a.key,
      localDate: a.localDate,
    })
    .onConflictDoNothing()
    .returning({ id: t.xpEvents.id });
  return rows.length > 0;
}

export async function institutionInfo(institutionId: string): Promise<{ timeZone: string; flags: Record<string, boolean> }> {
  const [row] = await db
    .select({ tz: t.institutions.timezone, flags: t.institutions.featureFlags })
    .from(t.institutions)
    .where(eq(t.institutions.id, institutionId))
    .limit(1);
  return { timeZone: row?.tz ?? 'Asia/Kolkata', flags: (row?.flags as Record<string, boolean> | null) ?? {} };
}

export function gamificationOn(flags: Record<string, boolean> | undefined | null): boolean {
  return isEnabled(flags ?? {}, 'gamification_enabled');
}

/* ------------------------------ verified XP ------------------------------- */

/**
 * An organiser checked this student in (called from events/organizer#checkIn).
 * The student's own college decides whether gamification is on for them.
 */
export async function onEventAttended(userId: string, eventId: string): Promise<void> {
  const [u] = await db.select({ inst: t.users.institutionId }).from(t.users).where(eq(t.users.id, userId)).limit(1);
  if (!u) return;
  const info = await institutionInfo(u.inst);
  if (!gamificationOn(info.flags)) return;
  const [ev] = await db.select({ title: t.events.title }).from(t.events).where(eq(t.events.id, eventId)).limit(1);
  const today = localDate(new Date(), info.timeZone);
  await awardXp(db, {
    userId,
    institutionId: u.inst,
    amount: XP.EVENT_ATTENDED,
    source: 'EVENT_ATTENDED',
    verified: true,
    reason: `Checked in: ${ev?.title ?? 'event'}`,
    refId: eventId,
    key: `event:${eventId}`,
    localDate: today,
  });
  await refreshProgress(userId, u.inst, info.timeZone);
}

/** A certificate was issued to this student (called from events/organizer#issueCertificates). */
export async function onCertificateIssued(userId: string, certificateId: string, eventTitle: string): Promise<void> {
  const [u] = await db.select({ inst: t.users.institutionId }).from(t.users).where(eq(t.users.id, userId)).limit(1);
  if (!u) return;
  const info = await institutionInfo(u.inst);
  if (!gamificationOn(info.flags)) return;
  await awardXp(db, {
    userId,
    institutionId: u.inst,
    amount: XP.CERTIFICATE_EARNED,
    source: 'CERTIFICATE_EARNED',
    verified: true,
    reason: `Certificate: ${eventTitle}`,
    refId: certificateId,
    key: `cert:${certificateId}`,
    localDate: localDate(new Date(), info.timeZone),
  });
  await refreshProgress(userId, u.inst, info.timeZone);
}

/* --------------------------------- stats ---------------------------------- */

async function bestStreakOf(userId: string, today: string): Promise<number> {
  const goals = await db
    .select({ id: t.trackerGoals.id, cadence: t.trackerGoals.cadence, target: t.trackerGoals.targetPerPeriod })
    .from(t.trackerGoals)
    .where(and(eq(t.trackerGoals.userId, userId), ne(t.trackerGoals.cadence, 'ONCE')));
  if (!goals.length) return 0;
  const rows = await db
    .select({ goalId: t.trackerCheckins.goalId, date: t.trackerCheckins.localDate, count: t.trackerCheckins.count })
    .from(t.trackerCheckins)
    .where(eq(t.trackerCheckins.userId, userId));
  let best = 0;
  for (const g of goals) {
    const s = goalState(
      { cadence: g.cadence as Cadence, targetPerPeriod: g.target },
      rows.filter((r) => r.goalId === g.id),
      today,
    );
    best = Math.max(best, s.best);
  }
  return best;
}

export async function progressStats(userId: string, today: string): Promise<ProgressStats> {
  const [xp] = await db.select({ total: sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int` }).from(t.xpEvents).where(eq(t.xpEvents.userId, userId));
  const [days] = await db.select({ n: sql<number>`count(distinct ${t.trackerCheckins.localDate})::int` }).from(t.trackerCheckins).where(eq(t.trackerCheckins.userId, userId));
  const [goals] = await db.select({ n: count() }).from(t.trackerGoals).where(and(eq(t.trackerGoals.userId, userId), eq(t.trackerGoals.status, 'COMPLETED')));
  const [tasks] = await db.select({ n: count() }).from(t.trackerTasks).where(and(eq(t.trackerTasks.userId, userId), isNotNull(t.trackerTasks.doneAt)));
  const [events] = await db
    .select({ n: count() })
    .from(t.eventCheckins)
    .innerJoin(t.eventRegistrations, eq(t.eventRegistrations.id, t.eventCheckins.registrationId))
    .where(eq(t.eventRegistrations.userId, userId));
  const [certs] = await db
    .select({ n: count() })
    .from(t.eventCertificates)
    .where(and(eq(t.eventCertificates.userId, userId), isNull(t.eventCertificates.revokedAt)));
  return {
    totalXp: Number(xp?.total ?? 0),
    checkinDays: Number(days?.n ?? 0),
    bestStreak: await bestStreakOf(userId, today),
    goalsCompleted: Number(goals?.n ?? 0),
    tasksDone: Number(tasks?.n ?? 0),
    eventsAttended: Number(events?.n ?? 0),
    certificates: Number(certs?.n ?? 0),
  };
}

export async function weekStats(userId: string, timeZone: string, today: string): Promise<WeekStats> {
  const from = weekStart(today);
  const to = addDays(from, 7);
  const [days] = await db
    .select({ n: sql<number>`count(distinct ${t.trackerCheckins.localDate})::int` })
    .from(t.trackerCheckins)
    .where(and(eq(t.trackerCheckins.userId, userId), gte(t.trackerCheckins.localDate, from), lt(t.trackerCheckins.localDate, to)));
  // Tasks and event check-ins are instants; compare in the college's timezone.
  const inWeek = (col: unknown) => sql`(${col} AT TIME ZONE ${timeZone})::date >= ${from}::date AND (${col} AT TIME ZONE ${timeZone})::date < ${to}::date`;
  const [tasks] = await db
    .select({ n: count() })
    .from(t.trackerTasks)
    .where(and(eq(t.trackerTasks.userId, userId), isNotNull(t.trackerTasks.doneAt), inWeek(t.trackerTasks.doneAt)));
  const [events] = await db
    .select({ n: count() })
    .from(t.eventCheckins)
    .innerJoin(t.eventRegistrations, eq(t.eventRegistrations.id, t.eventCheckins.registrationId))
    .where(and(eq(t.eventRegistrations.userId, userId), inWeek(t.eventCheckins.createdAt)));
  return { checkinDays: Number(days?.n ?? 0), tasksDone: Number(tasks?.n ?? 0), eventsAttended: Number(events?.n ?? 0) };
}

/**
 * Award any weekly challenges now met, and any badges now earned. Idempotent;
 * safe to call after every activity. Returns what was newly earned.
 */
export async function refreshProgress(userId: string, institutionId: string, timeZone: string): Promise<{ challenges: string[]; achievements: string[] }> {
  const today = localDate(new Date(), timeZone);
  const week = weekStart(today);
  const ws = await weekStats(userId, timeZone, today);
  const challenges: string[] = [];
  for (const c of WEEKLY_CHALLENGES) {
    if (ws[c.stat] < c.target) continue;
    const fresh = await awardXp(db, {
      userId,
      institutionId,
      amount: c.xp,
      source: 'CHALLENGE_COMPLETED',
      verified: false,
      reason: `Weekly challenge: ${c.title}`,
      key: `challenge:${c.code}:${week}`,
      localDate: today,
    });
    if (fresh) challenges.push(c.code);
  }

  const stats = await progressStats(userId, today);
  const codes = earnedAchievements(stats);
  const achievements: string[] = [];
  if (codes.length) {
    const rows = await db
      .insert(t.userAchievements)
      .values(codes.map((code) => ({ institutionId, userId, code })))
      .onConflictDoNothing()
      .returning({ code: t.userAchievements.code });
    achievements.push(...rows.map((r) => r.code));
  }
  if (achievements.length) {
    await db.insert(t.notifications).values(
      achievements.map((code) => ({
        institutionId,
        userId,
        title: `Badge earned: ${ACHIEVEMENTS.find((a) => a.code === code)?.title ?? code}`,
        body: ACHIEVEMENTS.find((a) => a.code === code)?.description ?? null,
        priority: 'NORMAL' as const,
        category: 'GENERAL' as const,
        actionUrl: '/student/progress',
        groupKey: 'gamification',
        sourceType: 'achievement',
        sourceId: null,
      })),
    );
  }
  return { challenges, achievements };
}

/* ------------------------------- read models ------------------------------ */

/** Level from the XP ledger. Memoised per request (shell + dashboard both ask). */
export const levelOf = cache(async (userId: string): Promise<ReturnType<typeof levelFor> & { totalXp: number }> => {
  const [xp] = await db.select({ total: sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int` }).from(t.xpEvents).where(eq(t.xpEvents.userId, userId));
  const totalXp = Number(xp?.total ?? 0);
  return { ...levelFor(totalXp), totalXp };
});

export async function getProgress(ctx: AuthContext) {
  // Read-only: awards happen on the activity that earns them (check-in, task,
  // event attendance, certificate), never as a side effect of viewing this page.
  const info = await institutionInfo(ctx.institutionId);
  const today = localDate(new Date(), info.timeZone);
  const [stats, ws, earned, ledger, verified] = await Promise.all([
    progressStats(ctx.userId, today),
    weekStats(ctx.userId, info.timeZone, today),
    db.select({ code: t.userAchievements.code, earnedAt: t.userAchievements.earnedAt }).from(t.userAchievements).where(eq(t.userAchievements.userId, ctx.userId)),
    db
      .select({ id: t.xpEvents.id, amount: t.xpEvents.amount, source: t.xpEvents.source, reason: t.xpEvents.reason, verified: t.xpEvents.verified, createdAt: t.xpEvents.createdAt })
      .from(t.xpEvents)
      .where(eq(t.xpEvents.userId, ctx.userId))
      .orderBy(desc(t.xpEvents.createdAt))
      .limit(25),
    db
      .select({ total: sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int` })
      .from(t.xpEvents)
      .where(and(eq(t.xpEvents.userId, ctx.userId), eq(t.xpEvents.verified, true))),
  ]);
  const earnedAt = new Map(earned.map((e) => [e.code, e.earnedAt]));
  const week = weekStart(today);
  const claimed = await db
    .select({ key: t.xpEvents.idempotencyKey })
    .from(t.xpEvents)
    .where(and(eq(t.xpEvents.userId, ctx.userId), inArray(t.xpEvents.idempotencyKey, WEEKLY_CHALLENGES.map((c) => `challenge:${c.code}:${week}`))));
  const claimedSet = new Set(claimed.map((c) => c.key));
  return {
    today,
    weekStart: week,
    level: levelFor(stats.totalXp),
    totalXp: stats.totalXp,
    verifiedXp: Number(verified[0]?.total ?? 0),
    stats,
    achievements: ACHIEVEMENTS.map((a) => ({
      ...a,
      earnedAt: earnedAt.get(a.code) ?? null,
      progress: Math.min(statValue(stats, a.stat), a.target),
    })),
    challenges: WEEKLY_CHALLENGES.map((c) => ({ ...c, progress: Math.min(ws[c.stat], c.target), done: claimedSet.has(`challenge:${c.code}:${week}`) })),
    ledger,
  };
}

/* ------------------------------- leaderboard ------------------------------ */

export type BoardScope = 'college' | 'section';
export type BoardPeriod = 'week' | 'month' | 'all';

/**
 * Opt-in leaderboard of VERIFIED XP only (events attended, certificates).
 * Who is ranked (services/privacy/rules#leaderboardIdentity):
 *   · PUBLIC → by name; ANONYMOUS → a stable pseudonym;
 *   · PRIVATE (the default) → only the student themself sees where they would
 *     place — they are never shown to, or counted for, anyone else;
 *   · OPT_OUT → not ranked at all, not even for themself.
 * Scoped to the viewer's own college, or their own section; both always come
 * from the session.
 */
export async function getLeaderboard(ctx: AuthContext, scope: BoardScope, period: BoardPeriod) {
  const info = await institutionInfo(ctx.institutionId);
  const today = localDate(new Date(), info.timeZone);
  const from = period === 'week' ? weekStart(today) : period === 'month' ? addDays(today, -29) : null;

  const [mine] = await db
    .select({ vis: t.privacyPreferences.leaderboardVisibility })
    .from(t.privacyPreferences)
    .where(eq(t.privacyPreferences.userId, ctx.userId))
    .limit(1);
  const myVisibility = mine?.vis ?? 'PRIVATE';

  if (scope === 'section' && !ctx.sectionId) return { rows: [], me: null, myVisibility, scope, period, sectionless: true, total: 0 };

  const vis = sql<string>`coalesce(${t.privacyPreferences.leaderboardVisibility}::text, 'PRIVATE')`;
  const conds = [
    eq(t.xpEvents.institutionId, ctx.institutionId),
    eq(t.xpEvents.verified, true),
    eq(t.users.status, 'ACTIVE'),
    isNull(t.users.deletedAt),
    // Others only if they opted in; the viewer unless they opted out.
    myVisibility === 'OPT_OUT'
      ? sql`${vis} IN ('PUBLIC', 'ANONYMOUS') AND ${t.xpEvents.userId} <> ${ctx.userId}`
      : sql`(${vis} IN ('PUBLIC', 'ANONYMOUS') OR ${t.xpEvents.userId} = ${ctx.userId})`,
  ];
  if (from) conds.push(gte(t.xpEvents.localDate, from));
  if (scope === 'section') conds.push(eq(t.studentProfiles.sectionId, ctx.sectionId!));

  const total = sql<number>`sum(${t.xpEvents.amount})::int`;
  const rows = await db
    .select({ userId: t.xpEvents.userId, xp: total, visibility: vis, first: t.users.firstName, last: t.users.lastName })
    .from(t.xpEvents)
    .innerJoin(t.users, eq(t.users.id, t.xpEvents.userId))
    .innerJoin(t.studentProfiles, eq(t.studentProfiles.userId, t.xpEvents.userId))
    .leftJoin(t.privacyPreferences, eq(t.privacyPreferences.userId, t.xpEvents.userId))
    .where(and(...conds))
    .groupBy(t.xpEvents.userId, t.privacyPreferences.leaderboardVisibility, t.users.firstName, t.users.lastName)
    .having(sql`sum(${t.xpEvents.amount}) > 0`)
    .orderBy(desc(total), t.xpEvents.userId)
    .limit(500);

  // Standard competition ranking (1, 2, 2, 4).
  let rank = 0;
  let prev: number | null = null;
  const ranked = rows.map((r, i) => {
    const xp = Number(r.xp);
    if (xp !== prev) rank = i + 1;
    prev = xp;
    const who = leaderboardIdentity(
      { leaderboardVisibility: r.visibility as PrivacyPrefs['leaderboardVisibility'] },
      { userId: r.userId, displayName: `${r.first} ${r.last.slice(0, 1)}.` },
      ctx.userId,
    );
    // Nobody else's user id ever leaves the server — only the label they chose.
    return { rank, xp, isMe: who.isSelf, name: who.label, anonymous: r.visibility === 'ANONYMOUS' && !who.isSelf };
  });
  const me = ranked.find((r) => r.isMe) ?? null;
  return { rows: ranked.slice(0, 20), me, myVisibility, scope, period, sectionless: false, total: ranked.length };
}
