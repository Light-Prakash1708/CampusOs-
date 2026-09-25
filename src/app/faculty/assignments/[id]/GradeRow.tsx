'use client';

import * as React from 'react';
import { Check, PencilLine, Sparkles, X } from 'lucide-react';
import {
  AiLabel,
  Alert,
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  Textarea,
} from '@/components/ui';
import { cn, formatDateTime, humanize, num } from '@/lib/utils';
import { useMutation } from '../../_components/useMutation';
import { MutationError } from '../../_components/MutationError';

export interface RubricCriterion {
  criterion: string;
  maxScore: number;
  descriptor?: string;
}

export interface GradeRowSubmission {
  id: string;
  studentName: string;
  rollNumber: string;
  avatarUrl: string | null;
  status: string;
  submittedAt: string | null;
  content: string | null;
  attachmentCount: number;
  score: string | null;
  feedback: string | null;
  aiSuggestedScore: string | null;
  aiFeedback: string | null;
  aiRubricScores: Record<string, number> | null;
  aiSuggestionReviewed: boolean;
  similarityScore: string | null;
  similarityNotes: string | null;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  EVALUATED: 'success',
  RETURNED: 'success',
  SUBMITTED: 'warning',
  RESUBMITTED: 'warning',
  LATE: 'danger',
  NOT_SUBMITTED: 'neutral',
};

/**
 * One student's submission and its grading controls.
 *
 * The AI suggestion is rendered as a suggestion: labelled, visually separated,
 * and inert. It becomes the real score only when the marker presses "Accept" —
 * which sends a request the server records as a human decision — or is
 * replaced by a score the marker types.
 */
