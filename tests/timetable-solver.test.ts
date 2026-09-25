import { describe, it, expect } from 'vitest';
import { ConstraintTimetableSolver } from '@/services/timetable/solver';
import type { SolverInput, SolverSlot, SolverSession } from '@/services/timetable/types';

/**
 * The solver's guarantees, asserted rather than assumed:
 *   1. It never double-books a room, a faculty member, or a section.
 *   2. It respects hard availability constraints.
 *   3. Lab blocks land on consecutive periods of one day.
 *   4. It reports impossibility honestly instead of inventing a solution.
 *   5. It is deterministic for a given seed.
 */

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

function buildSlots(periodsPerDay = 6): SolverSlot[] {
  const slots: SolverSlot[] = [];
  for (const day of DAYS) {
    for (let p = 1; p <= periodsPerDay; p += 1) {
      slots.push({
        id: `${day}-${p}`,
        day,
        position: p,
        startTime: `${String(8 + p).padStart(2, '0')}:00`,
        endTime: `${String(9 + p).padStart(2, '0')}:00`,
        // Period 4 is lunch — never assignable.
        assignable: p !== 4,
      });
    }
  }
  return slots;
}

function baseInput(overrides: Partial<SolverInput> = {}): SolverInput {
  return {
    slots: buildSlots(),
    rooms: [
      { id: 'r1', code: '101', type: 'CLASSROOM', capacity: 60 },
      { id: 'r2', code: '102', type: 'CLASSROOM', capacity: 60 },
      { id: 'lab1', code: 'LabA', type: 'LAB', capacity: 40 },
    ],
    faculty: [
      { id: 'f1', name: 'Dr. Sharma', unavailableSlotIds: [], maxWeeklyHours: 18, maxDailyHours: 4 },
      { id: 'f2', name: 'Prof. Rao', unavailableSlotIds: [], maxWeeklyHours: 18, maxDailyHours: 4 },
    ],
    sections: [
      { id: 's1', code: 'BBA-2A', strength: 55, homeRoomId: 'r1', maxDailyHours: 5 },
      { id: 's2', code: 'BCA-2A', strength: 38, homeRoomId: 'r2', maxDailyHours: 5 },
    ],
    sessions: [],
    constraints: [],
    options: { seed: 42, timeLimitMs: 5000 },
    ...overrides,
  };
}

