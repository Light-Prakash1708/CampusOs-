'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, DownloadCloud, X } from 'lucide-react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

const TRACK_LABEL: Record<string, string> = {
  NONE: 'Not tracking',
  SAVED: 'Saved',
  APPLIED: 'Applied',
  INTERVIEWING: 'Interviewing',
  OFFER: 'Offer',
  REJECTED: 'Not selected',
  WITHDRAWN: 'Withdrawn',
};

/** My private status for one listing. */
export function TrackSelect({ opportunityId, status, title }: { opportunityId: string; status: string | null; title: string }) {
  const router = useRouter();
  const api = useApi<{ status: string | null }>();
  const [value, setValue] = React.useState(status ?? 'NONE');
  return (
    <div className="space-y-1">
      <label className="block">
        <span className="sr-only">Your status for {title}</span>
        <select
          value={value}
          disabled={api.loading}
          onChange={async (e) => {
            const next = e.target.value;
            const prev = value;
            setValue(next);
            if (!(await api.call(`/api/opportunities/${opportunityId}/track`, { status: next }))) setValue(prev);
            else router.refresh();
          }}
          className="h-11 rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-2.5 text-[13px] font-semibold text-default"
        >
          {Object.entries(TRACK_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <ErrorBox error={api.error} />
    </div>
  );
}

export function OpportunityForm({ staff, departments = [] }: { staff: boolean; departments?: { id: string; name: string }[] }) {
  const router = useRouter();
  const api = useApi<{ id: string; status: string }>();
  const empty = { kind: 'INTERNSHIP', title: '', organization: '', description: '', location: '', workMode: 'ONSITE', compensation: '', applyUrl: '', deadline: '', eligibility: '', skills: '', departmentId: '' };
  const [f, setF] = React.useState(empty);
  const [done, setDone] = React.useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(null);
        const res = await api.call('/api/opportunities', {
          kind: f.kind,
          title: f.title,
          organization: f.organization,
          description: f.description || null,
          location: f.location || null,
          workMode: f.workMode,
          compensation: f.compensation || null,
          applyUrl: f.applyUrl || null,
          deadline: f.deadline ? new Date(f.deadline).toISOString() : null,
          eligibility: f.eligibility || null,
          skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean),
          departmentId: f.departmentId || null,
        });
        if (res) {
          setF(empty);
          setDone(res.status === 'PUBLISHED' ? 'Published.' : 'Sent for approval. You’ll get a notification when it’s reviewed.');
          router.refresh();
        }
      }}
    >
      <Field label="Type" htmlFor="op-kind">
        <Select id="op-kind" value={f.kind} onChange={set('kind')}>
          <option value="INTERNSHIP">Internship</option>
          <option value="JOB">Job</option>
          <option value="HACKATHON">Hackathon</option>
          <option value="COMPETITION">Competition</option>
          <option value="SCHOLARSHIP">Scholarship</option>
          <option value="FELLOWSHIP">Fellowship</option>
        </Select>
      </Field>
      <Field label="Work mode" htmlFor="op-mode">
        <Select id="op-mode" value={f.workMode} onChange={set('workMode')}>
          <option value="ONSITE">On site</option>
          <option value="REMOTE">Remote</option>
          <option value="HYBRID">Hybrid</option>
        </Select>
      </Field>
      <Field label="Title" htmlFor="op-title" required error={api.fieldError('title')}>
        <Input id="op-title" value={f.title} onChange={set('title')} required maxLength={200} placeholder="Finance intern (summer)" />
      </Field>
      <Field label="Organisation" htmlFor="op-org" required error={api.fieldError('organization')}>
        <Input id="op-org" value={f.organization} onChange={set('organization')} required maxLength={200} />
      </Field>
      <Field label="Link to apply" htmlFor="op-url" hint="The organiser’s own page" error={api.fieldError('applyUrl')}>
        <Input id="op-url" type="url" value={f.applyUrl} onChange={set('applyUrl')} maxLength={500} placeholder="https://" />
      </Field>
      <Field label="Apply by" htmlFor="op-deadline" error={api.fieldError('deadline')}>
        <Input id="op-deadline" type="datetime-local" value={f.deadline} onChange={set('deadline')} />
      </Field>
      <Field label="Location" htmlFor="op-loc">
        <Input id="op-loc" value={f.location} onChange={set('location')} maxLength={200} placeholder="Salt Lake, Kolkata" />
      </Field>
      <Field label="Stipend / prize" htmlFor="op-comp" hint="As the organiser states it">
        <Input id="op-comp" value={f.compensation} onChange={set('compensation')} maxLength={200} />
      </Field>
      <Field label="Skills asked for" htmlFor="op-skills" hint="Comma separated — used to show students their match" className="sm:col-span-2">
        <Input id="op-skills" value={f.skills} onChange={set('skills')} maxLength={600} placeholder="Excel, Financial modelling" />
      </Field>
      {staff && departments.length ? (
        <Field label="Only for a department (optional)" htmlFor="op-dept">
          <Select id="op-dept" value={f.departmentId} onChange={set('departmentId')}>
            <option value="">Whole college</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Details" htmlFor="op-desc" className="sm:col-span-2">
        <Textarea id="op-desc" rows={3} value={f.description} onChange={set('description')} maxLength={5000} />
      </Field>
      <Field label="Eligibility" htmlFor="op-elig" className="sm:col-span-2">
        <Input id="op-elig" value={f.eligibility} onChange={set('eligibility')} maxLength={2000} placeholder="2nd/3rd-year BBA, CGPA 7+" />
      </Field>
      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <p role="status" aria-live="polite" className="text-[12.5px] font-bold text-mint-ink">
          {done ?? (staff ? 'Published straight away as your college.' : 'A moderator checks each submission before other students see it.')}
        </p>
        <Button type="submit" variant="primary" loading={api.loading} className="min-h-[44px]">
          {staff ? 'Publish' : 'Submit for review'}
        </Button>
      </div>
      <div className="sm:col-span-2">
        <ErrorBox error={api.error} />
      </div>
    </form>
  );
}

