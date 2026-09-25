'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Input } from '@/components/ui';
import { humanize, pluralize, relativeTime } from '@/lib/utils';

interface Approval {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  impactSummary: Record<string, unknown> | null;
  createdAt: string;
  requester: string;
}

export function ApprovalList({ approvals }: { approvals: Approval[] }) {
  return (
    <div className="space-y-3">
      {approvals.map((approval) => (
        <ApprovalCard key={approval.id} approval={approval} />
      ))}
    </div>
  );
}

function ApprovalCard({ approval }: { approval: Approval }) {
  const router = useRouter();
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState<'APPROVED' | 'REJECTED' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: approval.id, decision, note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(`${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}`);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  const impact = approval.impactSummary ?? {};

  return (
    <Card>
      <CardHeader
        title={approval.title}
        description={`Requested by ${approval.requester} · ${relativeTime(approval.createdAt)}`}
        action={<Badge tone="warning">{humanize(approval.kind)}</Badge>}
      />
      <CardBody className="space-y-3">
        {approval.description ? (
          <p className="text-[13.5px] leading-relaxed text-default">{approval.description}</p>
        ) : null}

        {Object.keys(impact).length > 0 ? (
          <div className="rounded-lg border border-[hsl(var(--border))] bg-surface-muted p-3">
            <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-subtle">
              Impact if approved
            </p>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {Object.entries(impact).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3 text-[13px]">
                  <dt className="text-muted">{humanize(key.replace(/([A-Z])/g, '_$1'))}</dt>
                  <dd className="font-medium text-default">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note — shown to the requester"
        />

        {error ? (
          <Alert tone="danger" icon={AlertTriangle}>
            {error}
          </Alert>
        ) : null}

        <div className="flex gap-2">
          <Button
            variant="primary"
            icon={Check}
            loading={busy === 'APPROVED'}
            disabled={busy !== null}
            onClick={() => decide('APPROVED')}
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            icon={X}
            loading={busy === 'REJECTED'}
            disabled={busy !== null}
            onClick={() => decide('REJECTED')}
          >
            Reject
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
