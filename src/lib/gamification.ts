/**
 * GAMIFICATION RULES (pure — unit-tested, safe to import anywhere)
 * ---------------------------------------------------------------------------
 * Everything here is a function of real records. There is no seeded XP, no
 * sample leaderboard and no badge that can be earned without doing the thing.
 *
 *   · XP comes from an append-only ledger with an idempotency key per award.
 *   · VERIFIED XP = activity CampusOS itself confirmed (an organiser scanned
 *     your pass; a certificate was issued). Only verified XP ranks anyone.
 *   · SELF-REPORTED XP (tracker check-ins, goals, streaks, challenges) counts
 *     towards your own level, is capped per day, and never appears on a board.
 */

export type XpSource =
  | 'EVENT_ATTENDED'
  | 'CERTIFICATE_EARNED'
  | 'GOAL_CHECKIN'
  | 'GOAL_COMPLETED'
  | 'STREAK_MILESTONE'
  | 'CHALLENGE_COMPLETED'
  | 'REVERSAL';

export const XP = {
  EVENT_ATTENDED: 40,
  CERTIFICATE_EARNED: 25,
  GOAL_CHECKIN: 5,
  GOAL_COMPLETED: 30,
} as const;

/** At most this many check-ins earn XP per local day (logging more is fine; it just doesn't pay). */
export const CHECKIN_XP_DAILY_CAP = 3;

/** Streak lengths that award a one-off bonus, per goal. */
export const STREAK_MILESTONES: Record<number, number> = { 7: 20, 30: 60, 100: 150 };

export const SOURCE_LABEL: Record<XpSource, string> = {
  EVENT_ATTENDED: 'Attended an event',
  CERTIFICATE_EARNED: 'Earned a certificate',
  GOAL_CHECKIN: 'Goal check-in',
  GOAL_COMPLETED: 'Completed a goal',
  STREAK_MILESTONE: 'Streak milestone',
  CHALLENGE_COMPLETED: 'Weekly challenge',
  REVERSAL: 'Correction',
};

/* --------------------------------- levels --------------------------------- */

/** Total XP needed to reach `level` (level 1 = 0). 100, 300, 600, 1000, … */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 50 * l * (l - 1);
}

export function levelFor(totalXp: number): { level: number; xpIntoLevel: number; xpForNext: number; nextAt: number } {
  const xp = Math.max(0, Math.floor(totalXp));
  // Solve 50·L·(L−1) ≤ xp for the largest integer L.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  const base = xpForLevel(level);
  const nextAt = xpForLevel(level + 1);
  return { level, xpIntoLevel: xp - base, xpForNext: nextAt - base, nextAt };
}

/* ------------------------------ achievements ------------------------------ */

export interface ProgressStats {
  totalXp: number;
  checkinDays: number;
  bestStreak: number;
  goalsCompleted: number;
  tasksDone: number;
  eventsAttended: number;
  certificates: number;
}

export interface AchievementDef {
  code: string;
  title: string;
  description: string;
  /** Which stat drives it, and the threshold — shown as honest progress. */
  stat: keyof ProgressStats | 'level';
  target: number;
  verified: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'FIRST_CHECKIN', title: 'First step', description: 'Log your first goal check-in.', stat: 'checkinDays', target: 1, verified: false },
  { code: 'STREAK_7', title: 'One full week', description: 'Keep any goal going 7 days (or weeks) in a row.', stat: 'bestStreak', target: 7, verified: false },
  { code: 'STREAK_30', title: 'Thirty strong', description: 'Reach a 30-period streak on a goal.', stat: 'bestStreak', target: 30, verified: false },
  { code: 'GOAL_DONE', title: 'Finisher', description: 'Complete a goal.', stat: 'goalsCompleted', target: 1, verified: false },
  { code: 'TASKS_10', title: 'Getting things done', description: 'Finish 10 tasks.', stat: 'tasksDone', target: 10, verified: false },
  { code: 'EVENT_1', title: 'Showed up', description: 'Get checked in at a campus event.', stat: 'eventsAttended', target: 1, verified: true },
  { code: 'EVENT_5', title: 'Regular', description: 'Get checked in at 5 events.', stat: 'eventsAttended', target: 5, verified: true },
  { code: 'CERT_3', title: 'Certified', description: 'Earn 3 event certificates.', stat: 'certificates', target: 3, verified: true },
  { code: 'LEVEL_5', title: 'Level 5', description: 'Reach level 5.', stat: 'level', target: 5, verified: false },
];

export function statValue(stats: ProgressStats, stat: AchievementDef['stat']): number {
  return stat === 'level' ? levelFor(stats.totalXp).level : stats[stat];
}

/** Codes whose threshold is met by these stats. */
export function earnedAchievements(stats: ProgressStats): string[] {
  return ACHIEVEMENTS.filter((a) => statValue(stats, a.stat) >= a.target).map((a) => a.code);
}

/* ------------------------------- challenges ------------------------------- */

export interface WeekStats {
  checkinDays: number;
  tasksDone: number;
  eventsAttended: number;
}

export interface ChallengeDef {
  code: string;
  title: string;
  stat: keyof WeekStats;
  target: number;
  xp: number;
}

/** The same three every week, measured Monday–Sunday in the college's timezone. */
export const WEEKLY_CHALLENGES: ChallengeDef[] = [
  { code: 'WEEK_CHECKINS_5', title: 'Check in on 5 different days', stat: 'checkinDays', target: 5, xp: 30 },
  { code: 'WEEK_TASKS_5', title: 'Finish 5 tasks', stat: 'tasksDone', target: 5, xp: 20 },
  { code: 'WEEK_EVENT_1', title: 'Get checked in at an event', stat: 'eventsAttended', target: 1, xp: 25 },
];

/* ---------------------------------- dates --------------------------------- */

/** "YYYY-MM-DD" for an instant in a timezone. */
export function localDate(d: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p; // en-CA formats as YYYY-MM-DD
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return addDays(iso, -dow);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
