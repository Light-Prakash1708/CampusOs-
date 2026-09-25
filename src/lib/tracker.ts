/**
 * PERSONAL TRACKER RULES (pure — unit-tested)
 * ---------------------------------------------------------------------------
 * Streaks and period progress from a goal's check-ins. Dates are local
 * calendar dates ("YYYY-MM-DD") in the college's timezone, so a check-in at
 * 00:30 counts for the right day.
 *
 *   DAILY  — a day is "met" when its check-ins reach the goal's per-day target.
 *            The streak is the run of met days ending today; if today isn't
 *            met yet, the run ending yesterday is still alive.
 *   WEEKLY — a week (Mon–Sun) is met when enough different days have a
 *            check-in. Same "still alive" rule for the current week.
 *   ONCE   — a milestone with steps; no streak.
 */

import { addDays, daysBetween, weekStart } from './gamification';

export type Cadence = 'DAILY' | 'WEEKLY' | 'ONCE';

export const GOAL_CATEGORIES = ['STUDY', 'SKILL', 'HEALTH', 'READING', 'CAREER', 'PERSONAL'] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<GoalCategory, string> = {
  STUDY: 'Study',
  SKILL: 'Skill',
  HEALTH: 'Health',
  READING: 'Reading',
  CAREER: 'Career',
  PERSONAL: 'Personal',
};

export interface CheckinDay {
  date: string;
  count: number;
}

export interface GoalState {
  current: number;
  best: number;
  /** Checked in at least once today. */
  checkedToday: boolean;
  /** Today's (DAILY) or this week's (WEEKLY) progress towards the target. */
  period: { done: number; target: number; met: boolean };
}

function longestRun(sortedKeys: string[], step: number): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of sortedKeys) {
    run = prev !== null && daysBetween(prev, k) === step ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

function runEndingAt(met: Set<string>, end: string, step: number): number {
  let n = 0;
  let k = end;
  while (met.has(k)) {
    n++;
    k = addDays(k, -step);
  }
  return n;
}

export function goalState(goal: { cadence: Cadence; targetPerPeriod: number }, checkins: CheckinDay[], today: string): GoalState {
  const target = Math.max(1, goal.targetPerPeriod);
  const todayCount = checkins.find((c) => c.date === today)?.count ?? 0;

  if (goal.cadence === 'ONCE') {
    return { current: 0, best: 0, checkedToday: todayCount > 0, period: { done: todayCount, target: 1, met: todayCount > 0 } };
  }

  if (goal.cadence === 'DAILY') {
    const met = new Set(checkins.filter((c) => c.count >= target && c.date <= today).map((c) => c.date));
    const current = met.has(today) ? runEndingAt(met, today, 1) : runEndingAt(met, addDays(today, -1), 1);
    return {
      current,
      best: Math.max(current, longestRun([...met].sort(), 1)),
      checkedToday: todayCount > 0,
      period: { done: Math.min(todayCount, target), target, met: todayCount >= target },
    };
  }

  // WEEKLY: distinct days with a check-in, per Monday-start week.
  const perWeek = new Map<string, number>();
  for (const c of checkins) {
    if (c.count < 1 || c.date > today) continue;
    const w = weekStart(c.date);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const met = new Set([...perWeek].filter(([, n]) => n >= target).map(([w]) => w));
  const thisWeek = weekStart(today);
  const current = met.has(thisWeek) ? runEndingAt(met, thisWeek, 7) : runEndingAt(met, addDays(thisWeek, -7), 7);
  const done = perWeek.get(thisWeek) ?? 0;
  return {
    current,
    best: Math.max(current, longestRun([...met].sort(), 7)),
    checkedToday: todayCount > 0,
    period: { done: Math.min(done, target), target, met: done >= target },
  };
}

/** Last `days` local dates (oldest first) with the total check-ins on each. */
export function heatmap(checkins: CheckinDay[], today: string, days = 35): CheckinDay[] {
  const byDate = new Map<string, number>();
  for (const c of checkins) byDate.set(c.date, (byDate.get(c.date) ?? 0) + c.count);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - days + 1);
    return { date, count: byDate.get(date) ?? 0 };
  });
}

/** Share of scheduled periods met in the last `days` (DAILY/WEEKLY), for a completion rate. */
export function completionRate(goal: { cadence: Cadence; targetPerPeriod: number; startDate: string }, checkins: CheckinDay[], today: string, days = 30): number | null {
  if (goal.cadence === 'ONCE') return null;
  const from = goal.startDate > addDays(today, -days + 1) ? goal.startDate : addDays(today, -days + 1);
  if (from > today) return null;
  const target = Math.max(1, goal.targetPerPeriod);
  if (goal.cadence === 'DAILY') {
    const span = daysBetween(from, today) + 1;
    const met = checkins.filter((c) => c.date >= from && c.date <= today && c.count >= target).length;
    return Math.round((met / span) * 100);
  }
  const weeks: string[] = [];
  for (let w = weekStart(from); w <= today; w = addDays(w, 7)) weeks.push(w);
  const perWeek = new Map<string, number>();
  for (const c of checkins) if (c.date >= from && c.date <= today && c.count > 0) perWeek.set(weekStart(c.date), (perWeek.get(weekStart(c.date)) ?? 0) + 1);
  // The current week only counts once it's met — an unfinished week isn't a miss yet.
  const judged = weeks.filter((w) => w !== weekStart(today) || (perWeek.get(w) ?? 0) >= target);
  if (!judged.length) return null;
  return Math.round((judged.filter((w) => (perWeek.get(w) ?? 0) >= target).length / judged.length) * 100);
}
