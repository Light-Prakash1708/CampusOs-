/**
 * ATTENDANCE PLANNER — the maths, in one pure module.
 * ---------------------------------------------------------------------------
 * Shared by the server (pages, API, advisor), the client (the interactive
 * planner) and the tests, so a number shown anywhere is computed one way.
 *
 * Counting rules are the institution's rollup rules (see
 * services/attendance/rollup.ts), applied before anything reaches here:
 *   held     = PRESENT + ABSENT + LATE + MEDICAL   (EXCUSED is not held)
 *   attended = PRESENT + LATE
 *
 * Exactness. Percentages are compared in integers — a target of 75.5% is
 * 7550 basis points and "at or above target" means
 *     attended × 10000 ≥ targetBp × held
 * so no floating-point rounding can decide whether someone is above the line.
 * Displayed percentages are rounded only at the very end.
 */

export interface Tally {
  held: number;
  attended: number;
}

export const BP = 10_000;

/** 75 → 7500, 75.5 → 7550, clamped to 1..10000 (a 0% target is meaningless). */
export function toBp(percent: number): number {
  if (!Number.isFinite(percent)) return 7500;
  return Math.max(1, Math.min(BP, Math.round(percent * 100)));
}

function clean(t: Tally): Tally {
  const held = Math.max(0, Math.floor(t.held));
  const attended = Math.max(0, Math.min(held, Math.floor(t.attended)));
  return { held, attended };
}

/** Attendance in basis points, or null when no class has been held. */
export function percentBp(t: Tally): number | null {
  const { held, attended } = clean(t);
  if (held === 0) return null;
  return Math.round((attended * BP) / held);
}

/** "75.0%" style. Null → "—". */
export function formatPct(bp: number | null, digits = 1): string {
  if (bp === null) return '—';
  return `${(bp / 100).toFixed(digits)}%`;
}

export function missed(t: Tally): number {
  const c = clean(t);
  return c.held - c.attended;
}

export function meetsTarget(t: Tally, targetPct: number): boolean {
  const { held, attended } = clean(t);
  return attended * BP >= toBp(targetPct) * held;
}

/**
 * Most further absences that keep attendance at or above the target:
 * the largest k with  attended × 10000 ≥ targetBp × (held + k).
 * Zero when already below target (there is no "safe" absence then).
 */
export function safeAbsences(t: Tally, targetPct: number): number {
  const { held, attended } = clean(t);
  const tbp = toBp(targetPct);
  const slack = attended * BP - tbp * held;
  if (slack <= 0) return 0;
  return Math.floor(slack / tbp);
}

/**
 * Fewest consecutive classes to attend to reach the target: the smallest
 * x ≥ 0 with (attended + x) × 10000 ≥ targetBp × (held + x).
 * Null when impossible — only when the target is 100% and a class has
 * already been missed (every future class still leaves that absence).
 */
export function classesToReach(t: Tally, targetPct: number): number | null {
  const { held, attended } = clean(t);
  const tbp = toBp(targetPct);
  const deficit = tbp * held - attended * BP;
  if (deficit <= 0) return 0;
  if (tbp >= BP) return null;
  return Math.ceil(deficit / (BP - tbp));
}

/** Tally after attending `attend` and missing `miss` more classes. */
export function project(t: Tally, change: { attend?: number; miss?: number }): Tally {
  const c = clean(t);
  const a = Math.max(0, Math.floor(change.attend ?? 0));
  const m = Math.max(0, Math.floor(change.miss ?? 0));
  return { held: c.held + a + m, attended: c.attended + a };
}

export interface SimulationRow {
  n: number;
  tally: Tally;
  percentBp: number | null;
  meetsTarget: boolean;
}

/** "What if I miss 1/2/3… classes?" (or attend, with kind = 'attend'). */
export function simulate(t: Tally, kind: 'miss' | 'attend', counts: number[], targetPct: number): SimulationRow[] {
  return counts.map((n) => {
    const tally = project(t, kind === 'miss' ? { miss: n } : { attend: n });
    return { n, tally, percentBp: percentBp(tally), meetsTarget: meetsTarget(tally, targetPct) };
  });
}

/** Best possible percentage by term end: attend every remaining class. */
export function bestCase(t: Tally, remaining: number): number | null {
  return percentBp(project(t, { attend: remaining }));
}

/**
 * Can the target still be reached this term? Null when the number of
 * remaining classes is unknown (no published timetable / term end date).
 */
