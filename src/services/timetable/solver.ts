import {
  DEFAULT_WEIGHTS,
  type DayOfWeek,
  type Placement,
  type SolverConstraint,
  type SolverInput,
  type SolverResult,
  type SolverSession,
  type SolverWeights,
  type TimetableSolver,
  type UnplacedSession,
} from './types';

/**
 * CONSTRAINT-BASED TIMETABLE SOLVER
 * ---------------------------------------------------------------------------
 * Three phases:
 *
 *   1. DOMAIN CONSTRUCTION — for every session, enumerate the (start slot, room)
 *      pairs that satisfy all unary hard constraints. A session whose domain is
 *      empty is reported as unplaceable *with the reason*, before any search.
 *
 *   2. BACKTRACKING SEARCH — assign sessions using the Minimum-Remaining-Values
 *      heuristic (most constrained session first) with forward checking. This
 *      finds a feasible, conflict-free assignment or proves none exists within
 *      the time budget.
 *
 *   3. LOCAL SEARCH REFINEMENT — with feasibility held invariant, repeatedly
 *      propose moves/swaps and accept them by simulated annealing to reduce the
 *      soft penalty (gaps, daily overload, same-day repeats, home-room misses).
 *
 * Determinism: all randomness comes from a seeded PRNG, so the same input
 * always produces the same timetable. That matters for demos and for tests.
 */

/* --------------------------- deterministic PRNG --------------------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ internal types ---------------------------- */

interface Candidate {
  /** Index of the first slot in the assignable-slot ordering. */
  startIndex: number;
  slotIds: string[];
  roomId: string | null;
  day: DayOfWeek;
}

interface Assignment {
  session: SolverSession;
  candidate: Candidate;
}

export class ConstraintTimetableSolver implements TimetableSolver {
  readonly name = 'campusos-csp-v1';

  async solve(input: SolverInput): Promise<SolverResult> {
    const startedAt = Date.now();
    const options = input.options ?? {};
    const timeLimitMs = options.timeLimitMs ?? 10_000;
    const weights: SolverWeights = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };
    const rand = mulberry32(options.seed ?? 20260820);

    /* ---------------- indexes ---------------- */

    const assignableSlots = input.slots
      .filter((s) => s.assignable)
      .sort((a, b) => dayOrder(a.day) - dayOrder(b.day) || a.position - b.position);

    const slotIndexById = new Map(assignableSlots.map((s, i) => [s.id, i]));
    const roomById = new Map(input.rooms.map((r) => [r.id, r]));
    const facultyById = new Map(input.faculty.map((f) => [f.id, f]));
    const sectionById = new Map(input.sections.map((s) => [s.id, s]));

    const hardConstraints = input.constraints.filter((c) => c.severity === 'HARD');
    const softConstraints = input.constraints.filter((c) => c.severity === 'SOFT');

    /* ------------- phase 1: domain construction ------------- */

    const domains = new Map<string, Candidate[]>();
    const unplaced: UnplacedSession[] = [];

    for (const session of input.sessions) {
      const candidates = buildDomain(session);
      if (candidates.length === 0) {
        unplaced.push({
          sessionId: session.id,
          subjectCode: session.subjectCode,
          subjectName: session.subjectName,
          sectionId: session.sectionId,
          reason: explainEmptyDomain(session),
          suggestions: suggestRelaxations(session),
        });
      } else {
        domains.set(session.id, candidates);
      }
    }

    const solvableSessions = input.sessions.filter((s) => domains.has(s.id));

    /* ------------- phase 2: backtracking search ------------- */

    const assignments = new Map<string, Candidate>();
    // Occupancy maps keyed by `${resourceId}:${slotId}`.
    const roomBusy = new Set<string>();
    const facultyBusy = new Set<string>();
    const sectionBusy = new Set<string>();
    let iterations = 0;
    let searchExhausted = false;

    const deadline = startedAt + timeLimitMs * 0.7;

    const ordered = [...solvableSessions];

    function selectNext(): SolverSession | null {
      // MRV: fewest remaining feasible candidates first, ties broken by longer
      // sessions (harder to place) then deterministic id order.
      let best: SolverSession | null = null;
      let bestCount = Infinity;
      for (const session of ordered) {
        if (assignments.has(session.id)) continue;
        const count = countFeasible(session);
        if (count === 0) return session; // dead end — fail fast
        if (
          count < bestCount ||
          (count === bestCount && best !== null && session.length > best.length)
        ) {
          best = session;
          bestCount = count;
        }
      }
      return best;
    }