function theorySessions(
  sectionId: string,
  facultyId: string,
  subjectCode: string,
  count: number,
): SolverSession[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${sectionId}-${subjectCode}-${i}`,
    offeringId: `off-${sectionId}-${subjectCode}`,
    subjectId: `sub-${subjectCode}`,
    subjectCode,
    subjectName: subjectCode,
    sectionId,
    facultyId,
    length: 1,
    requiredRoomType: 'CLASSROOM',
    spreadKey: `${sectionId}-${subjectCode}`,
  }));
}

/** Asserts the three hard invariants over a produced schedule. */
function assertNoConflicts(result: Awaited<ReturnType<ConstraintTimetableSolver['solve']>>) {
  const roomSlot = new Set<string>();
  const facultySlot = new Set<string>();
  const sectionSlot = new Set<string>();

  for (const p of result.placements) {
    for (const slotId of p.slotIds) {
      if (p.roomId) {
        const key = `${p.roomId}:${slotId}`;
        expect(roomSlot.has(key), `room ${p.roomId} double-booked at ${slotId}`).toBe(false);
        roomSlot.add(key);
      }
      if (p.facultyId) {
        const key = `${p.facultyId}:${slotId}`;
        expect(facultySlot.has(key), `faculty ${p.facultyId} double-booked at ${slotId}`).toBe(false);
        facultySlot.add(key);
      }
      const key = `${p.sectionId}:${slotId}`;
      expect(sectionSlot.has(key), `section ${p.sectionId} double-booked at ${slotId}`).toBe(false);
      sectionSlot.add(key);
    }
  }
}

describe('ConstraintTimetableSolver', () => {
  const solver = new ConstraintTimetableSolver();

  it('places every session without any room, faculty or section clash', async () => {
    const input = baseInput({
      sessions: [
        ...theorySessions('s1', 'f1', 'FIN201', 4),
        ...theorySessions('s1', 'f2', 'MKT201', 3),
        ...theorySessions('s2', 'f1', 'CS201', 4),
        ...theorySessions('s2', 'f2', 'CS202', 3),
      ],
    });

    const result = await solver.solve(input);

    expect(result.report.unplacedCount).toBe(0);
    expect(result.placements).toHaveLength(14);
    expect(result.report.feasible).toBe(true);
    assertNoConflicts(result);
  });

  it('never schedules a faculty member during their blocked periods', async () => {
    const blocked = ['MONDAY-1', 'MONDAY-2', 'MONDAY-3', 'MONDAY-5', 'MONDAY-6'];
    const input = baseInput({
      faculty: [
        { id: 'f1', name: 'Dr. Sharma', unavailableSlotIds: blocked, maxWeeklyHours: 18 },
        { id: 'f2', name: 'Prof. Rao', unavailableSlotIds: [], maxWeeklyHours: 18 },
      ],
      sessions: theorySessions('s1', 'f1', 'FIN201', 5),
    });

    const result = await solver.solve(input);

    expect(result.report.unplacedCount).toBe(0);
    for (const p of result.placements) {
      for (const slotId of p.slotIds) {
        expect(blocked).not.toContain(slotId);
      }
    }
  });

  it('keeps a multi-period lab block consecutive and on one day', async () => {
    const input = baseInput({
      sessions: [
        {
          id: 'lab-session',
          offeringId: 'off-lab',
          subjectId: 'sub-lab',
          subjectCode: 'CS-LAB',
          subjectName: 'Programming Lab',
          sectionId: 's2',
          facultyId: 'f2',
          length: 3,
          requiredRoomType: 'LAB',
          spreadKey: 's2-CS-LAB',
        },
        ...theorySessions('s2', 'f1', 'CS201', 3),
      ],
    });

    const result = await solver.solve(input);
    const lab = result.placements.find((p) => p.sessionId === 'lab-session');

    expect(lab).toBeDefined();
    expect(lab!.slotIds).toHaveLength(3);
    expect(lab!.roomId).toBe('lab1');

    const positions = lab!.slotIds.map((id) => Number(id.split('-')[1]));
    const days = lab!.slotIds.map((id) => id.split('-')[0]);
    expect(new Set(days).size).toBe(1);
    positions.sort((a, b) => a - b);
    expect(positions[1]).toBe(positions[0]! + 1);
    expect(positions[2]).toBe(positions[1]! + 1);
    // Must not straddle the non-assignable lunch period.
    expect(positions).not.toContain(4);
  });

  it('reports impossibility with a reason instead of inventing a schedule', async () => {
    const input = baseInput({
      rooms: [{ id: 'r1', code: '101', type: 'CLASSROOM', capacity: 60 }],
      sessions: [
        {
          id: 'impossible',
          offeringId: 'off-x',
          subjectId: 'sub-x',
          subjectCode: 'BIO-LAB',
          subjectName: 'Biotech Lab',
          sectionId: 's1',
          facultyId: 'f1',
          length: 2,
          requiredRoomType: 'LAB',
          spreadKey: 's1-BIO-LAB',
        },
      ],
    });

    const result = await solver.solve(input);

    expect(result.placements).toHaveLength(0);
    expect(result.report.feasible).toBe(false);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0]!.reason).toContain('LAB');
    expect(result.unplaced[0]!.suggestions.length).toBeGreaterThan(0);
  });

  it('refuses to place a section in a room smaller than its strength', async () => {
    const input = baseInput({
      rooms: [
        { id: 'small', code: 'S1', type: 'CLASSROOM', capacity: 20 },
        { id: 'big', code: 'B1', type: 'CLASSROOM', capacity: 80 },
      ],
      sessions: theorySessions('s1', 'f1', 'FIN201', 3), // section strength 55
    });

    const result = await solver.solve(input);

    expect(result.report.unplacedCount).toBe(0);
    for (const p of result.placements) {
      expect(p.roomId).toBe('big');
    }
  });

  it('honours pinned placements', async () => {
    const sessions = theorySessions('s1', 'f1', 'FIN201', 3);
    sessions[0]!.pinnedSlotId = 'WEDNESDAY-2';
    sessions[0]!.pinnedRoomId = 'r2';

    const result = await solver.solve(baseInput({ sessions }));
    const pinned = result.placements.find((p) => p.sessionId === sessions[0]!.id);

    expect(pinned?.slotIds).toEqual(['WEDNESDAY-2']);
    expect(pinned?.roomId).toBe('r2');
  });

  it('is deterministic for a fixed seed', async () => {
    const build = () =>
      baseInput({
        sessions: [
          ...theorySessions('s1', 'f1', 'FIN201', 4),
          ...theorySessions('s2', 'f2', 'CS201', 4),
        ],
        options: { seed: 7, timeLimitMs: 3000 },
      });

    const a = await solver.solve(build());
    const b = await solver.solve(build());

    const key = (r: typeof a) =>
      r.placements
        .map((p) => `${p.sessionId}@${p.slotIds.join(',')}#${p.roomId}`)
        .sort()
        .join('|');

    expect(key(a)).toBe(key(b));
  });

  it('spreads repeated sessions of one subject across different days', async () => {
    const input = baseInput({
      sessions: theorySessions('s1', 'f1', 'FIN201', 4),
      options: { seed: 11, timeLimitMs: 6000, refinementIterations: 4000 },
    });

    const result = await solver.solve(input);
    const days = result.placements.map((p) => p.day);

    // With 5 available days and 4 sessions, a good schedule uses 4 distinct days.
    expect(new Set(days).size).toBeGreaterThanOrEqual(3);
    expect(result.report.metrics.sameDayRepeats).toBeLessThanOrEqual(1);
  });

  it('scales to a realistic multi-section week without conflicts', async () => {
    const sections = Array.from({ length: 6 }, (_, i) => ({
      id: `sec${i}`,
      code: `SEC-${i}`,
      strength: 45,
      homeRoomId: `room${i % 4}`,
      maxDailyHours: 6,
    }));
    const rooms = Array.from({ length: 8 }, (_, i) => ({
      id: `room${i}`,
      code: `R${i}`,
      type: 'CLASSROOM',
      capacity: 60,
    }));
    const faculty = Array.from({ length: 10 }, (_, i) => ({
      id: `fac${i}`,
      name: `Faculty ${i}`,
      unavailableSlotIds: [],
      maxWeeklyHours: 18,
      maxDailyHours: 5,
    }));

    const sessions = sections.flatMap((section, si) =>
      Array.from({ length: 5 }, (_, sub) =>
        theorySessions(section.id, `fac${(si + sub) % 10}`, `SUB${sub}`, 3),
      ).flat(),
    );

    const result = await solver.solve({
      slots: buildSlots(8),
      rooms,
      faculty,
      sections,
      sessions,
      constraints: [],
      options: { seed: 99, timeLimitMs: 15000 },
    });

    expect(sessions).toHaveLength(90);
    expect(result.report.unplacedCount).toBe(0);
    assertNoConflicts(result);
    expect(result.report.qualityScore).toBeGreaterThan(60);
  });
});
