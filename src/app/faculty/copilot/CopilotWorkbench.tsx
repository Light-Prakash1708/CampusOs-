'use client';

import * as React from 'react';
import {
  BookMarked,
  CheckCircle2,
  ListChecks,
  PencilLine,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import {
  AiLabel,
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EstimateChip,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { minutesToHuman } from '@/lib/utils';
import { useMutation } from '../_components/useMutation';
import { MutationError } from '../_components/MutationError';
import { asPlanContent, type LessonPlanContent } from './planTypes';

export interface CopilotOffering {
  id: string;
  subjectId: string;
  label: string;
}

type PlanState =
  | { phase: 'idle' }
  | { phase: 'draft'; content: LessonPlanContent; provider: string; isLanguageModel: boolean }
  | {
      phase: 'saved';
      id: string;
      content: LessonPlanContent;
      savedMinutes: number;
      estimatedManualMinutes: number;
      published: boolean;
    };

export const COPILOT_DURATIONS = [30, 45, 55, 60, 90, 120];
const DURATIONS = COPILOT_DURATIONS;

export function CopilotWorkbench({
  offerings,
  baselineMinutes,
}: {
  offerings: CopilotOffering[];
  /**
   * Minutes of manual work the institution's baseline attributes to a plan of
   * each supported length. Computed on the server from the same function the
   * save endpoint uses, so the estimate shown matches the estimate stored.
   */
  baselineMinutes: Record<string, number>;
}) {
  const [offeringId, setOfferingId] = React.useState(offerings[0]?.id ?? '');
  const [topic, setTopic] = React.useState('');
  const [duration, setDuration] = React.useState(55);
  const [state, setState] = React.useState<PlanState>({ phase: 'idle' });
  const [editing, setEditing] = React.useState(false);
  const startedAtRef = React.useRef<number | null>(null);

  const generate = useMutation<{
    content: Record<string, unknown>;
    provider: string;
    isLanguageModel: boolean;
  }>({ refresh: false });
  const save = useMutation<{
    id: string;
    savedMinutes: number;
    estimatedManualMinutes: number;
  }>({ refresh: false });
  const publish = useMutation<{ id: string; status: string }>({ refresh: false });

  const offering = offerings.find((o) => o.id === offeringId);
  const canGenerate = !!offering && topic.trim().length >= 3;

  async function runGenerate() {
    if (!canGenerate || !offering) return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    setEditing(false);
    const data = await generate.run('/api/faculty/copilot', {
      body: {
        subjectId: offering.subjectId,
        offeringId: offering.id,
        topic: topic.trim(),
        durationMinutes: duration,
      },
    });
    if (data) {
      setState({
        phase: 'draft',
        content: asPlanContent(data.content),
        provider: data.provider,
        isLanguageModel: data.isLanguageModel,
      });
    }
  }

  async function runSave() {
    if (state.phase !== 'draft' || !offering) return;
    const elapsedSeconds = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : 0;
    const data = await save.run('/api/faculty/lesson-plans', {
      body: {
        title: `${topic.trim()} — ${offering.label}`,
        topic: topic.trim(),
        durationMinutes: duration,
        subjectId: offering.subjectId,
        offeringId: offering.id,
        content: state.content as unknown as Record<string, unknown>,
        elapsedSeconds,
      },
    });
    if (data) {
      setState({
        phase: 'saved',
        id: data.id,
        content: state.content,
        savedMinutes: data.savedMinutes,
        estimatedManualMinutes: data.estimatedManualMinutes,
        published: false,
      });
    }
  }

  async function runPublish() {
    if (state.phase !== 'saved') return;
    const data = await publish.run(`/api/faculty/lesson-plans/${state.id}`, {
      method: 'PATCH',
      body: { action: 'publish' },
    });
    if (data) setState({ ...state, published: true });
  }

  async function saveEdits(next: LessonPlanContent) {
    if (state.phase === 'saved') {
      const data = await publish.run(`/api/faculty/lesson-plans/${state.id}`, {
        method: 'PATCH',
        body: { action: 'update', content: next as unknown as Record<string, unknown> },
      });
      if (data) setState({ ...state, content: next, published: false });
    } else if (state.phase === 'draft') {
      setState({ ...state, content: next });
    }
    setEditing(false);
  }

  if (offerings.length === 0) {
    return (
      <Card>
        <CardBody>
          <Alert tone="warning" title="No class to plan for">
            The copilot plans against a subject you teach. You have no active class allocations this
            term.
          </Alert>
        </CardBody>
      </Card>
    );
  }

  const content = state.phase === 'idle' ? null : state.content;
  const baseline = baselineMinutes[String(duration)] ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Prepare my class" icon={Sparkles} />
          <CardBody className="space-y-4">
            <Field label="Class" htmlFor="cop-offering" required>
              <Select
                id="cop-offering"
                value={offeringId}
                onChange={(e) => setOfferingId(e.target.value)}
              >
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Topic" htmlFor="cop-topic" required hint="What you are teaching.">
              <Input
                id="cop-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Weighted average cost of capital"
                maxLength={160}
              />
            </Field>
            <Field label="Period length" htmlFor="cop-duration">
              <Select
                id="cop-duration"
                value={String(duration)}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </Select>
            </Field>
            <MutationError error={generate.error} title="No plan was produced" />
          </CardBody>
          <CardFooter>
            <Button
              variant="primary"
              icon={state.phase === 'idle' ? Sparkles : RefreshCw}
              className="w-full"
              loading={generate.pending}
              disabled={!canGenerate}
              onClick={runGenerate}
            >
              {generate.pending
                ? 'Preparing…'
                : state.phase === 'idle'
                  ? 'Generate a plan'
                  : 'Regenerate'}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardBody>
            <p className="text-[12.5px] text-muted">
              Preparing a {duration}-minute plan by hand is estimated at{' '}
              <EstimateChip>{minutesToHuman(baseline)}</EstimateChip> at this institution&rsquo;s
              baseline. The saved plan records the time you actually spent here, and the difference
              is written to the productivity ledger as an estimate — never as a measured fact.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="min-w-0">
        {state.phase === 'idle' ? (
          <Card>
            <CardBody>
              <div className="flex flex-col items-center py-10 text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-subtle">
                  <BookMarked size={20} className="text-brand" aria-hidden />
                </span>
                <p className="text-sm font-medium text-default">No plan yet</p>
                <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
                  Pick a class and a topic, then generate. The draft is yours to edit before
                  anything is saved.
                </p>
              </div>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-default">
                  {topic} · {duration} min
                </h2>
                <AiLabel
                  state={state.phase === 'saved' && state.published ? 'approved' : 'generated'}
                />
                {state.phase === 'saved' ? (
                  <Badge tone={state.published ? 'success' : 'warning'}>
                    {state.published ? 'published' : 'saved, not published'}
                  </Badge>
                ) : (
                  <Badge tone="outline">not saved</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={PencilLine}
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? 'Stop editing' : 'Edit'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={RefreshCw}
                  loading={generate.pending}
                  onClick={runGenerate}
                >
                  Regenerate
                </Button>
                {state.phase === 'draft' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Save}
                    loading={save.pending}
                    onClick={runSave}
                  >
                    Save
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Send}
                    loading={publish.pending}
                    disabled={state.published}
                    onClick={runPublish}
                  >
                    {state.published ? 'Published' : 'Publish'}
                  </Button>
                )}
              </div>
            </div>

            <div className="mb-4 space-y-3">
              <MutationError error={save.error} title="The plan was not saved" />
              <MutationError error={publish.error} title="That change was not applied" />
              {state.phase === 'draft' && !state.isLanguageModel ? (
                <Alert
                  tone="warning"
                  icon={TriangleAlert}
                  title="Produced by the offline scaffold, not a language model"
                >
                  No language model is configured for this institution ({state.provider}), so this
                  is a structural skeleton built from the subject&rsquo;s recorded outcomes. The
                  teaching content still has to be written by you.
                </Alert>
              ) : null}
              {content?._note ? (
                <Alert tone="info" title="About this draft">
                  {content._note}
                </Alert>
              ) : null}
              {state.phase === 'saved' ? (
                <Alert
                  tone={state.published ? 'success' : 'info'}
                  icon={state.published ? CheckCircle2 : ListChecks}
                  title={state.published ? 'Published' : 'Saved for review'}
                >
                  {state.published
                    ? 'You have approved this plan. It is no longer labelled as unreviewed AI output.'
                    : 'Stored as pending review. It stays labelled as AI output until you publish it.'}{' '}
                  Estimated time saved:{' '}
                  <EstimateChip>{minutesToHuman(state.savedMinutes)}</EstimateChip> against a
                  baseline of {minutesToHuman(state.estimatedManualMinutes)}.
                </Alert>
              ) : null}
            </div>

            {editing && content ? (
              <PlanEditor
                content={content}
                pending={publish.pending}
                onCancel={() => setEditing(false)}
                onSave={saveEdits}
              />
            ) : content ? (
              <PlanView content={content} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Read view -------------------------------- */

export function PlanView({ content }: { content: LessonPlanContent }) {
  const totalMinutes = (content.structure ?? []).reduce((sum, s) => sum + s.minutes, 0);

  return (
    <div className="space-y-4">
      <PlanSection title="Learning objectives" empty="No objectives were produced.">
        {content.objectives?.length ? (
          <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-default">
            {content.objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        ) : null}
      </PlanSection>

      <PlanSection
        title={`Structure${totalMinutes > 0 ? ` · ${totalMinutes} min accounted for` : ''}`}
        empty="No timing structure was produced."
      >
        {content.structure?.length ? (
          <ol className="space-y-2">
            {content.structure.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="tabular w-14 shrink-0 text-[13px] font-semibold text-brand">
                  {s.minutes} min
                </span>
                <span className="text-[13.5px] leading-relaxed text-default">{s.activity}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </PlanSection>

      <PlanSection title="Worked examples" empty="No examples were produced.">
        {content.keyExamples?.length ? (
          <ul className="space-y-3">
            {content.keyExamples.map((e, i) => (
              <li key={i}>
                <p className="text-[13.5px] font-medium text-default">{e.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{e.detail}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </PlanSection>

      <PlanSection title="Common misconceptions" empty="No misconceptions were produced.">
        {content.misconceptions?.length ? (
          <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-default">
            {content.misconceptions.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        ) : null}
      </PlanSection>

      <PlanSection title="Quick quiz" empty="No quiz questions were produced.">
        {content.quiz?.length ? (
          <ol className="space-y-2.5">
            {content.quiz.map((q, i) => (
              <li key={i}>
                <p className="text-[13.5px] text-default">
                  {i + 1}. {q.q}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted">Answer: {q.a || 'not supplied'}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </PlanSection>

      <PlanSection title="Homework" empty="No homework was produced.">
        {content.homework ? (
          <p className="text-[13.5px] leading-relaxed text-default">{content.homework}</p>
        ) : null}
      </PlanSection>

      {content.remedial ? (
        <PlanSection title="For students who struggle" empty="">
          <p className="text-[13.5px] leading-relaxed text-default">{content.remedial}</p>
        </PlanSection>
      ) : null}
    </div>
  );
}

function PlanSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>{children ?? <p className="text-[13px] text-subtle">{empty}</p>}</CardBody>
    </Card>
  );
}

/* -------------------------------- Editor ---------------------------------- */

function PlanEditor({
  content,
  pending,
  onSave,
  onCancel,
}: {
  content: LessonPlanContent;
  pending: boolean;
  onSave: (next: LessonPlanContent) => void;
  onCancel: () => void;
}) {
  const [objectives, setObjectives] = React.useState((content.objectives ?? []).join('\n'));
  const [structure, setStructure] = React.useState(
    (content.structure ?? []).map((s) => `${s.minutes} | ${s.activity}`).join('\n'),
  );
  const [examples, setExamples] = React.useState(
    (content.keyExamples ?? []).map((e) => `${e.title} | ${e.detail}`).join('\n'),
  );
  const [misconceptions, setMisconceptions] = React.useState(
    (content.misconceptions ?? []).join('\n'),
  );
  const [quiz, setQuiz] = React.useState(
    (content.quiz ?? []).map((q) => `${q.q} | ${q.a}`).join('\n'),
  );
  const [homework, setHomework] = React.useState(content.homework ?? '');
  const [remedial, setRemedial] = React.useState(content.remedial ?? '');

  const lines = (value: string) =>
    value
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

  function build(): LessonPlanContent {
    return {
      ...content,
      objectives: lines(objectives),
      structure: lines(structure).map((line) => {
        const [mins, ...rest] = line.split('|');
        return { minutes: Number(mins?.trim()) || 0, activity: rest.join('|').trim() };
      }),
      keyExamples: lines(examples).map((line) => {
        const [title, ...rest] = line.split('|');
        return { title: (title ?? '').trim(), detail: rest.join('|').trim() };
      }),
      misconceptions: lines(misconceptions),
      quiz: lines(quiz).map((line) => {
        const [q, ...rest] = line.split('|');
        return { q: (q ?? '').trim(), a: rest.join('|').trim() };
      }),
      homework: homework.trim(),
      remedial: remedial.trim(),
    };
  }

  return (
    <Card>
      <CardHeader
        title="Edit the plan"
        description="One item per line. Where a line has two parts, separate them with a vertical bar."
      />
      <CardBody className="space-y-4">
        <Field label="Objectives" htmlFor="ed-obj" hint="One per line.">
          <Textarea id="ed-obj" rows={4} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
        </Field>
        <Field label="Structure" htmlFor="ed-str" hint="minutes | activity">
          <Textarea id="ed-str" rows={6} value={structure} onChange={(e) => setStructure(e.target.value)} />
        </Field>
        <Field label="Worked examples" htmlFor="ed-ex" hint="title | detail">
          <Textarea id="ed-ex" rows={4} value={examples} onChange={(e) => setExamples(e.target.value)} />
        </Field>
        <Field label="Misconceptions" htmlFor="ed-mis" hint="One per line.">
          <Textarea
            id="ed-mis"
            rows={4}
            value={misconceptions}
            onChange={(e) => setMisconceptions(e.target.value)}
          />
        </Field>
        <Field label="Quiz" htmlFor="ed-quiz" hint="question | answer">
          <Textarea id="ed-quiz" rows={4} value={quiz} onChange={(e) => setQuiz(e.target.value)} />
        </Field>
        <Field label="Homework" htmlFor="ed-hw">
          <Textarea id="ed-hw" rows={2} value={homework} onChange={(e) => setHomework(e.target.value)} />
        </Field>
        <Field label="For students who struggle" htmlFor="ed-rem">
          <Textarea id="ed-rem" rows={2} value={remedial} onChange={(e) => setRemedial(e.target.value)} />
        </Field>
      </CardBody>
      <CardFooter>
        <div className="flex gap-2">
          <Button variant="primary" icon={Save} loading={pending} onClick={() => onSave(build())}>
            Apply edits
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