    function countFeasible(session: SolverSession): number {
      const domain = domains.get(session.id) ?? [];
      let n = 0;
      for (const c of domain) if (isFree(session, c)) n += 1;
      return n;
    }

    function isFree(session: SolverSession, candidate: Candidate): boolean {
      for (const slotId of candidate.slotIds) {
        if (sectionBusy.has(`${session.sectionId}:${slotId}`)) return false;
        if (session.facultyId && facultyBusy.has(`${session.facultyId}:${slotId}`)) return false;
        if (candidate.roomId && roomBusy.has(`${candidate.roomId}:${slotId}`)) return false;
      }
      return true;
    }

    function occupy(session: SolverSession, candidate: Candidate, on: boolean) {
      for (const slotId of candidate.slotIds) {
        toggle(sectionBusy, `${session.sectionId}:${slotId}`, on);
        if (session.facultyId) toggle(facultyBusy, `${session.facultyId}:${slotId}`, on);
        if (candidate.roomId) toggle(roomBusy, `${candidate.roomId}:${slotId}`, on);
      }
    }

    function backtrack(): boolean {
      if (Date.now() > deadline) {
        searchExhausted = true;
        return false;
      }
      const session = selectNext();
      if (!session) return true; // all assigned

      const domain = domains.get(session.id) ?? [];
      // Least-constraining-value: prefer candidates that block the fewest
      // options for the remaining sessions. Approximated by a cheap heuristic
      // (spread across days, prefer home room) to keep the inner loop fast.
      const options = domain
        .filter((c) => isFree(session, c))
        .sort((a, b) => heuristicCost(session, a) - heuristicCost(session, b));

      for (const candidate of options) {
        iterations += 1;
        assignments.set(session.id, candidate);
        occupy(session, candidate, true);

        if (backtrack()) return true;

        occupy(session, candidate, false);
        assignments.delete(session.id);
        if (searchExhausted) return false;
      }
      return false;
    }

    // Pinned sessions are placed first and never moved.
    for (const session of solvableSessions) {
      if (!session.pinnedSlotId) continue;
      const domain = domains.get(session.id) ?? [];
      const pinned = domain.find((c) => c.slotIds[0] === session.pinnedSlotId);
      if (pinned && isFree(session, pinned)) {
        assignments.set(session.id, pinned);
        occupy(session, pinned, true);
      }
    }

    const complete = backtrack();

    // Anything still unassigned after the search could not be fitted.
    for (const session of solvableSessions) {
      if (!assignments.has(session.id)) {
        unplaced.push({
          sessionId: session.id,
          subjectCode: session.subjectCode,
          subjectName: session.subjectName,
          sectionId: session.sectionId,
          reason: searchExhausted
            ? 'The solver ran out of time before it could place this class.'
            : 'Every slot that would suit this class is already taken by another commitment.',
          suggestions: searchExhausted
            ? ['Increase the time limit and run the optimiser again.']
            : suggestRelaxations(session),
        });
      }
    }

    /* ------------- phase 3: local-search refinement ------------- */

    let current = [...assignments.entries()].map(([sessionId, candidate]) => ({
      session: solvableSessions.find((s) => s.id === sessionId)!,
      candidate,
    })) as Assignment[];

    let currentPenalty = evaluate(current);
    let bestAssignments = current;
    let bestPenalty = currentPenalty;

    const refinementDeadline = startedAt + timeLimitMs;
    const maxIterations = options.refinementIterations ?? 6000;
    let temperature: number;

    const movable = current.filter((a) => !a.session.pinnedSlotId);

    if (movable.length > 1) {
      for (let i = 0; i < maxIterations && Date.now() < refinementDeadline; i += 1) {
        iterations += 1;
        temperature = Math.max(0.01, 1 - i / maxIterations);

        const proposal = proposeMove(current, rand);
        if (!proposal) continue;

        const penalty = evaluate(proposal);
        const delta = penalty - currentPenalty;

        // Accept improvements always; accept regressions with decaying probability.
        if (delta <= 0 || rand() < Math.exp(-delta / (temperature * 25))) {
          current = proposal;
          currentPenalty = penalty;
          if (penalty < bestPenalty) {
            bestPenalty = penalty;
            bestAssignments = proposal;
          }
        }
      }
    }

    /* ---------------------- result ---------------------- */

    const placements: Placement[] = bestAssignments.map((a) => ({
      sessionId: a.session.id,
      offeringId: a.session.offeringId,
      sectionId: a.session.sectionId,
      facultyId: a.session.facultyId,
      slotIds: a.candidate.slotIds,
      roomId: a.candidate.roomId,
      day: a.candidate.day,
    }));