export function GradeRow({
  submission,
  maxScore,
  rubric,
}: {
  submission: GradeRowSubmission;
  maxScore: number;
  rubric: RubricCriterion[];
}) {
  const [mode, setMode] = React.useState<'idle' | 'manual'>('idle');
  const [score, setScore] = React.useState('');
  const [feedback, setFeedback] = React.useState(submission.feedback ?? '');
  const [rubricScores, setRubricScores] = React.useState<Record<string, string>>({});
  const mutation = useMutation<{ score: string; source: string }>();

  const graded = submission.score !== null;
  const canGrade = submission.status !== 'NOT_SUBMITTED';
  const hasSuggestion = submission.aiSuggestedScore !== null;
  const suggestionPending = hasSuggestion && !submission.aiSuggestionReviewed && !graded;

  const rubricTotal = rubric.reduce((sum, r) => sum + (Number(rubricScores[r.criterion]) || 0), 0);
  const effectiveScore = rubric.length > 0 ? rubricTotal : Number(score);
  const scoreValid =
    Number.isFinite(effectiveScore) &&
    effectiveScore >= 0 &&
    effectiveScore <= maxScore &&
    (rubric.length > 0 || score.trim() !== '');

  async function submitManual() {
    await mutation.run(`/api/faculty/submissions/${submission.id}/grade`, {
      body: {
        source: 'MANUAL',
        score: effectiveScore,
        feedback: feedback.trim() || undefined,
        rubricScores:
          rubric.length > 0
            ? Object.fromEntries(
                rubric.map((r) => [r.criterion, Number(rubricScores[r.criterion]) || 0]),
              )
            : undefined,
      },
    });
    if (!mutation.error) setMode('idle');
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={submission.studentName} src={submission.avatarUrl} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-default">{submission.studentName}</p>
          <p className="text-[12px] text-muted">
            {submission.rollNumber}
            {submission.submittedAt
              ? ` · submitted ${formatDateTime(submission.submittedAt)}`
              : ' · nothing submitted'}
            {submission.attachmentCount > 0
              ? ` · ${submission.attachmentCount} attachment${submission.attachmentCount === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {submission.similarityScore !== null ? (
            <Badge tone={Number(submission.similarityScore) > 40 ? 'warning' : 'neutral'}>
              {num(submission.similarityScore)}% similarity
            </Badge>
          ) : null}
          <Badge tone={STATUS_TONE[submission.status] ?? 'neutral'}>
            {humanize(submission.status)}
          </Badge>
          <span
            className={cn(
              'tabular text-[13.5px] font-semibold',
              graded ? 'text-default' : 'text-subtle',
            )}
          >
            {graded ? `${num(submission.score)} / ${num(maxScore)}` : `— / ${num(maxScore)}`}
          </span>
        </div>
      </div>

      {submission.content ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12.5px] text-brand">
            Show what the student wrote
          </summary>
          <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-surface-sunken p-3 text-[13px] leading-relaxed text-default">
            {submission.content}
          </p>
        </details>
      ) : null}

      {hasSuggestion ? (
        <div
          className={cn(
            'mt-3 rounded-lg border p-3',
            suggestionPending
              ? 'border-[hsl(var(--info-border))] bg-info-subtle'
              : 'border-[hsl(var(--border))] bg-surface-muted',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-info" aria-hidden />
              <span className="text-[13px] font-semibold text-default">
                Suggested score {num(submission.aiSuggestedScore)} / {num(maxScore)}
              </span>
              <AiLabel state={submission.aiSuggestionReviewed ? 'approved' : 'suggestion'} />
            </div>
            {suggestionPending ? (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="primary"
                  icon={Check}
                  loading={mutation.pending}
                  onClick={() =>
                    mutation.run(`/api/faculty/submissions/${submission.id}/grade`, {
                      body: { source: 'ACCEPT_AI_SUGGESTION' },
                    })
                  }
                >
                  Accept as the score
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={PencilLine}
                  onClick={() => setMode('manual')}
                >
                  Override
                </Button>
              </div>
            ) : (
              <Badge tone="neutral">reviewed</Badge>
            )}
          </div>
          {submission.aiFeedback ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-default">
              {submission.aiFeedback}
            </p>
          ) : null}
          <p className="mt-2 text-[11.5px] text-subtle">
            This is a suggestion only. It is not this student&rsquo;s score, and nothing applies it
            automatically — accepting or overriding is recorded as your decision.
          </p>
        </div>
      ) : null}

      {mutation.succeeded && mutation.data ? (
        <Alert tone="success" className="mt-3" title="Score recorded">
          {num(mutation.data.score)} / {num(maxScore)} —{' '}
          {mutation.data.source === 'ACCEPT_AI_SUGGESTION'
            ? 'you accepted the AI suggestion, which is logged as your decision.'
            : 'entered by you.'}
        </Alert>
      ) : null}

      <div className="mt-3">
        <MutationError error={mutation.error} title="The score was not saved" />
      </div>

      {mode === 'manual' && canGrade ? (
        <div className="mt-3 rounded-lg border border-[hsl(var(--border-strong))] bg-surface-muted p-3">
          {rubric.length > 0 ? (
            <div className="space-y-2">
              {rubric.map((r) => (
                <div key={r.criterion} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                  <div>
                    <p className="text-[13px] font-medium text-default">{r.criterion}</p>
                    {r.descriptor ? (
                      <p className="text-[12px] text-muted">{r.descriptor}</p>
                    ) : null}
                    {submission.aiRubricScores?.[r.criterion] !== undefined ? (
                      <p className="text-[11.5px] text-info">
                        AI suggested {submission.aiRubricScores[r.criterion]}
                      </p>
                    ) : null}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={r.maxScore}
                    step="0.5"
                    value={rubricScores[r.criterion] ?? ''}
                    placeholder={`0–${r.maxScore}`}
                    aria-label={`Score for ${r.criterion}`}
                    onChange={(e) =>
                      setRubricScores((prev) => ({ ...prev, [r.criterion]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <p className="text-[12.5px] text-muted">
                Total {rubricTotal} of {num(maxScore)}.
              </p>
            </div>
          ) : (
            <Field label="Score" htmlFor={`score-${submission.id}`} required>
              <Input
                id={`score-${submission.id}`}
                type="number"
                min={0}
                max={maxScore}
                step="0.5"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder={`0 – ${num(maxScore)}`}
              />
            </Field>
          )}

          <Field label="Feedback" htmlFor={`feedback-${submission.id}`} className="mt-3">
            <Textarea
              id={`feedback-${submission.id}`}
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What the student did well and what to fix."
            />
          </Field>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={mutation.pending}
              disabled={!scoreValid}
              onClick={submitManual}
            >
              Save score
            </Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => setMode('idle')}>
              Cancel
            </Button>
            {!scoreValid ? (
              <span className="text-[12px] text-subtle">
                Enter a score between 0 and {num(maxScore)}.
              </span>
            ) : null}
          </div>
        </div>
      ) : canGrade ? (
        <div className="mt-3">
          <Button
            size="sm"
            variant={graded ? 'ghost' : 'secondary'}
            icon={PencilLine}
            onClick={() => setMode('manual')}
          >
            {graded ? 'Change the score' : 'Enter a score'}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] text-subtle">
          Nothing has been submitted, so there is nothing to grade yet.
        </p>
      )}
    </li>
  );
}
