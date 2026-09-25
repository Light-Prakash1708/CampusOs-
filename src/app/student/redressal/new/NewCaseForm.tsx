'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Info, Send, ShieldCheck } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  ErrorState,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { pluralize } from '@/lib/utils';

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  responseSlaHours: number;
  resolutionSlaHours: number;
  allowAnonymous: boolean;
  isSensitive: boolean;
}

interface FieldErrors {
  [field: string]: string | undefined;
}

/**
 * Raises a redressal case. Posts to the shared `/api/grievances` route, which
 * owns case numbering, SLA computation and routing — this form never invents
 * any of those.
 */
export function NewCaseForm({
  categories,
  anonymousEnabled,
  initial,
}: {
  categories: CategoryOption[];
  anonymousEnabled: boolean;
  initial: {
    categoryId: string;
    subject: string;
    description: string;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
  };
}) {
  const router = useRouter();

  const [categoryId, setCategoryId] = React.useState(initial.categoryId);
  const [subject, setSubject] = React.useState(initial.subject);
  const [description, setDescription] = React.useState(initial.description);
  const [urgency, setUrgency] = React.useState('NORMAL');
  const [isAnonymous, setAnonymous] = React.useState(false);
  const [contactMethod, setContactMethod] = React.useState('IN_APP');

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const canBeAnonymous = anonymousEnabled && !!category?.allowAnonymous;

  React.useEffect(() => {
    if (!canBeAnonymous && isAnonymous) setAnonymous(false);
  }, [canBeAnonymous, isAnonymous]);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!categoryId) next.categoryId = 'Choose the category that fits best.';
    if (subject.trim().length < 5) next.subject = 'Give a subject of at least 5 characters.';
    if (description.trim().length < 20) {
      next.description = 'Describe what happened in at least 20 characters.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/grievances', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          subject: subject.trim(),
          description: description.trim(),
          urgency,
          isAnonymous,
          preferredContactMethod: contactMethod,
          ...(initial.relatedEntityType && initial.relatedEntityId
            ? {
                relatedEntityType: initial.relatedEntityType,
                relatedEntityId: initial.relatedEntityId,
              }
            : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: { id?: string; caseNumber?: string };
        error?: {
          message?: string;
          hint?: string;
          details?: { field: string; message: string }[];
        };
      } | null;

      if (!response.ok || !payload?.ok) {
        const details = payload?.error?.details;
        if (Array.isArray(details) && details.length > 0) {
          setFieldErrors(
            Object.fromEntries(details.map((d) => [d.field, d.message])) as FieldErrors,
          );
        }
        setError({
          message:
            payload?.error?.message ?? `The case could not be created (HTTP ${response.status}).`,
          hint: payload?.error?.hint,
        });
        return;
      }

      const id = payload.data?.id;
      router.push(id ? `/student/redressal/${id}` : '/student/redressal');
      router.refresh();
    } catch {
      setError({
        message: 'Could not reach the server.',
        hint: 'Nothing was submitted. Check your connection and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (categories.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-default">No categories are open to students</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Your institution has not enabled any redressal category for student accounts, so a
            case cannot be raised from here. Contact the administration office directly.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Card>
        <CardBody className="space-y-4">
          <Field
            label="Category"
            htmlFor="category"
            required
            error={fieldErrors.categoryId}
            hint={category?.description ?? 'Routing and deadlines are set by the category.'}
          >
            <Select
              id="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-invalid={!!fieldErrors.categoryId}
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          {category ? (
            <Alert tone="info" icon={Info} title="What happens after you submit">
              This case is routed by the {category.name.toLowerCase()} rules. The institution has{' '}
              {pluralize(category.responseSlaHours, 'working hour')} to respond and{' '}
              {pluralize(category.resolutionSlaHours, 'working hour')} to resolve it. If either
              deadline passes, the case escalates automatically.
            </Alert>
          ) : null}

          <Field label="Subject" htmlFor="subject" required error={fieldErrors.subject}>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="One line that says what the issue is"
              maxLength={160}
              aria-invalid={!!fieldErrors.subject}
            />
          </Field>

          <Field
            label="What happened"
            htmlFor="description"
            required
            error={fieldErrors.description}
            hint="Dates, subject codes and names help the reviewer act without coming back to you."
          >
            <Textarea
              id="description"
              rows={7}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue, when it happened, and what outcome you are asking for."
              maxLength={4000}
              aria-invalid={!!fieldErrors.description}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Urgency"
              htmlFor="urgency"
              hint="Be honest — inflated urgency slows down genuinely urgent cases."
            >
              <Select id="urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="LOW">Low — can wait</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High — affects my studies now</option>
                <option value="CRITICAL">Critical — safety or deadline at risk</option>
              </Select>
            </Field>

            <Field
              label="Preferred contact"
              htmlFor="contact"
              hint="Where you would like the handler to reach you."
            >
              <Select
                id="contact"
                value={contactMethod}
                onChange={(e) => setContactMethod(e.target.value)}
              >
                <option value="IN_APP">In CampusOS</option>
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
              </Select>
            </Field>
          </div>

          {canBeAnonymous ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[hsl(var(--border))] bg-surface-muted p-3">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--brand))]"
              />
              <span>
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-default">
                  <ShieldCheck size={14} className="text-subtle" aria-hidden />
                  Raise this anonymously
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
                  Handlers will not see your name. You will still be able to follow the case here.
                  Ordinary administrators cannot reveal your identity.
                </span>
              </span>
            </label>
          ) : category && !category.allowAnonymous ? (
            <p className="text-[12.5px] text-subtle">
              This category does not accept anonymous reports — the handler needs to be able to
              come back to you.
            </p>
          ) : null}

          {initial.relatedEntityType && initial.relatedEntityId ? (
            <p className="rounded-md bg-surface-sunken px-3 py-2 text-[12px] text-subtle">
              This case will be linked to the record you came from, so the reviewer can open it
              directly.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {error ? <ErrorState message={error.message} hint={error.hint} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" icon={Send} loading={submitting}>
          {submitting ? 'Submitting…' : 'Submit case'}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/student/redressal">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