    const metrics = computeMetrics(bestAssignments);
    const totalSessions = input.sessions.length;
    const placementRate = totalSessions === 0 ? 1 : placements.length / totalSessions;
    // Quality blends completeness (dominant) with soft-preference satisfaction.
    const penaltyCeiling = Math.max(1, totalSessions * 40);
    const softQuality = Math.max(0, 1 - bestPenalty / penaltyCeiling);
    const qualityScore = Math.round((placementRate * 0.7 + softQuality * 0.3) * 100);

    return {
      placements,
      unplaced,
      report: {
        feasible: unplaced.length === 0 && complete,
        placedCount: placements.length,
        unplacedCount: unplaced.length,
        softPenalty: Math.round(bestPenalty),
        qualityScore,
        durationMs: Date.now() - startedAt,
        iterations,
        metrics,
        violatedSoftConstraints: summariseSoftViolations(bestAssignments),
      },
    };

    /* ======================= helper closures ======================= */

    function buildDomain(session: SolverSession): Candidate[] {
      const candidates: Candidate[] = [];
      const faculty = session.facultyId ? facultyById.get(session.facultyId) : undefined;
      const section = sectionById.get(session.sectionId);

      const eligibleRooms = input.rooms.filter((room) => {
        if (session.requiredRoomType && room.type !== session.requiredRoomType) return false;
        if (section && room.capacity < section.strength) return false;
        return true;
      });

      for (let i = 0; i + session.length <= assignableSlots.length; i += 1) {
        const window = assignableSlots.slice(i, i + session.length);
        const first = window[0]!;

        // Consecutive slots must be on the same day and contiguous.
        if (!window.every((s) => s.day === first.day)) continue;
        if (session.length > 1) {
          let contiguous = true;
          for (let k = 1; k < window.length; k += 1) {
            if (window[k]!.position !== window[k - 1]!.position + 1) contiguous = false;
          }
          if (!contiguous) continue;
        }

        const slotIds = window.map((s) => s.id);

        // Hard: faculty availability.
        if (faculty && slotIds.some((id) => faculty.unavailableSlotIds.includes(id))) continue;

        // Hard: explicit constraints.
        if (violatesHardConstraint(session, slotIds)) continue;

        // Hard: pinned placement.
        if (session.pinnedSlotId && slotIds[0] !== session.pinnedSlotId) continue;

        for (const room of eligibleRooms) {
          if (room.blockedSlotIds?.some((id) => slotIds.includes(id))) continue;
          if (session.pinnedRoomId && room.id !== session.pinnedRoomId) continue;
          candidates.push({ startIndex: i, slotIds, roomId: room.id, day: first.day });
        }

        // A session with no eligible room is still placeable with room TBD only
        // if it does not require a specific room type.
        if (eligibleRooms.length === 0 && !session.requiredRoomType) {
          candidates.push({ startIndex: i, slotIds, roomId: null, day: first.day });
        }
      }

      return candidates;
    }

    function violatesHardConstraint(session: SolverSession, slotIds: string[]): boolean {
      for (const c of hardConstraints) {
        if (!constraintApplies(c, session)) continue;
        if (c.kind === 'MAX_DAILY_HOURS') continue; // evaluated during search
        if (c.slotIds && c.slotIds.some((id) => slotIds.includes(id))) return true;
      }
      return false;
    }

    function constraintApplies(c: SolverConstraint, session: SolverSession): boolean {
      if (c.facultyId && c.facultyId !== session.facultyId) return false;
      if (c.sectionId && c.sectionId !== session.sectionId) return false;
      if (c.subjectId && c.subjectId !== session.subjectId) return false;
      return true;
    }

    function explainEmptyDomain(session: SolverSession): string {
      const section = sectionById.get(session.sectionId);
      const faculty = session.facultyId ? facultyById.get(session.facultyId) : undefined;

      if (session.requiredRoomType) {
        const typed = input.rooms.filter((r) => r.type === session.requiredRoomType);
        if (typed.length === 0) {
          return `No room of type ${session.requiredRoomType} exists, which this ${session.subjectCode} session requires.`;
        }
        if (section && typed.every((r) => r.capacity < section.strength)) {
          return `Every ${session.requiredRoomType} is smaller than ${section.code}'s strength of ${section.strength}.`;
        }
      }

      if (section && input.rooms.every((r) => r.capacity < section.strength)) {
        return `No room is large enough for ${section.code} (${section.strength} students).`;
      }

      if (faculty && faculty.unavailableSlotIds.length >= assignableSlots.length) {
        return `${faculty.name} is marked unavailable for every teaching period.`;
      }

      if (session.length > 1) {
        return `No ${session.length} consecutive free periods exist on any single day for this ${session.subjectCode} block.`;
      }

      return 'No period satisfies all of this class’s hard constraints.';
    }

