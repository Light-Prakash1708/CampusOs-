'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileCheck2, Search, ShieldCheck, Upload } from 'lucide-react';
import { Badge, Button, Card, CardBody, Field, Input, Select } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';
import { formatDate } from '@/lib/utils';

interface College {
  slug: string;
  name: string;
  shortName: string | null;
  city: string | null;
  state: string | null;
  idDocument: string | null;
}
interface Structure {
  departments: { id: string; name: string }[];
  programs: { id: string; name: string; departmentId: string; durationYears: number }[];
  sections: { id: string; name: string; programId: string; year: number }[];
}

const MAX_ID_MB = 8;
const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';

/** Search → pick the college → placement (+ college ID) → send. */
export function JoinCollegeFlow({ storage }: { storage: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<College[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [college, setCollege] = React.useState<College | null>(null);
  const [structure, setStructure] = React.useState<Structure | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [departmentId, setDepartmentId] = React.useState('');
  const [programId, setProgramId] = React.useState('');
  const [year, setYear] = React.useState('1');
  const [sectionId, setSectionId] = React.useState('');
  const [rollNumber, setRollNumber] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const api = useApi<{ id: string }>();

  const search = React.useCallback(async (term: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/student/membership/institutions?q=${encodeURIComponent(term)}`);
      const json = await res.json();
      setResults(json.ok ? json.data : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  React.useEffect(() => {
    const id = setTimeout(() => search(q), 250);
    return () => clearTimeout(id);
  }, [q, search]);

  async function choose(c: College) {
    setCollege(c);
    setStructure(null);
    setLoadError(null);
    try {
      const res = await fetch(`/api/public/institutions/${encodeURIComponent(c.slug)}/structure`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message);
      setStructure(json.data);
    } catch (e) {
      setLoadError((e as Error).message || 'Could not load this college’s programmes.');
    }
  }

  const programs = structure?.programs.filter((p) => p.departmentId === departmentId) ?? [];
  const program = programs.find((p) => p.id === programId);
  const sections = structure?.sections.filter((s) => s.programId === programId && s.year === Number(year)) ?? [];
  const idRequired = college?.idDocument === 'REQUIRED';

  function pickFile(f: File | null) {
    setFileError(null);
    if (!f) return setFile(null);
    if (!ACCEPT.split(',').includes(f.type)) return setFileError('Use a photo (JPG, PNG, WEBP) or a PDF.');
    if (f.size > MAX_ID_MB * 1024 * 1024) return setFileError(`Keep it under ${MAX_ID_MB} MB.`);
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!college) return;
    let documentFileId: string | null = null;
    if (file) {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('purpose', 'VERIFICATION_ID');
        const res = await fetch('/api/files', { method: 'POST', body: form });
        const json = await res.json();
        if (!json.ok) {
          setFileError(json.error?.message ?? 'The upload failed.');
          return;
        }
        documentFileId = json.data.id;
      } catch {
        setFileError('The upload failed. Check your connection and try again.');
        return;
      } finally {
        setUploading(false);
      }
    }
    const data = await api.call('/api/student/membership', {
      institutionSlug: college.slug,
      departmentId,
      programId,
      sectionId: sectionId || null,
      year: Number(year),
      rollNumber,
      documentFileId,
    });
    if (data) router.refresh();
  }

  if (!college) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <Field label="Find your college" htmlFor="join-q">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
              <Input id="join-q" className="pl-9" placeholder="Name or city" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            </div>
          </Field>
          <ul className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))]" aria-busy={searching}>
            {results === null ? (
              <li className="px-4 py-3 text-[13px] text-muted">Searching…</li>
            ) : results.length === 0 ? (
              <li className="px-4 py-3 text-[13px] text-muted">
                No college found that accepts requests. If your college uses CampusOS, ask the college office for an invitation.
              </li>
            ) : (
              results.map((c) => (
                <li key={c.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-default">{c.name}</p>
                    <p className="text-[12.5px] text-muted">
                      {[c.city, c.state].filter(Boolean).join(', ') || 'Location not listed'}
                    </p>
                  </div>
                  <Badge tone="brand">
                    <ShieldCheck size={12} aria-hidden /> On CampusOS
                  </Badge>
                  <Button size="sm" variant="primary" onClick={() => choose(c)}>
                    Request to join
                  </Button>
                </li>
              ))
            )}
          </ul>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" icon={ArrowLeft} onClick={() => setCollege(null)}>
              Back
            </Button>
            <p className="text-[14px] font-semibold text-default">{college.name}</p>
          </div>
          <ErrorBox error={api.error ?? (loadError ? { message: loadError } : null)} />
          {!structure && !loadError ? <p className="text-[13px] text-muted">Loading programmes…</p> : null}
          {structure ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Department" htmlFor="join-dept" required>
                  <Select id="join-dept" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setProgramId(''); setSectionId(''); }}>
                    <option value="">Choose…</option>
                    {structure.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
                <Field label="Programme" htmlFor="join-prog" required error={api.fieldError('programId')}>
                  <Select id="join-prog" value={programId} disabled={!departmentId} onChange={(e) => { setProgramId(e.target.value); setSectionId(''); }}>
                    <option value="">Choose…</option>
                    {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
                <Field label="Year" htmlFor="join-year" required>
                  <Select id="join-year" value={year} onChange={(e) => { setYear(e.target.value); setSectionId(''); }}>
                    {Array.from({ length: program?.durationYears ?? 4 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Year {y}</option>)}
                  </Select>
                </Field>
                <Field label="Section" htmlFor="join-sec" hint={sections.length === 0 ? 'Not assigned yet' : undefined}>
                  <Select id="join-sec" value={sectionId} disabled={sections.length === 0} onChange={(e) => setSectionId(e.target.value)}>
                    <option value="">Not sure</option>
                    {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
                <Field label="Student ID / roll number" htmlFor="join-roll" required error={api.fieldError('rollNumber')}>
                  <Input id="join-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} autoComplete="off" />
                </Field>
              </div>

              <Field
                label={`College ID card${idRequired ? '' : ' (optional)'}`}
                htmlFor="join-id"
                required={idRequired}
                error={fileError ?? undefined}
                hint={storage ? `A clear photo or PDF, up to ${MAX_ID_MB} MB. Only you and your college’s reviewers can see it.` : undefined}
              >
                {storage ? (
                  <label htmlFor="join-id" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[hsl(var(--border-strong))] px-4 py-3 text-[13px] text-muted hover:border-brand">
                    {file ? <FileCheck2 size={18} className="text-success" aria-hidden /> : <Upload size={18} aria-hidden />}
                    <span className="min-w-0 truncate">{file ? file.name : 'Choose a file'}</span>
                    <input id="join-id" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                  </label>
                ) : (
                  <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[13px] text-muted">
                    File uploads aren’t set up on this CampusOS server{idRequired ? ', and this college requires an ID — ask the college office for an invitation instead.' : '. Your college will check your details without one.'}
                  </p>
                )}
              </Field>

              <p className="text-[12px] leading-relaxed text-subtle">
                Your college decides whether to approve you. When they do, this account — with your tracker, progress and saved
                items — becomes your college account. Nothing changes until then.
              </p>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                loading={api.loading || uploading}
                disabled={!departmentId || !programId || rollNumber.trim().length < 2 || (idRequired && (!storage || !file))}
              >
                Send request
              </Button>
            </>
          ) : null}
        </form>
      </CardBody>
    </Card>
  );
}

/** The student's open request, with a way to see what they sent or withdraw it. */
export function RequestStatusPanel({
  request,
}: {
  request: {
    id: string;
    status: string;
    institutionName: string;
    programName: string | null;
    year: number;
    sectionName: string | null;
    rollNumberMasked: string;
    hasDocument: boolean;
    createdAt: string;
  };
}) {
  const router = useRouter();
  const api = useApi();
  const steps = [
    { label: 'Sent', done: true },
    { label: 'Being reviewed', done: request.status === 'UNDER_REVIEW' },
    { label: 'Decision', done: false },
  ];
  return (
    <Card>
      <CardBody className="space-y-4">
        <ol className="flex flex-wrap items-center gap-2 text-[12.5px]" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={s.done ? 'font-semibold text-success' : 'text-subtle'}>{s.done ? '✓' : '○'} {s.label}</span>
              {i < steps.length - 1 ? <span className="text-subtle" aria-hidden>→</span> : null}
            </li>
          ))}
        </ol>
        <dl className="grid gap-x-6 gap-y-1.5 text-[13.5px] sm:grid-cols-[160px_1fr]">
          <dt className="text-muted">College</dt>
          <dd className="text-default">{request.institutionName}</dd>
          <dt className="text-muted">Programme</dt>
          <dd className="text-default">{request.programName ?? '—'} · Year {request.year}{request.sectionName ? ` · ${request.sectionName}` : ''}</dd>
          <dt className="text-muted">Student ID</dt>
          <dd className="font-mono text-default">{request.rollNumberMasked}</dd>
          <dt className="text-muted">Sent</dt>
          <dd className="text-default">{formatDate(new Date(request.createdAt))}</dd>
          <dt className="text-muted">College ID</dt>
          <dd className="text-default">
            {request.hasDocument ? (
              <a href={`/api/student/membership/${request.id}/document`} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
                View what you sent
              </a>
            ) : (
              'Not attached'
            )}
          </dd>
        </dl>
        <ErrorBox error={api.error} />
        <Button
          variant="ghost"
          loading={api.loading}
          onClick={async () => {
            if (!window.confirm('Withdraw this request? You can send a new one afterwards.')) return;
            const d = await api.call(`/api/student/membership/${request.id}/withdraw`, {});
            if (d) router.refresh();
          }}
        >
          Withdraw request
        </Button>
      </CardBody>
    </Card>
  );
}
