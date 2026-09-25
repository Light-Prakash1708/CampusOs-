'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Lock, MessageSquare, Send, Timer } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Field, Select, Textarea,
} from '@/components/ui';
import { formatDateTime, humanize, relativeTime } from '@/lib/utils';

interface Detail {
  id: string;
  caseNumber: string;
  subject: string;
  description: string;
  status: string;
  urgency: string;
  category: string;
  isAnonymous: boolean;
  raisedByName: string | null;
  raisedByRole: string | null;
  assignedToName: string | null;
  assignedToId: string | null;
  createdAt: string;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  resolvedAt: string | null;
  isSlaBreached: boolean;
  slaHoursRemaining: number | null;
  resolutionSummary: string | null;
  escalationLevel: number;
  messages: { id: string; body: string; authorName: string | null; isInternalNote: boolean; createdAt: string }[];
  timeline: { kind: string; fromValue: string | null; toValue: string | null; note: string | null; actorName: string | null; isSystemGenerated: boolean; createdAt: string }[];
  allowedTransitions: string[];
}

export function CaseWorkbench({
  detail, canAssign, canResolve, staff,
}: {
  detail: Detail;
  canAssign: boolean;
  canResolve: boolean;
  staff: { id: string; name: string; role: string; departmentCode: string | null }[];
}) {
  const router = useRouter();
  const [reply, setReply] = React.useState('');
  const [isInternal, setIsInternal] = React.useState(false);
  const [posting, setPosting] = React.useState(false);
  const [transitionTo, setTransitionTo] = React.useState('');
  const [resolutionSummary, setResolutionSummary] = React.useState('');
  const [assignTo, setAssignTo] = React.useState(detail.assignedToId ?? '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function postReply() {
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/grievances/${detail.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply, isInternalNote: isInternal }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(`${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}`);
        return;
      }
      setReply('');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setPosting(false);
    }
  }

  async function applyTransition() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grievances/${detail.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: transitionTo,
          resolutionSummary: transitionTo === 'RESOLVED' ? resolutionSummary : undefined,
          assignToId: assignTo && assignTo !== detail.assignedToId ? assignTo : undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(`${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}`);
        return;
      }
      setTransitionTo('');
      setResolutionSummary('');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader
            title="The issue as reported"
            description={
              detail.raisedByName
                ? `${detail.raisedByName}${detail.raisedByRole ? ` · ${humanize(detail.raisedByRole)}` : ''} · ${relativeTime(detail.createdAt)}`
                : `Anonymous · ${relativeTime(detail.createdAt)}`
            }
          />
          <CardBody>
            {/*
              Reported text is untrusted content. It is rendered as plain text,
              never as markup, and never interpreted as an instruction anywhere
              in the system.
            */}
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-default">
              {detail.description}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Conversation" icon={MessageSquare} />
          <CardBody className="space-y-3">
            {detail.messages.length === 0 ? (
              <p className="text-[13px] text-muted">No replies yet.</p>
            ) : (
              detail.messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.isInternalNote
                      ? 'rounded-lg border border-[hsl(var(--warning-border))] bg-warning-subtle p-3'
                      : 'rounded-lg border border-[hsl(var(--border))] bg-surface-muted p-3'
                  }
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[12.5px] font-medium text-default">
                      {m.authorName ?? 'Anonymous'}
                    </span>
                    {m.isInternalNote ? (
                      <Badge tone="warning" icon={Lock}>Internal note</Badge>
                    ) : null}
                    <span className="text-[11.5px] text-subtle">{relativeTime(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-default">
                    {m.body}
                  </p>
                </div>
              ))
            )}

            <div className="space-y-2 border-t border-[hsl(var(--border))] pt-3">
              <Textarea
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to the person who raised this…"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {canResolve ? (
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-[hsl(var(--border-strong))] accent-[hsl(var(--brand))]"
                    />
                    Internal note — not visible to the person who raised this
                  </label>
                ) : <span />}
                <Button
                  variant="primary"
                  size="sm"
                  icon={Send}
                  loading={posting}
                  disabled={reply.trim().length < 2}
                  onClick={postReply}
                >
                  Post reply
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Case history" description="Immutable — nothing here can be edited or removed" />
          <CardBody>
            <ol className="space-y-3">
              {detail.timeline.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      e.kind.includes('BREACH') ? 'bg-danger' : e.isSystemGenerated ? 'bg-warning' : 'bg-brand'
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] text-default">
                      <span className="font-medium">{humanize(e.kind)}</span>
                      {e.fromValue && e.toValue ? (
                        <span className="text-muted">
                          {' '}
                          — {humanize(e.fromValue)} → {humanize(e.toValue)}
                        </span>
                      ) : null}
                    </p>
                    {e.note ? <p className="text-[12.5px] text-muted">{e.note}</p> : null}
                    <p className="text-[11.5px] text-subtle">
                      {e.isSystemGenerated ? 'System' : (e.actorName ?? 'Anonymous')} ·{' '}
                      {formatDateTime(e.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      {/* --------------------------- side panel --------------------------- */}
      <div className="space-y-5">
        <Card>
          <CardHeader title="Status" />
          <CardBody className="space-y-3">
            <Row label="Current" value={<Badge tone="neutral">{humanize(detail.status)}</Badge>} />
            <Row label="Urgency" value={<Badge tone="warning">{humanize(detail.urgency)}</Badge>} />
            <Row
              label="Assigned to"
              value={<span className="text-[13px] text-default">{detail.assignedToName ?? 'Unassigned'}</span>}
            />
            <Row
              label="Resolution due"
              value={
                detail.isSlaBreached ? (
                  <Badge tone="danger">Past deadline</Badge>
                ) : detail.slaHoursRemaining !== null ? (
                  <span
                    className={`tabular text-[13px] ${detail.slaHoursRemaining < 12 ? 'text-warning' : 'text-default'}`}
                  >
                    {detail.slaHoursRemaining}h remaining
                  </span>
                ) : (
                  <span className="text-[13px] text-subtle">—</span>
                )
              }
            />
            {detail.resolvedAt ? (
              <Row
                label="Resolved"
                value={<span className="text-[13px] text-default">{relativeTime(detail.resolvedAt)}</span>}
              />
            ) : null}
          </CardBody>
        </Card>

        {canResolve || canAssign ? (
          <Card>
            <CardHeader title="Take action" />
            <CardBody className="space-y-3">
              {canAssign ? (
                <Field label="Assign to">
                  <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {humanize(s.role)}
                        {s.departmentCode ? ` (${s.departmentCode})` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <Field label="Move to" hint="Only valid next steps are offered.">
                <Select value={transitionTo} onChange={(e) => setTransitionTo(e.target.value)}>
                  <option value="">Choose…</option>
                  {detail.allowedTransitions.map((s) => (
                    <option key={s} value={s}>{humanize(s)}</option>
                  ))}
                </Select>
              </Field>

              {transitionTo === 'RESOLVED' ? (
                <Field label="Resolution summary" required hint="Shown to the person who raised this.">
                  <Textarea
                    rows={3}
                    value={resolutionSummary}
                    onChange={(e) => setResolutionSummary(e.target.value)}
                    placeholder="What was found, and what has been done about it."
                  />
                </Field>
              ) : null}

              {error ? <Alert tone="danger" icon={AlertTriangle}>{error}</Alert> : null}

              <Button
                variant="primary"
                className="w-full"
                loading={busy}
                disabled={
                  (!transitionTo && assignTo === (detail.assignedToId ?? '')) ||
                  (transitionTo === 'RESOLVED' && resolutionSummary.trim().length < 10)
                }
                onClick={applyTransition}
              >
                Apply
              </Button>

              {detail.allowedTransitions.length === 0 ? (
                <p className="text-[12px] text-subtle">
                  This case is closed to further status changes. It remains on record permanently.
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-muted">{label}</span>
      {value}
    </div>
  );
}
