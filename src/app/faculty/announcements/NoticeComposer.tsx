'use client';

import * as React from 'react';
import { CheckCircle2, Megaphone, Plus } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { pluralize } from '@/lib/utils';
import { useMutation } from '../_components/useMutation';
import { MutationError } from '../_components/MutationError';

const CATEGORIES = ['ACADEMIC', 'EVENT', 'EXAMINATION', 'PLACEMENT', 'FACILITY', 'GENERAL'] as const;

export function NoticeComposer({
  sections,
}: {
  sections: { id: string; label: string; students: number }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [category, setCategory] = React.useState<string>('ACADEMIC');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [requiresAck, setRequiresAck] = React.useState(false);

  const mutation = useMutation<{ reference: string; recipients: number; status: string }>();

  const canSubmit = title.trim().length >= 5 && body.trim().length >= 10 && selected.length > 0;
  const reach = sections
    .filter((s) => selected.includes(s.id))
    .reduce((sum, s) => sum + s.students, 0);

  if (sections.length === 0) {
    return (
      <Alert tone="info" title="No sections to address">
        An informational notice from you goes to the sections you teach. You have none allocated
        this term.
      </Alert>
    );
  }

  if (!open) {
    return (
      <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
        Write a notice
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Informational notice"
        description="Goes to your own sections. It carries no institutional authority — official notices come from the academic office."
        icon={Megaphone}
        action={
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <Field label="Title" htmlFor="nt-title" required>
          <Input
            id="nt-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Extra class on Saturday for capital budgeting"
            maxLength={200}
          />
        </Field>
        <Field label="Notice" htmlFor="nt-body" required>
          <Textarea
            id="nt-body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What students need to know, and what they need to do."
          />
        </Field>
        <Field label="Category" htmlFor="nt-cat">
          <Select id="nt-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset>
          <legend className="mb-2 block text-[13px] font-medium text-default">
            Sections<span className="ml-0.5 text-danger">*</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => {
              const on = selected.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] ${
                    on
                      ? 'border-[hsl(var(--brand-border))] bg-brand-subtle text-brand'
                      : 'border-[hsl(var(--border-strong))] text-default'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={on}
                    onChange={() =>
                      setSelected((prev) =>
                        on ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                      )
                    }
                  />
                  {s.label}
                  <span className="text-[11.5px] opacity-70">{s.students}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-[13px] text-default">
          <input
            type="checkbox"
            checked={requiresAck}
            onChange={(e) => setRequiresAck(e.target.checked)}
            className="h-4 w-4 rounded border-[hsl(var(--border-strong))]"
          />
          Require students to acknowledge that they have read it
        </label>

        {selected.length > 0 ? (
          <Badge tone="info">
            Reaches {pluralize(reach, 'student')} across{' '}
            {pluralize(selected.length, 'section')}
          </Badge>
        ) : null}

        <MutationError error={mutation.error} title="The notice was not published" />
        {mutation.succeeded && mutation.data ? (
          <Alert tone="success" icon={CheckCircle2} title={`Published as ${mutation.data.reference}`}>
            Delivered to {pluralize(mutation.data.recipients, 'recipient')}.
          </Alert>
        ) : null}
      </CardBody>
      <CardFooter>
        <div className="flex gap-2">
          <Button
            variant="primary"
            loading={mutation.pending}
            disabled={!canSubmit}
            onClick={() =>
              mutation.run('/api/faculty/announcements', {
                body: {
                  title: title.trim(),
                  body: body.trim(),
                  category,
                  sectionIds: selected,
                  requiresAcknowledgement: requiresAck,
                },
              })
            }
          >
            Publish to my sections
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
