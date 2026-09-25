import { z } from 'zod';
import { withAuth, ok, parseBody, AppError } from '@/lib/api';
import { generateTimetable } from '@/services/timetable/generate';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { parseTimetableConstraints } from '@/services/timetable/nl';

const Body = z.object({
  termId: z.string().uuid().optional(),
  name: z.string().trim().max(120).optional(),
  /** Free-text scheduling requirements, translated to structured constraints. */
  requirements: z.string().trim().max(2000).optional(),
  timeLimitMs: z.number().int().min(1000).max(60_000).optional(),
  seed: z.number().int().optional(),
});

/**
 * Runs the constraint solver and stores the result as a PROPOSED version.
 * Never touches the published timetable — publishing is a separate, approved
 * step.
 */
export const POST = withAuth('timetable:generate', async (request, { user }) => {
  const input = await parseBody(request, Body);

  let termId = input.termId;
  if (!termId) {
    const [term] = await db
      .select({ id: t.terms.id })
      .from(t.terms)
      .where(and(eq(t.terms.institutionId, user.institutionId), eq(t.terms.isCurrent, true)))
      .limit(1);
    if (!term) {
      throw new AppError(
        'No current academic term is configured.',
        400,
        'NO_TERM',
        undefined,
        'Set the current term in Settings before generating a timetable.',
      );
    }
    termId = term.id;
  }

  // Natural language → structured constraints (rule-based; see nl.ts).
  const parsed = input.requirements
    ? await parseTimetableConstraints(user, input.requirements)
    : { constraints: [], interpreted: [], unrecognised: [] };

  const { versionId, result } = await generateTimetable(user, {
    termId,
    name: input.name,
    constraints: parsed.constraints,
    timeLimitMs: input.timeLimitMs,
    seed: input.seed,
  });

  return ok({
    versionId,
    report: result.report,
    unplaced: result.unplaced,
    interpretedConstraints: parsed.interpreted,
    unrecognisedRequirements: parsed.unrecognised,
  });
});
