import { z } from 'zod';
import { ok, parseBody, requireFeatureEnabled, withAuth, NotFoundError } from '@/lib/api';
import {
  bestCase,
  classesToReach,
  meetsTarget,
  percentBp,
  project,
  reachableThisTerm,
  safeAbsences,
  simulate,
} from '@/lib/attendance/planner';
import { getAttendanceOverview } from '@/services/attendance';
import { studentOf } from '../_lib';

const Body = z.object({
  /** Omit for overall attendance across subjects. */
  offeringId: z.string().uuid().optional(),
  targetPct: z.number().min(1).max(100),
  miss: z.number().int().min(0).max(500).default(0),
  attend: z.number().int().min(0).max(500).default(0),
});

/**
 * Attendance Planner calculation on the student's OWN recorded numbers.
 * Read-only: simulates, never writes. The same maths runs in the browser;
 * this endpoint exists for other clients (and the AI, in a later phase).
 */
export const POST = withAuth('attendance:view_own', async (request, { user }) => {
  requireFeatureEnabled(user, 'attendance_planner_enabled');
  const input = await parseBody(request, Body);
  const overview = await getAttendanceOverview(studentOf(user));
  const subject = input.offeringId ? overview.subjects.find((s) => s.offeringId === input.offeringId) : null;
  if (input.offeringId && !subject) throw new NotFoundError('That subject');
  const tally = subject ? { held: subject.held, attended: subject.attended } : { held: overview.overall.held, attended: overview.overall.attended };
  const remaining = subject ? subject.remaining : null;
  const after = project(tally, { miss: input.miss, attend: input.attend });
  const counts = [1, 2, 3, 4, 5];
  return ok({
    scope: subject ? { offeringId: subject.offeringId, name: subject.name, minimumPct: subject.minimumPct } : { offeringId: null, name: 'Overall', minimumPct: overview.policy.aggregateMinimumPct },
    current: { ...tally, percentBp: percentBp(tally) },
    targetPct: input.targetPct,
    safeAbsences: safeAbsences(tally, input.targetPct),
    classesToReach: classesToReach(tally, input.targetPct),
    remaining,
    reachableThisTerm: reachableThisTerm(tally, input.targetPct, remaining),
    bestCaseBp: remaining !== null ? bestCase(tally, remaining) : null,
    scenario: { miss: input.miss, attend: input.attend, ...after, percentBp: percentBp(after), meetsTarget: meetsTarget(after, input.targetPct) },
    ifMiss: simulate(tally, 'miss', counts, input.targetPct),
    ifAttend: simulate(tally, 'attend', counts, input.targetPct),
  });
});