export function reachableThisTerm(t: Tally, targetPct: number, remaining: number | null): boolean | null {
  const need = classesToReach(t, targetPct);
  if (need === null) return false;
  if (remaining === null) return null;
  return need <= remaining;
}

/* ------------------------------ risk states ------------------------------ */

export type RiskState =
  /** Nothing marked yet. */
  | 'NO_DATA'
  /** Above the minimum with more than the warning margin to spare. */
  | 'SAFE'
  /** Above the minimum, but within the warning margin of it. */
  | 'WATCH'
  /** At or above the minimum, but the very next absence drops below it. */
  | 'AT_RISK'
  /** Below the minimum; recoverable by attending classes. */
  | 'BELOW'
  /** Below the minimum and cannot reach it even attending every remaining class this term. */
  | 'CRITICAL';

export const RISK_LABEL: Record<RiskState, string> = {
  NO_DATA: 'No classes yet',
  SAFE: 'On track',
  WATCH: 'Close to the line',
  AT_RISK: 'Next absence drops you below',
  BELOW: 'Below minimum',
  CRITICAL: 'Can’t reach minimum this term',
};

/** Severity for sorting (higher = more urgent). */
export const RISK_SEVERITY: Record<RiskState, number> = {
  CRITICAL: 5,
  BELOW: 4,
  AT_RISK: 3,
  WATCH: 2,
  SAFE: 1,
  NO_DATA: 0,
};

export function riskState(t: Tally, minimumPct: number, marginPct: number, remaining: number | null = null): RiskState {
  const c = clean(t);
  if (c.held === 0) return 'NO_DATA';
  if (!meetsTarget(c, minimumPct)) {
    return reachableThisTerm(c, minimumPct, remaining) === false ? 'CRITICAL' : 'BELOW';
  }
  if (safeAbsences(c, minimumPct) === 0) return 'AT_RISK';
  if (marginPct > 0 && !meetsTarget(c, Math.min(100, minimumPct + marginPct))) return 'WATCH';
  return 'SAFE';
}

/* -------------------------------- advisor -------------------------------- */

export interface AdvisorSubject {
  offeringId: string;
  name: string;
  tally: Tally;
  minimumPct: number;
  /** Classes still scheduled this term, from the published timetable; null if unknown. */
  remaining: number | null;
  /** Weekly classes on the timetable (for "about N weeks"); null if unknown. */
  perWeek: number | null;
}

export interface Advice {
  severity: 'critical' | 'warning' | 'info' | 'good';
  state: RiskState | 'AGGREGATE';
  offeringId: string | null;
  title: string;
  body: string;
}

function weeksText(classes: number, perWeek: number | null): string {
  if (!perWeek || perWeek <= 0) return '';
  const weeks = Math.ceil(classes / perWeek);
  return ` — about ${weeks} week${weeks === 1 ? '' : 's'} at your current timetable`;
}

const pct = (bp: number | null) => formatPct(bp, 1);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * "What should I do?" — concrete, ranked, computed from real counts.
 * The advisor never suggests skipping: headroom is described as a buffer for
 * illness and emergencies, and the most urgent subject always comes first.
 */
