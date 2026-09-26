'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

export function FeatureToggle({ flag, label, enabled }: { flag: string; label: string; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = React.useState(enabled);
  const api = useApi();
  async function toggle() {
    const next = !on;
    setOn(next);
    const data = await api.call('/api/admin/settings/features', { flags: { [flag]: next } }, 'PATCH');
    if (!data) setOn(!next);
    else router.refresh();
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${on ? 'enabled' : 'disabled'}`}
      title={api.error?.message}
      onClick={toggle}
      disabled={api.loading}
      className={`relative h-6 w-10 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand))] disabled:opacity-60 ${on ? 'bg-brand' : 'bg-[hsl(var(--border-strong))]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function RegistrationPolicyForm({
  initial,
}: {
  initial: { mode: 'DISABLED' | 'EMAIL_DOMAIN' | 'ADMIN_APPROVAL'; allowedDomains: string[]; isListed: boolean; idDocument?: 'REQUIRED' | 'OPTIONAL' };
}) {
  const router = useRouter();
  const api = useApi();
  const [mode, setMode] = React.useState(initial.mode);
  const [domains, setDomains] = React.useState(initial.allowedDomains.join(', '));
  const [listed, setListed] = React.useState(initial.isListed);
  const [idDocument, setIdDocument] = React.useState(initial.idDocument ?? 'OPTIONAL');
  const [saved, setSaved] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const data = await api.call(
      '/api/admin/settings/registration',
      {
        mode,
        allowedDomains: domains.split(/[,\s]+/).map((d) => d.trim()).filter(Boolean),
        isListed: listed,
        idDocument,
      },
      'PATCH',
    );
    if (data) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <ErrorBox error={api.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who can create an account" htmlFor="reg-mode">
          <Select id="reg-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="DISABLED">Invitation or import only</option>
            <option value="EMAIL_DOMAIN">Students with a college email address</option>
            <option value="ADMIN_APPROVAL">Anyone, after an administrator approves</option>
          </Select>
        </Field>
        <Field label="College email domains" htmlFor="reg-domains" hint="e.g. kbi.edu.in — required for email-domain registration; otherwise a verification signal" error={api.fieldError('allowedDomains')}>
          <Input id="reg-domains" value={domains} onChange={(e) => setDomains(e.target.value)} />
        </Field>
        {mode !== 'DISABLED' ? (
          <Field label="College ID with join requests" htmlFor="reg-id" hint="Existing CampusOS students asking to join always need your approval">
            <Select id="reg-id" value={idDocument} onChange={(e) => setIdDocument(e.target.value as typeof idDocument)}>
              <option value="OPTIONAL">Optional</option>
              <option value="REQUIRED">Required</option>
            </Select>
          </Field>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-[13px] text-default">
        <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
        List this college on the public registration page
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={api.loading}>Save registration settings</Button>
        {saved ? <span className="text-[12.5px] text-success" role="status">Saved</span> : null}
      </div>
    </form>
  );
}

/**
 * Attendance rules (attendance:configure). "Apply to current classes" also
 * resets every current-term class to the default minimum and recomputes all
 * affected students' summaries — so it asks for confirmation first.
 */
export function AttendancePolicyForm({
  initial,
}: {
  initial: { defaultMinimumPct: number; warningMarginPct: number; aggregateMinimumPct: number | null };
}) {
  const router = useRouter();
  const api = useApi<{ classesUpdated: number }>();
  const [min, setMin] = React.useState(String(initial.defaultMinimumPct));
  const [margin, setMargin] = React.useState(String(initial.warningMarginPct));
  const [aggregate, setAggregate] = React.useState(initial.aggregateMinimumPct === null ? '' : String(initial.aggregateMinimumPct));
  const [apply, setApply] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setDone(null);
    const data = await api.call(
      '/api/admin/settings/attendance',
      {
        defaultMinimumPct: Number(min),
        warningMarginPct: Number(margin),
        aggregateMinimumPct: aggregate.trim() === '' ? null : Number(aggregate),
        applyToCurrentTerm: apply,
      },
      'PUT',
    );
    if (data) {
      setDone(apply ? `Saved. ${data.classesUpdated} current classes now use ${min}%, and students’ figures were recomputed.` : 'Saved.');
      setApply(false);
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <ErrorBox error={api.error} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Default minimum (%)" htmlFor="att-min" hint="Your college’s standard requirement per subject.">
          <Input id="att-min" type="number" min={1} max={100} step={0.5} value={min} onChange={(e) => setMin(e.target.value)} />
        </Field>
        <Field label="“Close to the line” margin (points)" htmlFor="att-margin" hint="Students within this many points of a minimum are warned.">
          <Input id="att-margin" type="number" min={0} max={25} step={0.5} value={margin} onChange={(e) => setMargin(e.target.value)} />
        </Field>
        <Field label="Overall minimum (%)" htmlFor="att-agg" hint="Optional: also require this across all subjects. Leave empty if not.">
          <Input id="att-agg" type="number" min={1} max={100} step={0.5} value={aggregate} onChange={(e) => setAggregate(e.target.value)} placeholder="Not required" />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] p-3 text-[13px]">
        <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} className="mt-0.5 h-5 w-5" />
        <span>
          <span className="font-bold text-default">Also apply the default minimum to every class this term</span>
          <span className="block text-muted">Replaces each current class’s own minimum and recomputes every student’s attendance status. Recorded attendance is not changed. This is audited.</span>
        </span>
      </label>
      {done ? (
        <p className="text-[13px] font-semibold text-mint-ink" role="status">
          {done}
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={api.loading}>
        Save attendance rules
      </Button>
    </form>
  );
}