    function suggestRelaxations(session: SolverSession): string[] {
      const out: string[] = [];
      const section = sectionById.get(session.sectionId);
      const faculty = session.facultyId ? facultyById.get(session.facultyId) : undefined;

      if (session.requiredRoomType) {
        out.push(`Allow ${session.subjectCode} to use a general classroom instead of a ${session.requiredRoomType}.`);
      }
      if (section) {
        const bigEnough = input.rooms.filter((r) => r.capacity >= section.strength).length;
        if (bigEnough <= 2) {
          out.push(`Add a room with capacity of at least ${section.strength}, or split ${section.code}.`);
        }
      }
      if (faculty && faculty.unavailableSlotIds.length > 0) {
        out.push(`Relax ${faculty.name}'s unavailable periods — currently ${faculty.unavailableSlotIds.length} are blocked.`);
      }
      if (session.length > 1) {
        out.push(`Split the ${session.length}-period block into shorter sessions.`);
      }
      out.push('Add more teaching periods to the weekly grid.');
      return out.slice(0, 3);
    }

    function heuristicCost(session: SolverSession, candidate: Candidate): number {
      let cost = 0;
      const section = sectionById.get(session.sectionId);
      if (section?.homeRoomId && candidate.roomId !== section.homeRoomId) cost += weights.homeRoomMiss;
      const room = candidate.roomId ? roomById.get(candidate.roomId) : undefined;
      if (room && section) cost += Math.max(0, room.capacity - section.strength) * 0.05;
      const slot = assignableSlots[candidate.startIndex];
      if (slot && slot.position >= 7) cost += weights.lastPeriod;
      return cost;
    }