export function advise(
  subjects: AdvisorSubject[],
  opts: { marginPct: number; aggregateMinimumPct: number | null; limit?: number },
): Advice[] {
  const out: (Advice & { rank: number })[] = [];
  const withData = subjects.filter((s) => clean(s.tally).held > 0);

  for (const s of subjects) {
    const state = riskState(s.tally, s.minimumPct, opts.marginPct, s.remaining);
    const bp = percentBp(s.tally);
    const min = `${s.minimumPct}%`;
    if (state === 'CRITICAL') {
      const best = s.remaining !== null ? bestCase(s.tally, s.remaining) : null;
      out.push({
        rank: 50_000 - (bp ?? 0), // tier 5; lowest % first
        severity: 'critical',
        state,
        offeringId: s.offeringId,
        title: `${s.name} can’t reach ${min} this term`,
        body:
          `You’re at ${pct(bp)}. Even attending all ${plural(s.remaining ?? 0, 'remaining scheduled class', 'remaining scheduled classes')} ` +
          `takes you to ${pct(best)}. Talk to your faculty or HOD now about your college’s attendance rules (medical or condonation provisions), and attend every class meanwhile.`,
      });
    } else if (state === 'BELOW') {
      const need = classesToReach(s.tally, s.minimumPct)!;
      out.push({
        rank: 40_000 + Math.min(need, 9_999), // tier 4; most classes needed first
        severity: 'critical',
        state,
        offeringId: s.offeringId,
        title: `Attend the next ${plural(need, `${s.name} class`, `${s.name} classes`)}`,
        body: `You’re at ${pct(bp)} in ${s.name}. Attending the next ${plural(need, 'class', 'classes')} in a row brings you back to ${min}${weeksText(need, s.perWeek)}.`,
      });
    } else if (state === 'AT_RISK') {
      out.push({
        rank: 30_000, // tier 3
        severity: 'warning',
        state,
        offeringId: s.offeringId,
        title: `Don’t miss the next ${s.name} class`,
        body: `You’re at ${pct(bp)} — exactly on the edge. One more absence takes ${s.name} below ${min}.`,
      });
    } else if (state === 'WATCH') {
      const safe = safeAbsences(s.tally, s.minimumPct);
      out.push({
        rank: 20_000 - Math.min(safe, 9_999), // tier 2; smallest buffer first
        severity: 'warning',
        state,
        offeringId: s.offeringId,
        title: `${s.name} is close to the line`,
        body: `You’re at ${pct(bp)}. You have a buffer of ${plural(safe, 'class', 'classes')} above ${min} — keep it for illness or emergencies.`,
      });
    }
  }

  if (opts.aggregateMinimumPct !== null && withData.length) {
    const total = withData.reduce<Tally>((a, s) => ({ held: a.held + s.tally.held, attended: a.attended + s.tally.attended }), { held: 0, attended: 0 });
    if (!meetsTarget(total, opts.aggregateMinimumPct)) {
      const need = classesToReach(total, opts.aggregateMinimumPct);
      out.push({
        rank: 35_000, // tier 3.5
        severity: 'critical',
        state: 'AGGREGATE',
        offeringId: null,
        title: `Overall attendance is below ${opts.aggregateMinimumPct}%`,
        body:
          `Your college also requires ${opts.aggregateMinimumPct}% across all subjects. You’re at ${pct(percentBp(total))}` +
          (need !== null ? `; attending the next ${plural(need, 'class', 'classes')} across your timetable restores it.` : '.'),
      });
    }
  }

  if (out.length === 0) {
    if (withData.length === 0) {
      return [
        {
          severity: 'info',
          state: 'NO_DATA',
          offeringId: null,
          title: 'No attendance recorded yet',
          body: 'Advice appears here as soon as your faculty submit the first registers.',
        },
      ];
    }
    const lowest = [...withData].sort((a, b) => (percentBp(a.tally) ?? 0) - (percentBp(b.tally) ?? 0))[0]!;
    return [
      {
        severity: 'good',
        state: 'SAFE',
        offeringId: null,
        title: 'You’re on track in every subject',
        body: `Your lowest is ${lowest.name} at ${pct(percentBp(lowest.tally))} (minimum ${lowest.minimumPct}%). Keep your buffer for illness and emergencies.`,
      },
    ];
  }

  return out
    .sort((a, b) => b.rank - a.rank)
    .slice(0, opts.limit ?? 6)
    .map(({ rank: _rank, ...a }) => a);
}

/* --------------------------------- trend --------------------------------- */

export interface WeekTally extends Tally {
  /** Monday, YYYY-MM-DD. */
  weekStart: string;
}

export interface TrendPoint {
  weekStart: string;
  /** That week's attendance; null when no class was held that week. */
  weekBp: number | null;
  /** Running attendance at the end of that week (all weeks so far). */
  cumulativeBp: number | null;
  held: number;
  attended: number;
}

/**
 * Weekly trend over the given weeks (oldest first). Weeks without classes are
 * kept as gaps — never interpolated. `before` is the tally from weeks earlier
 * than the window, so the cumulative line starts from the true running value.
 */
export function buildTrend(weeks: string[], rows: WeekTally[], before: Tally = { held: 0, attended: 0 }): TrendPoint[] {
  const byWeek = new Map(rows.map((r) => [r.weekStart, r]));
  let run = clean(before);
  return weeks.map((w) => {
    const r = byWeek.get(w);
    const wk = r ? clean(r) : { held: 0, attended: 0 };
    run = { held: run.held + wk.held, attended: run.attended + wk.attended };
    return { weekStart: w, weekBp: percentBp(wk), cumulativeBp: percentBp(run), held: wk.held, attended: wk.attended };
  });
}