export function ModerateControls({ opportunityId, status }: { opportunityId: string; status: string }) {
  const router = useRouter();
  const api = useApi<{ status: string }>();
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const act = async (action: 'APPROVE' | 'REJECT' | 'CLOSE') => {
    if (await api.call(`/api/opportunities/${opportunityId}/moderate`, { action, note: note || null })) router.refresh();
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === 'PENDING' ? (
          <>
            <Button variant="primary" loading={api.loading} onClick={() => act('APPROVE')} className="min-h-[44px]">
              <Check size={15} aria-hidden /> Publish
            </Button>
            <Button variant="ghost" onClick={() => setRejecting((v) => !v)} className="min-h-[44px]">
              <X size={15} aria-hidden /> Reject…
            </Button>
          </>
        ) : status === 'PUBLISHED' ? (
          <Button variant="secondary" loading={api.loading} onClick={() => act('CLOSE')} className="min-h-[44px]">
            Close
          </Button>
        ) : null}
      </div>
      {rejecting ? (
        <div className="flex flex-wrap gap-2">
          <label className="min-w-[200px] flex-1">
            <span className="sr-only">Reason</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (sent to the submitter)" maxLength={500} className="h-11" />
          </label>
          <Button variant="danger" disabled={note.trim().length < 5} loading={api.loading} onClick={() => act('REJECT')} className="min-h-[44px]">
            Reject
          </Button>
        </div>
      ) : null}
      <ErrorBox error={api.error} />
    </div>
  );
}

export function ImportFeedButton({ feedName }: { feedName: string | null }) {
  const router = useRouter();
  const api = useApi<{ fetched: number; imported: number; skipped: number; invalid: number }>();
  const [msg, setMsg] = React.useState<string | null>(null);
  if (!feedName) {
    return <p className="text-[12.5px] text-subtle">No opportunities feed is configured. An administrator can connect one (see docs/CAREER.md); until then, add listings by hand.</p>;
  }
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        loading={api.loading}
        onClick={async () => {
          const r = await api.call('/api/opportunities/import', {});
          if (r) {
            setMsg(`${r.imported} new for review · ${r.skipped} already imported or past deadline${r.invalid ? ` · ${r.invalid} invalid` : ''}`);
            router.refresh();
          }
        }}
        className="min-h-[44px]"
      >
        <DownloadCloud size={15} aria-hidden /> Import from {feedName}
      </Button>
      <p role="status" aria-live="polite" className="text-[12.5px] font-bold text-mint-ink">
        {msg}
      </p>
      <ErrorBox error={api.error} />
    </div>
  );
}

export function CareerGoalPicker({ roles, current }: { roles: { id: string; title: string }[]; current: string | null }) {
  const router = useRouter();
  const api = useApi<{ careerRoleId: string | null }>();
  const [value, setValue] = React.useState(current ?? '');
  if (!roles.length) return <p className="text-[13px] text-subtle">Your college hasn’t added any career roles yet.</p>;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await api.call('/api/career/goal', { careerRoleId: value || null })) router.refresh();
      }}
    >
      <Field label="Target role" htmlFor="goal-role" className="min-w-[220px] flex-1">
        <Select id="goal-role" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">No goal</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="primary" loading={api.loading} disabled={value === (current ?? '')} className="min-h-[44px]">
        Save goal
      </Button>
      <div className="basis-full">
        <ErrorBox error={api.error} />
      </div>
    </form>
  );
}
