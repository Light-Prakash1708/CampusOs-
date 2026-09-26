'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';

function iso(d: Date) {
  return new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Choose a period and download the evidence pack ZIP. */
export function EvidencePackForm({ canIndividual }: { canIndividual: boolean }) {
  const today = React.useMemo(() => new Date(), []);
  const [from, setFrom] = React.useState(iso(new Date(today.getTime() - 180 * 86_400_000)));
  const [to, setTo] = React.useState(iso(today));
  const [individual, setIndividual] = React.useState(false);
  const href = `/api/reports/evidence?from=${from}&to=${to}${individual ? '&individual=1' : ''}`;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From" htmlFor="ev-from">
          <Input id="ev-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="ev-to">
          <Input id="ev-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {canIndividual ? (
        <label className="flex items-start gap-2 text-[13px] text-default">
          <input type="checkbox" className="mt-1" checked={individual} onChange={(e) => setIndividual(e.target.checked)} />
          <span>
            Include individual student rows (attendance by student). <span className="text-muted">Only when you need them — this export is recorded in the audit log.</span>
          </span>
        </label>
      ) : null}
      <Button asChild variant="primary" icon={Download}>
        <a href={href} download>Download evidence pack (.zip)</a>
      </Button>
    </div>
  );
}
