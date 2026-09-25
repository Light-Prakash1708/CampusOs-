'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus, Save, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Divider,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { num } from '@/lib/utils';
import { useMutation } from '../../_components/useMutation';
import { MutationError } from '../../_components/MutationError';

export interface FormOffering {
  id: string;
  label: string;
  students: number;
}

interface RubricRow {
  key: string;
  criterion: string;
  maxScore: string;
  descriptor: string;
}

function newRow(): RubricRow {
  return {
    key: Math.random().toString(36).slice(2),
    criterion: '',
    maxScore: '',
    descriptor: '',
  };
}

export function NewAssignmentForm({
  offerings,
  defaultOfferingId,
  suggestedSkills,
}: {
  offerings: FormOffering[];
  defaultOfferingId: string | null;
  suggestedSkills: string[];
}) {
  const router = useRouter();
  const [offeringId, setOfferingId] = React.useState(
    defaultOfferingId ?? offerings[0]?.id ?? '',
  );
  const [title, setTitle] = React.useState('');
  const [instructions, setInstructions] = React.useState('');
  const [maxScore, setMaxScore] = React.useState('20');
  const [dueAt, setDueAt] = React.useState('');
  const [allowLate, setAllowLate] = React.useState(true);
  const [rubric, setRubric] = React.useState<RubricRow[]>([]);
  const [skillTags, setSkillTags] = React.useState<string[]>([]);
  const [skillInput, setSkillInput] = React.useState('');

  const mutation = useMutation<{ id: string; status: string; studentsNotified: number }>({
    refresh: false,
  });

  const selected = offerings.find((o) => o.id === offeringId);
  const rubricTotal = rubric.reduce((sum, r) => sum + (Number(r.maxScore) || 0), 0);
  const rubricMismatch =
    rubric.length > 0 && Math.abs(rubricTotal - Number(maxScore || 0)) > 0.001;

  const titleValid = title.trim().length >= 3;
  const scoreValid = Number(maxScore) > 0;
  const rubricRowsValid = rubric.every((r) => r.criterion.trim() && Number(r.maxScore) > 0);
  const canSubmit = !!offeringId && titleValid && scoreValid && !rubricMismatch && rubricRowsValid;

  async function save(publish: boolean) {
    if (!canSubmit) return;
    const data = await mutation.run('/api/faculty/assignments', {
      body: {
        offeringId,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        maxScore: Number(maxScore),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        allowLateSubmission: allowLate,
        rubric: rubric.map((r) => ({
          criterion: r.criterion.trim(),
          maxScore: Number(r.maxScore),
          descriptor: r.descriptor.trim() || undefined,
        })),
        skillTags,
        publish,
      },
    });
    if (data) router.push(`/faculty/assignments/${data.id}`);
  }

  function addSkill(value: string) {
    const tag = value.trim();
    if (!tag || skillTags.includes(tag) || skillTags.length >= 15) return;
    setSkillTags((prev) => [...prev, tag]);
    setSkillInput('');
  }

  if (offerings.length === 0) {
    return (
      <Card>
        <CardBody>
          <Alert tone="warning" title="No class to attach this to">
            An assignment belongs to a class. You have no active class allocations this term, so
            there is nothing to create an assignment against.
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="The basics" />
          <CardBody className="space-y-4">
            <Field label="Class" htmlFor="offering" required>
              <Select
                id="offering"
                value={offeringId}
                onChange={(e) => setOfferingId(e.target.value)}
              >
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} ({o.students} students)
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Title"
              htmlFor="title"
              required
              error={title.length > 0 && !titleValid ? 'At least 3 characters.' : undefined}
            >
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Capital budgeting problem set"
                maxLength={200}
              />
            </Field>

            <Field
              label="Instructions"
              htmlFor="instructions"
              hint="What students must do, and what they must hand in."
            >
              <Textarea
                id="instructions"
                rows={6}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Set out the task, the expected format and any constraints."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Maximum score"
                htmlFor="maxScore"
                required
                error={maxScore !== '' && !scoreValid ? 'Must be greater than zero.' : undefined}
              >
                <Input
                  id="maxScore"
                  type="number"
                  min={1}
                  max={1000}
                  step="0.5"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </Field>
              <Field
                label="Due date and time"
                htmlFor="dueAt"
                hint="Leave blank for no deadline."
              >
                <Input
                  id="dueAt"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-default">
              <input
                type="checkbox"
                checked={allowLate}
                onChange={(e) => setAllowLate(e.target.checked)}
                className="h-4 w-4 rounded border-[hsl(var(--border-strong))]"
              />
              Accept late submissions (marked LATE, still gradable)
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Rubric"
            description="Optional. When present, the rows must add up to the maximum score."
            action={
              <Button
                size="sm"
                variant="secondary"
                icon={Plus}
                onClick={() => setRubric((prev) => [...prev, newRow()])}
              >
                Add row
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {rubric.length === 0 ? (
              <p className="text-[13px] text-muted">
                No rubric rows. Grading will be a single score out of {num(maxScore)}.
              </p>
            ) : (
              rubric.map((row, index) => (
                <div
                  key={row.key}
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)_40px]"
                >
                  <Input
                    value={row.criterion}
                    onChange={(e) =>
                      setRubric((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, criterion: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Criterion"
                    aria-label={`Criterion ${index + 1}`}
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={row.maxScore}
                    onChange={(e) =>
                      setRubric((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, maxScore: e.target.value } : r)),
                      )
                    }
                    placeholder="Max"
                    aria-label={`Maximum for criterion ${index + 1}`}
                  />
                  <Input
                    value={row.descriptor}
                    onChange={(e) =>
                      setRubric((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, descriptor: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="What earns full marks"
                    aria-label={`Descriptor ${index + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={Trash2}
                    aria-label={`Remove criterion ${index + 1}`}
                    onClick={() => setRubric((prev) => prev.filter((_, i) => i !== index))}
                  />
                </div>
              ))
            )}
            {rubric.length > 0 ? (
              <p
                className={`text-[12.5px] ${rubricMismatch ? 'text-danger' : 'text-muted'}`}
              >
                Rubric total {rubricTotal} of {num(maxScore)}.
                {rubricMismatch ? ' These must match before you can save.' : ''}
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Skill tags"
            description="Feeds the student skill graph when the work is graded."
          />
          <CardBody className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSkill(skillInput);
                  }
                }}
                placeholder="Add a skill"
                aria-label="Add a skill tag"
              />
              <Button variant="secondary" onClick={() => addSkill(skillInput)}>
                Add
              </Button>
            </div>
            {skillTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {skillTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSkillTags((prev) => prev.filter((s) => s !== tag))}
                    aria-label={`Remove ${tag}`}
                  >
                    <Badge tone="brand">{tag} ×</Badge>
                  </button>
                ))}
              </div>
            ) : null}
            {suggestedSkills.length > 0 ? (
              <>
                <Divider label="From this subject" />
                <div className="flex flex-wrap gap-1.5">
                  {suggestedSkills
                    .filter((s) => !skillTags.includes(s))
                    .map((s) => (
                      <button key={s} type="button" onClick={() => addSkill(s)}>
                        <Badge tone="outline">+ {s}</Badge>
                      </button>
                    ))}
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Publish" />
          <CardBody className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted">
              Publishing makes the assignment visible to{' '}
              <strong>{selected?.students ?? 0} students</strong> in {selected?.label ?? 'this class'}{' '}
              and creates a submission slot for each of them. A draft is visible only to you.
            </p>
            <MutationError error={mutation.error} title="The assignment was not created" />
            {mutation.succeeded && mutation.data ? (
              <Alert tone="success" icon={CheckCircle2} title="Created">
                Saved as {mutation.data.status.toLowerCase()}
                {mutation.data.studentsNotified > 0
                  ? `, ${mutation.data.studentsNotified} submission slots created`
                  : ''}
                . Opening it now…
              </Alert>
            ) : null}
          </CardBody>
          <CardFooter>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon={Save}
                loading={mutation.pending}
                disabled={!canSubmit}
                onClick={() => save(true)}
              >
                Publish
              </Button>
              <Button
                variant="secondary"
                disabled={!canSubmit || mutation.pending}
                onClick={() => save(false)}
              >
                Save as draft
              </Button>
              <Button asChild variant="ghost">
                <Link href="/faculty/assignments">Cancel</Link>
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
