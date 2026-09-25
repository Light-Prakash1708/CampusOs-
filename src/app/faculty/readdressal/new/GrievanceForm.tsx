'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, LifeBuoy } from 'lucide-react';
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
import { useMutation } from '../../_components/useMutation';
import { MutationError } from '../../_components/MutationError';

export interface FacultyCategory {
  id: string;
  name: string;
  description: string | null;
  responseSlaHours: number;
  resolutionSlaHours: number;
  allowAnonymous: boolean;
  isSensitive: boolean;
}

const URGENCIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;

export function GrievanceForm({ categories }: { categories: FacultyCategory[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id ?? '');
  const [subject, setSubject] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [urgency, setUrgency] = React.useState<string>('NORMAL');
  const [isAnonymous, setIsAnonymous] = React.useState(false);

  const mutation = useMutation<{ id: string; caseNumber: string }>({ refresh: false });
  const category = categories.find((c) => c.id === categoryId);

  const canSubmit =
    !!categoryId && subject.trim().length >= 5 && description.trim().length >= 20;

  if (categories.length === 0) {
    return (
      <Card>
        <CardBody>
          <Alert tone="warning" title="No category is open to faculty">
            Your institution has not enabled any readdressal category that faculty may raise. Ask
            your administrator to configure one.
          </Alert>
        </CardBody>
      </Card>
    );
  }

  if (mutation.succeeded && mutation.data) {
    return (
      <Card>
        <CardBody>
          <Alert
            tone="success"
            icon={CheckCircle2}
            title={`Raised as ${mutation.data.caseNumber}`}
          >
            Your case is recorded with a response deadline. You will see every status change on the
            case page.
          </Alert>
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              onClick={() => router.push(`/faculty/readdressal/${mutation.data!.id}`)}
            >
              Open the case
            </Button>
            <Button variant="secondary" onClick={() => router.push('/faculty/readdressal')}>
              Back to all cases
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Raise a case"
        description="Cases are never deleted. Every status change is recorded against the case."
        icon={LifeBuoy}
      />
      <CardBody className="space-y-4">
        <Field label="Category" htmlFor="gr-cat" required>
          <Select id="gr-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        {category ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-sunken px-3 py-2">
            <Badge tone="outline">
              first response within {pluralize(category.responseSlaHours, 'hour')}
            </Badge>
            <Badge tone="outline">
              resolution target {pluralize(category.resolutionSlaHours, 'hour')}
            </Badge>
            {category.isSensitive ? <Badge tone="warning">handled confidentially</Badge> : null}
            {category.description ? (
              <p className="w-full text-[12.5px] text-muted">{category.description}</p>
            ) : null}
          </div>
        ) : null}

        <Field
          label="Subject"
          htmlFor="gr-subject"
          required
          hint="One line that says what the problem is."
        >
          <Input
            id="gr-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Projector not working in Room 204"
            maxLength={200}
          />
        </Field>

        <Field
          label="What happened"
          htmlFor="gr-desc"
          required
          hint="Dates, rooms, class codes and anything you have already tried. At least 20 characters."
        >
          <Textarea
            id="gr-desc"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field label="Urgency" htmlFor="gr-urg">
          <Select id="gr-urg" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
            {URGENCIES.map((u) => (
              <option key={u} value={u}>
                {u.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>

        {category?.allowAnonymous ? (
          <label className="flex items-start gap-2 text-[13px] text-default">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[hsl(var(--border-strong))]"
            />
            <span>
              Raise this anonymously. Handlers will not see your name, and ordinary administrators
              cannot reveal it.
            </span>
          </label>
        ) : null}

        <MutationError error={mutation.error} title="The case was not raised" />
      </CardBody>
      <CardFooter>
        <div className="flex gap-2">
          <Button
            variant="primary"
            loading={mutation.pending}
            disabled={!canSubmit}
            onClick={() =>
              mutation.run('/api/grievances', {
                body: {
                  categoryId,
                  subject: subject.trim(),
                  description: description.trim(),
                  urgency,
                  isAnonymous,
                },
              })
            }
          >
            Raise the case
          </Button>
          <Button variant="ghost" onClick={() => router.push('/faculty/readdressal')}>
            Cancel
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
