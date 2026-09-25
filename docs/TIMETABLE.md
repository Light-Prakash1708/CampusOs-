# Timetable Engine

## Why not a language model

Scheduling is constraint satisfaction. A language model cannot guarantee that
no room is double-booked, and a timetable that is *nearly* conflict-free is
worse than useless — it fails at 9am in front of students.

The model's role here is to translate natural language into structured
constraints and to explain results. The schedule itself is computed by an
algorithm whose guarantees are testable.

## The solver

`src/services/timetable/solver.ts` — pure, deterministic, no I/O.

### Phase 1 — Domain construction

For every session, enumerate the (start slot, room) pairs satisfying all unary
hard constraints: faculty availability, room type, room capacity vs section
strength, contiguity for multi-period blocks, explicit blocked slots, pins.

A session whose domain is empty is reported as unplaceable **before any search**,
with a specific reason:

> *No room of type LAB exists, which this BIO303 session requires.*
> *Every LAB is smaller than BTBIO-3A's strength of 38.*
> *No 3 consecutive free periods exist on any single day for this block.*

and concrete relaxations that would open it up.

### Phase 2 — Backtracking search

Minimum-Remaining-Values ordering (most constrained session first) with forward
checking. Candidate ordering is least-constraining-value approximated by a cheap
heuristic (prefer the section's home room, avoid the last period).

Occupancy is tracked in three sets keyed `${resourceId}:${slotId}` — room,
faculty, section — so a feasibility check is O(session length), not a scan.

Pinned sessions are placed first and never moved.

### Phase 3 — Local search refinement

With feasibility held invariant, propose moves and accept them by simulated
annealing against a weighted soft-constraint penalty:

| Soft constraint | Default weight | Why |
|---|---|---|
| Same subject twice in one day | 30 | Poor for retention |
| Faculty exceeds preferred daily load | 25 | Fatigue |
| Section exceeds preferred daily load | 20 | Fatigue |
| Idle gap in a section's day | 12 | Students stranded on campus |
| Idle gap in a faculty member's day | 6 | Fragmented preparation time |
| Not in the section's home room | 3 | Cohort stability |
| Last period of the day | 2 | Attendance drops |
| Oversized room | 1 | Wasted capacity |

Every proposal is checked for feasibility before acceptance, so refinement can
never introduce a clash.

### Guarantees, asserted by tests

`tests/timetable-solver.test.ts`:

- never double-books a room, faculty member or section
- never schedules a faculty member in a blocked period
- keeps a multi-period lab contiguous, on one day, not straddling lunch
- refuses a room smaller than the section
- honours pins
- is deterministic for a fixed seed
- spreads repeated sessions across days
- places a realistic 6-section, 90-session week with zero conflicts

On the seeded demo institution: **119 sessions placed, 0 unplaced, quality
97/100, ~5 seconds.**

## Natural-language requirements

`src/services/timetable/nl.ts` converts sentences into constraints:

> "Dr. Meera Sharma cannot teach before 10 AM on Monday and is unavailable on
> Wednesday."

becomes two `HARD` `FACULTY_UNAVAILABLE` constraints over concrete slot ids,
and reports back:

> *Dr. Meera Sharma will not be scheduled in 1 period on Monday.*
> *Dr. Meera Sharma will not be scheduled in 7 periods on Wednesday.*

Anything it cannot parse is returned in `unrecognised` and shown to the admin as
**"Not understood — these were NOT applied"**. Silently dropping a requirement
would be the worst possible failure, because the admin would believe it had been
honoured.

## Publishing

Generation produces a `PROPOSED` version. The published timetable is untouched.

Publishing is a separate, audited step that, in one transaction: archives the
current version, promotes the new one, computes a per-offering diff, writes a
`TIMETABLE_CHANGED` change event with BEFORE → AFTER for every moved class, and
notifies everyone affected. The reason the publisher types is what students see.

## Conflict engine

`src/services/timetable/conflicts.ts` answers three questions before any write:

1. **Does this clash?** — room, faculty, section, room capacity, room type,
   exams, events, holidays, non-teaching periods.
2. **Who is affected?** — actual student counts and section codes.
3. **What else would work?** — alternatives verified against the database, never
   suggested speculatively. An integration test asserts every suggested room is
   genuinely free.

`scanVersionConflicts()` scans an entire version for the dashboard count. It is
a real scan, not a cached number.

## Replacing the solver

`TimetableSolver` is an interface:

```ts
interface TimetableSolver {
  readonly name: string;
  solve(input: SolverInput): Promise<SolverResult>;
}
```

To use OR-Tools: stand up a Python service, implement `solve()` to POST
`SolverInput` and map the response to `SolverResult`, and swap `defaultSolver`.
Nothing else changes — `generate.ts` and every call site are unaffected. The
solver already reports `generatedBy`, so a version records which engine produced
it.
