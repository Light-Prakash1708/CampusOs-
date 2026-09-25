import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, NotFoundError, ok, parseBody, withAuth } from '@/lib/api';
import { getRequestMetadata } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { assertOfferingBelongsToFaculty } from '../../../_lib/attendance';

/**
 * GRADING — the human-authority boundary.
 * ---------------------------------------------------------------------------
 * `submissions.ai_suggested_score` is advisory and is NEVER copied into
 * `submissions.score` by any background process. The only way a score exists
 * is a request that arrives here carrying an explicit `source`:
 *
 *   ACCEPT_AI_SUGGESTION — the marker read the suggestion and agreed with it.
 *                          The value used is re-read from the database, not
 *                          taken from the request, so the client cannot pass
 *                          off an arbitrary number as "the AI's score".
 *   MANUAL               — the marker typed a score, whether or not a
 *                          suggestion existed.
 *
 * Either way `ai_suggestion_reviewed` becomes true, which is what makes the
 * "unreviewed AI suggestion" queue meaningful.
 */

const Body = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('ACCEPT_AI_SUGGESTION'),
    feedback: z.string().trim().max(4000).optional(),
  }),
  z.object({
    source: z.literal('MANUAL'),
    score: z.number().min(0).max(1000),
    feedback: z.string().trim().max(4000).optional(),
    rubricScores: z.record(z.string(), z.number()).optional(),
  }),
]);

export const POST = withAuth('assignment:evaluate', async (request, { user, params }) => {
  const input = await parseBody(request, Body);
  const id = params.id;
  if (!id) throw new NotFoundError('Submission');

  const [row] = await db
    .select({
      submission: t.submissions,
      assignmentId: t.assignments.id,
      assignmentTitle: t.assignments.title,
      assignmentStatus: t.assignments.status,
      maxScore: t.assignments.maxScore,
      offeringId: t.assignments.offeringId,
      rollNumber: t.studentProfiles.rollNumber,
    })
    .from(t.submissions)
    .innerJoin(t.assignments, eq(t.assignments.id, t.submissions.assignmentId))
    .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.submissions.studentId))
    .where(
      and(eq(t.submissions.id, id), eq(t.submissions.institutionId, user.institutionId)),
    )
    .limit(1);

  if (!row) throw new NotFoundError('Submission');
  await assertOfferingBelongsToFaculty(user, row.offeringId);

  if (row.submission.status === 'NOT_SUBMITTED') {
    throw new AppError(
      'This student has not submitted anything yet, so there is nothing to grade.',
      400,
      'NOTHING_SUBMITTED',
      undefined,
      'You can record a zero once the deadline has passed by closing the assignment.',
    );
  }

  const maxScore = Number(row.maxScore);
  let score: number;

  if (input.source === 'ACCEPT_AI_SUGGESTION') {
    if (row.submission.aiSuggestedScore === null) {
      throw new AppError(
        'There is no AI suggestion on this submission to accept.',
        400,
        'NO_AI_SUGGESTION',
        undefined,
        'Enter a score yourself instead.',
      );
    }
    // Read the suggestion from the record, never from the request body.
    score = Number(row.submission.aiSuggestedScore);
  } else {
    score = input.score;
  }

  if (score > maxScore) {
    throw new AppError(
      `A score of ${score} is above the maximum of ${maxScore} for this assignment.`,
      400,
      'SCORE_ABOVE_MAX',
      { maxScore },
      'Enter a score between 0 and the maximum.',
    );
  }

  await db
    .update(t.submissions)
    .set({
      score: score.toFixed(2),
      feedback:
        input.feedback ??
        (input.source === 'ACCEPT_AI_SUGGESTION' ? row.submission.aiFeedback : null),
      rubricScores:
        input.source === 'MANUAL'
          ? (input.rubricScores ?? row.submission.rubricScores)
          : (row.submission.aiRubricScores ?? row.submission.rubricScores),
      evaluatedById: user.userId,
      evaluatedAt: new Date(),
      status: 'EVALUATED',
      // True regardless of the decision: a human has now looked at it.
      aiSuggestionReviewed:
        row.submission.aiSuggestedScore !== null ? true : row.submission.aiSuggestionReviewed,
    })
    .where(eq(t.submissions.id, id));

  const meta = await getRequestMetadata();
  await recordAudit(user, {
    action: 'SUBMISSION_EVALUATED',
    entityType: 'submission',
    entityId: id,
    before: { score: row.submission.score, status: row.submission.status },
    after: {
      score: score.toFixed(2),
      source: input.source,
      aiSuggestedScore: row.submission.aiSuggestedScore,
      assignment: row.assignmentTitle,
      student: row.rollNumber,
    },
    reason:
      input.source === 'ACCEPT_AI_SUGGESTION'
        ? 'Marker accepted the AI suggested score.'
        : 'Marker entered the score.',
    ...meta,
  });

  return ok({
    id,
    score: score.toFixed(2),
    source: input.source,
    aiSuggestedScore: row.submission.aiSuggestedScore,
  });
});

export const dynamic = 'force-dynamic';