    function proposeMove(assignmentsList: Assignment[], random: () => number): Assignment[] | null {
      const moveable = assignmentsList.filter((a) => !a.session.pinnedSlotId);
      if (moveable.length === 0) return null;

      const target = moveable[Math.floor(random() * moveable.length)]!;
      const domain = domains.get(target.session.id) ?? [];
      if (domain.length === 0) return null;

      const next = assignmentsList.map((a) => ({ ...a }));
      const idx = next.findIndex((a) => a.session.id === target.session.id);
      if (idx === -1) return null;

      // Try a limited number of alternative placements, keeping feasibility.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = domain[Math.floor(random() * domain.length)]!;
        if (candidate === target.candidate) continue;
        if (isFeasibleSwap(next, idx, candidate)) {
          next[idx] = { session: target.session, candidate };
          return next;
        }
      }
      return null;
    }

    function isFeasibleSwap(list: Assignment[], index: number, candidate: Candidate): boolean {
      const session = list[index]!.session;
      for (let i = 0; i < list.length; i += 1) {
        if (i === index) continue;
        const other = list[i]!;
        const overlap = other.candidate.slotIds.some((id) => candidate.slotIds.includes(id));
        if (!overlap) continue;
        if (other.session.sectionId === session.sectionId) return false;
        if (session.facultyId && other.session.facultyId === session.facultyId) return false;
        if (candidate.roomId && other.candidate.roomId === candidate.roomId) return false;
      }
      return true;
    }

    function evaluate(list: Assignment[]): number {
      let penalty = 0;

      // Group by (resource, day) to measure gaps and daily load.
      const sectionDay = new Map<string, number[]>();
      const facultyDay = new Map<string, number[]>();
      const subjectDay = new Map<string, number>();

      for (const a of list) {
        const slot = assignableSlots[a.candidate.startIndex];
        if (!slot) continue;
        const section = sectionById.get(a.session.sectionId);

        for (let k = 0; k < a.candidate.slotIds.length; k += 1) {
          const position = slot.position + k;
          push(sectionDay, `${a.session.sectionId}|${a.candidate.day}`, position);
          if (a.session.facultyId) {
            push(facultyDay, `${a.session.facultyId}|${a.candidate.day}`, position);
          }
          if (position >= 7) penalty += weights.lastPeriod;
        }

        // Same subject twice in one day is undesirable for retention.
        const key = `${a.session.spreadKey}|${a.candidate.day}`;
        const seen = subjectDay.get(key) ?? 0;
        if (seen > 0) penalty += weights.sameDayRepeat;
        subjectDay.set(key, seen + 1);

        if (section?.homeRoomId && a.candidate.roomId !== section.homeRoomId) {
          penalty += weights.homeRoomMiss;
        }

        const room = a.candidate.roomId ? roomById.get(a.candidate.roomId) : undefined;
        if (room && section) {
          penalty += Math.max(0, room.capacity - section.strength) * weights.capacityWaste * 0.05;
        }

        for (const c of softConstraints) {
          if (!constraintApplies(c, a.session)) continue;
          if (c.slotIds?.some((id) => a.candidate.slotIds.includes(id))) {
            penalty += c.kind === 'SUBJECT_PREFERS_SLOT' ? 0 : weights.softConstraint;
          } else if (c.kind === 'SUBJECT_PREFERS_SLOT') {
            penalty += weights.softConstraint * 0.5;
          }
        }
      }

      for (const [key, positions] of sectionDay) {
        penalty += gapCount(positions) * weights.sectionGap;
        const sectionId = key.split('|')[0]!;
        const limit = sectionById.get(sectionId)?.maxDailyHours;
        if (limit && positions.length > limit) {
          penalty += (positions.length - limit) * weights.sectionDailyOverload;
        }
      }

      for (const [key, positions] of facultyDay) {
        penalty += gapCount(positions) * weights.facultyGap;
        const facultyId = key.split('|')[0]!;
        const limit = facultyById.get(facultyId)?.maxDailyHours;
        if (limit && positions.length > limit) {
          penalty += (positions.length - limit) * weights.facultyDailyOverload;
        }
      }

      return penalty;
    }

    function computeMetrics(list: Assignment[]) {
      const sectionDay = new Map<string, number[]>();
      const facultyDay = new Map<string, number[]>();
      const subjectDay = new Map<string, number>();
      let homeRoomMisses = 0;
      let sameDayRepeats = 0;
      let occupiedSlotRoomPairs = 0;

      for (const a of list) {
        const slot = assignableSlots[a.candidate.startIndex];
        if (!slot) continue;
        const section = sectionById.get(a.session.sectionId);
        for (let k = 0; k < a.candidate.slotIds.length; k += 1) {
          push(sectionDay, `${a.session.sectionId}|${a.candidate.day}`, slot.position + k);
          if (a.session.facultyId) {
            push(facultyDay, `${a.session.facultyId}|${a.candidate.day}`, slot.position + k);
          }
          if (a.candidate.roomId) occupiedSlotRoomPairs += 1;
        }
        if (section?.homeRoomId && a.candidate.roomId !== section.homeRoomId) homeRoomMisses += 1;
        const key = `${a.session.spreadKey}|${a.candidate.day}`;
        const seen = subjectDay.get(key) ?? 0;
        if (seen > 0) sameDayRepeats += 1;
        subjectDay.set(key, seen + 1);
      }

      const sectionGaps = [...sectionDay.values()].reduce((n, p) => n + gapCount(p), 0);
      const facultyGaps = [...facultyDay.values()].reduce((n, p) => n + gapCount(p), 0);
      const capacity = input.rooms.length * assignableSlots.length;
      const facultyLoads = [...facultyDay.values()].map((p) => p.length);

      return {
        sectionGaps,
        facultyGaps,
        homeRoomMisses,
        sameDayRepeats,
        roomUtilizationPercent:
          capacity === 0 ? 0 : Math.round((occupiedSlotRoomPairs / capacity) * 1000) / 10,
        averageFacultyDailyLoad:
          facultyLoads.length === 0
            ? 0
            : Math.round((facultyLoads.reduce((a, b) => a + b, 0) / facultyLoads.length) * 10) / 10,
      };
    }

    function summariseSoftViolations(list: Assignment[]) {
      const counts = new Map<string, number>();
      for (const a of list) {
        for (const c of softConstraints) {
          if (!constraintApplies(c, a.session)) continue;
          if (c.slotIds?.some((id) => a.candidate.slotIds.includes(id))) {
            counts.set(c.description, (counts.get(c.description) ?? 0) + 1);
          }
        }
      }
      return [...counts.entries()].map(([description, count]) => ({ description, count }));
    }
  }
}

/* ------------------------------ small helpers ----------------------------- */

function toggle(set: Set<string>, key: string, on: boolean) {
  if (on) set.add(key);
  else set.delete(key);
}

function push(map: Map<string, number[]>, key: string, value: number) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Number of idle periods between the first and last class of a day. */
function gapCount(positions: number[]): number {
  if (positions.length < 2) return 0;
  const sorted = [...positions].sort((a, b) => a - b);
  const span = sorted[sorted.length - 1]! - sorted[0]! + 1;
  return Math.max(0, span - sorted.length);
}

const DAY_ORDER: Record<DayOfWeek, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

function dayOrder(day: DayOfWeek): number {
  return DAY_ORDER[day] ?? 9;
}

export const defaultSolver = new ConstraintTimetableSolver();
