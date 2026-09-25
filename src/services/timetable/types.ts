/**
 * TIMETABLE SOLVER — types
 * ---------------------------------------------------------------------------
 * The solver is deliberately pure: it takes plain data in and returns plain
 * data out, with no database or network access. That makes it deterministic,
 * unit-testable, and replaceable.
 *
 * WHY NOT AN LLM: scheduling is a constraint-satisfaction problem. A language
 * model cannot guarantee a conflict-free assignment. The LLM's role in
 * CampusOS is to translate natural language into the `SolverConstraint`
 * objects below and to explain results — never to compute the schedule.
 *
 * WHY NOT OR-TOOLS (yet): OR-Tools requires a Python/native runtime alongside
 * the Node deployment, which materially raises the bar for a college's IT
 * team. This implementation is a real CSP solver (AC-3 style propagation +
 * MRV backtracking + simulated-annealing refinement) that runs in-process.
 * `TimetableSolver` is an interface, so an OR-Tools microservice can be
 * dropped in later without touching call sites. See TIMETABLE.md.
 */

export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export interface SolverSlot {
  id: string;
  day: DayOfWeek;
  /** 1-based position within the day. */
  position: number;
  startTime: string;
  endTime: string;
  /** BREAK / LUNCH slots are never assignable. */
  assignable: boolean;
}

export interface SolverRoom {
  id: string;
  code: string;
  type: string;
  capacity: number;
  /** Slot ids during which this room may not be used (maintenance, events). */
  blockedSlotIds?: string[];
}

export interface SolverFaculty {
  id: string;
  name: string;
  /** Slot ids the faculty member is unavailable for. Hard constraint. */
  unavailableSlotIds: string[];
  /** Contracted weekly teaching ceiling. Hard constraint. */
  maxWeeklyHours: number;
  /** Soft preference: avoid exceeding this many periods in one day. */
  maxDailyHours?: number;
}

export interface SolverSection {
  id: string;
  code: string;
  strength: number;
  /** Preferred room, used as a soft preference to keep cohorts in one place. */
  homeRoomId?: string | null;
  /** Soft preference: avoid exceeding this many periods in one day. */
  maxDailyHours?: number;
}

/**
 * One unit of teaching to place. A 3-hour lab with consecutiveBlockSize 3
 * becomes ONE session occupying three consecutive slots; a 3-hour theory
 * subject becomes THREE separate sessions that must land on different days.
 */
export interface SolverSession {
  id: string;
  offeringId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  sectionId: string;
  facultyId: string | null;
  /** How many consecutive slots this session needs. */
  length: number;
  requiredRoomType: string | null;
  /** Sessions sharing this key should be spread across different days. */
  spreadKey: string;
  /** Pre-assigned (pinned) placement that the solver must respect. */
  pinnedSlotId?: string | null;
  pinnedRoomId?: string | null;
}

export type ConstraintKind =
  | 'FACULTY_UNAVAILABLE'
  | 'ROOM_UNAVAILABLE'
  | 'SECTION_UNAVAILABLE'
  | 'SUBJECT_NOT_IN_SLOT'
  | 'SUBJECT_PREFERS_SLOT'
  | 'NO_CONSECUTIVE_SAME_SUBJECT'
  | 'MAX_DAILY_HOURS';

/** Structured constraint, typically produced from natural language by the AI layer. */
export interface SolverConstraint {
  kind: ConstraintKind;
  /** HARD constraints can never be violated; SOFT ones carry a penalty. */
  severity: 'HARD' | 'SOFT';
  facultyId?: string;
  roomId?: string;
  sectionId?: string;
  subjectId?: string;
  slotIds?: string[];
  value?: number;
  /** Human-readable origin, shown when explaining the result. */
  description: string;
}

export interface SolverInput {
  slots: SolverSlot[];
  rooms: SolverRoom[];
  faculty: SolverFaculty[];
  sections: SolverSection[];
  sessions: SolverSession[];
  constraints: SolverConstraint[];
  options?: SolverOptions;
}

export interface SolverOptions {
  /** Wall-clock budget. The solver returns the best found so far when it expires. */
  timeLimitMs?: number;
  /** Iterations of local-search refinement after a feasible solution is found. */
  refinementIterations?: number;
  /** Deterministic runs for reproducible tests and stable demos. */
  seed?: number;
  /** Soft-constraint weights. */
  weights?: Partial<SolverWeights>;
}

export interface SolverWeights {
  /** Penalty per idle period between a section's classes on one day. */
  sectionGap: number;
  /** Penalty per idle period between a faculty member's classes on one day. */
  facultyGap: number;
  /** Penalty when a section exceeds its preferred daily load. */
  sectionDailyOverload: number;
  /** Penalty when a faculty member exceeds their preferred daily load. */
  facultyDailyOverload: number;
  /** Penalty when a section is not in its home room. */
  homeRoomMiss: number;
  /** Penalty when two sessions of the same subject land on the same day. */
  sameDayRepeat: number;
  /** Penalty for using an oversized room (wasted capacity). */
  capacityWaste: number;
  /** Penalty for a soft constraint violation. */
  softConstraint: number;
  /** Penalty for placing a class in the final period of the day. */
  lastPeriod: number;
}

export const DEFAULT_WEIGHTS: SolverWeights = {
  sectionGap: 12,
  facultyGap: 6,
  sectionDailyOverload: 20,
  facultyDailyOverload: 25,
  homeRoomMiss: 3,
  sameDayRepeat: 30,
  capacityWaste: 1,
  softConstraint: 40,
  lastPeriod: 2,
};

export interface Placement {
  sessionId: string;
  offeringId: string;
  sectionId: string;
  facultyId: string | null;
  /** Slot ids occupied, in order. Length equals session.length. */
  slotIds: string[];
  roomId: string | null;
  day: DayOfWeek;
}

export interface UnplacedSession {
  sessionId: string;
  subjectCode: string;
  subjectName: string;
  sectionId: string;
  /** Plain-English reason, e.g. "No room of type LAB is free in any slot". */
  reason: string;
  /** What relaxing would open up, so the admin has a real next step. */
  suggestions: string[];
}

export interface SolverReport {
  feasible: boolean;
  placedCount: number;
  unplacedCount: number;
  /** Lower is better. 0 means every soft preference was satisfied. */
  softPenalty: number;
  /** Aggregate quality score 0..100 derived from softPenalty and placement rate. */
  qualityScore: number;
  durationMs: number;
  iterations: number;
  metrics: {
    sectionGaps: number;
    facultyGaps: number;
    homeRoomMisses: number;
    sameDayRepeats: number;
    roomUtilizationPercent: number;
    averageFacultyDailyLoad: number;
  };
  violatedSoftConstraints: { description: string; count: number }[];
}

export interface SolverResult {
  placements: Placement[];
  unplaced: UnplacedSession[];
  report: SolverReport;
}

/** Swappable engine contract — see TIMETABLE.md §Replacing the solver. */
export interface TimetableSolver {
  readonly name: string;
  solve(input: SolverInput): Promise<SolverResult>;
}
