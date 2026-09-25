'use client';

import * as React from 'react';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ui';
import { ErrorBox, PasswordHints, useApi } from '@/components/auth/useApi';

interface College {
  slug: string;
  name: string;
  city: string | null;
  mode: string;
  allowedDomains: string[];
}
interface Structure {
  departments: { id: string; name: string }[];
  programs: { id: string; name: string; departmentId: string; durationYears: number }[];
  sections: { id: string; name: string; programId: string; year: number }[];
  mode: string;
  allowedDomains: string[];
}

/** Three short steps: college → academic details → account. */
export function RegisterForm({ colleges }: { colleges: College[] }) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [college, setCollege] = React.useState(colleges.length === 1 ? colleges[0]!.slug : '');
  const [structure, setStructure] = React.useState<Structure | null>(null);
  const [loadingStructure, setLoadingStructure] = React.useState(false);
  const [structureError, setStructureError] = React.useState<string | null>(null);

  const [departmentId, setDepartmentId] = React.useState('');
  const [programId, setProgramId] = React.useState('');
  const [year, setYear] = React.useState('1');
  const [sectionId, setSectionId] = React.useState('');

  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [studentId, setStudentId] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [done, setDone] = React.useState<string | null>(null);
  const api = useApi<{ message: string }>();

  const chosen = colleges.find((c) => c.slug === college);
  const programs = structure?.programs.filter((p) => p.departmentId === departmentId) ?? [];
  const program = programs.find((p) => p.id === programId);
  const sections = structure?.sections.filter((s) => s.programId === programId && s.year === Number(year)) ?? [];

  async function loadStructure() {
    if (!college) return;
    setLoadingStructure(true);
    setStructureError(null);
    try {
      const res = await fetch(`/api/public/institutions/${encodeURIComponent(college)}/structure`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message);
      setStructure(json.data);
      setStep(2);
    } catch (e) {
      setStructureError((e as Error).message || 'Could not load this college’s programmes.');
    } finally {
      setLoadingStructure(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = await api.call('/api/auth/register', {
      institutionSlug: college,
      firstName,
      lastName,
      email,
      password,
      departmentId,
      programId,
      sectionId: sectionId || null,
      year: Number(year),
      studentId,
    });
    if (data) setDone(data.message);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-[hsl(var(--border))] bg-surface-sunken p-4" role="status">
        <MailCheck size={18} className="text-success" aria-hidden />
        <p className="mt-2 text-[13.5px] font-medium text-default">Almost there</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{done}</p>
        {chosen?.mode === 'ADMIN_APPROVAL' ? (
          <p className="mt-2 text-[12.5px] text-subtle">
            {chosen.name} reviews new accounts, so after you confirm your email an administrator will approve it.
          </p>
        ) : null}
      </div>
    );
  }

  const stepLabel = (
    <p className="mb-4 text-[12px] font-medium uppercase tracking-wider text-subtle" aria-live="polite">
      Step {step} of 3
    </p>
  );

  if (step === 1) {
    return (
      <div className="space-y-4">
        {stepLabel}
        {structureError ? <ErrorBox error={{ message: structureError }} /> : null}
        <Field label="Your college" htmlFor="college" required>
          <Select id="college" value={college} onChange={(e) => setCollege(e.target.value)}>
            <option value="">Select your college</option>
            {colleges.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
                {c.city ? ` — ${c.city}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" size="lg" className="w-full" disabled={!college} loading={loadingStructure} onClick={loadStructure}>
          Continue
        </Button>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="space-y-4">
        {stepLabel}
        <Field label="Department" htmlFor="dept" required>
          <Select id="dept" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setProgramId(''); setSectionId(''); }}>
            <option value="">Select department</option>
            {structure?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Programme" htmlFor="program" required>
          <Select id="program" value={programId} disabled={!departmentId} onChange={(e) => { setProgramId(e.target.value); setSectionId(''); }}>
            <option value="">Select programme</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year" htmlFor="year" required>
            <Select id="year" value={year} onChange={(e) => { setYear(e.target.value); setSectionId(''); }}>
              {Array.from({ length: program?.durationYears ?? 4 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>Year {i + 1}</option>
              ))}
            </Select>
          </Field>
          <Field label="Section" htmlFor="section" hint={sections.length === 0 ? 'Not assigned yet' : undefined}>
            <Select id="section" value={sectionId} disabled={sections.length === 0} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Not sure yet</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(1)}>Back</Button>
          <Button variant="primary" size="lg" className="flex-1" disabled={!departmentId || !programId} onClick={() => setStep(3)}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  const domains = structure?.allowedDomains ?? [];
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {stepLabel}
      <ErrorBox error={api.error} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="first" required error={api.fieldError('firstName')}>
          <Input id="first" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name" htmlFor="last" required error={api.fieldError('lastName')}>
          <Input id="last" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
      </div>
      <Field
        label="Email"
        htmlFor="email"
        required
        error={api.fieldError('email')}
        hint={domains.length ? `Use your college address (${domains.map((d) => '@' + d).join(', ')}).` : undefined}
      >
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Student ID / roll number" htmlFor="sid" required error={api.fieldError('studentId')}>
        <Input id="sid" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="pw" required>
        <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordHints value={password} />
      </Field>
      <p className="text-[12px] leading-relaxed text-subtle">
        By creating an account you agree that {chosen?.name ?? 'your college'} manages your academic
        records on CampusOS. You control what other students can see in Settings → Privacy.
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" icon={ArrowLeft} type="button" onClick={() => setStep(2)}>Back</Button>
        <Button variant="primary" size="lg" type="submit" className="flex-1" loading={api.loading}
          disabled={!firstName || !lastName || !email || !studentId || !password}>
          Create account
        </Button>
      </div>
    </form>
  );
}
