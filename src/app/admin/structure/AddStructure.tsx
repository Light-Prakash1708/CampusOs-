'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

type Kind = 'department' | 'program' | 'section';

/** Add a department, programme or section. Codes are unique within your college. */
export function AddStructure({
  departments,
  programs,
}: {
  departments: { id: string; name: string }[];
  programs: { id: string; name: string; durationYears: number }[];
}) {
  const router = useRouter();
  const api = useApi<{ id: string }>();
  const [kind, setKind] = React.useState<Kind>(departments.length === 0 ? 'department' : programs.length === 0 ? 'program' : 'section');
  const [f, setF] = React.useState({ name: '', code: '', school: '', departmentId: '', level: 'UG', durationYears: '3', programId: '', year: '1' });
  const [done, setDone] = React.useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const program = programs.find((p) => p.id === f.programId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(null);
    const body =
      kind === 'department'
        ? { kind, name: f.name, code: f.code, school: f.school || null }
        : kind === 'program'
          ? { kind, departmentId: f.departmentId, name: f.name, code: f.code, level: f.level, durationYears: Number(f.durationYears) }
          : { kind, programId: f.programId, year: Number(f.year), name: f.name, code: f.code };
    const data = await api.call('/api/admin/structure', body);
    if (data) {
      setDone(`${f.name} added.`);
      setF({ ...f, name: '', code: '', school: '' });
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="flex flex-wrap gap-2" role="group" aria-label="What to add">
        {(['department', 'program', 'section'] as Kind[]).map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={kind === k ? 'primary' : 'secondary'}
            aria-pressed={kind === k}
            disabled={(k === 'program' && departments.length === 0) || (k === 'section' && programs.length === 0)}
            onClick={() => setKind(k)}
          >
            {k === 'program' ? 'Programme' : k.charAt(0).toUpperCase() + k.slice(1)}
          </Button>
        ))}
      </div>
      <ErrorBox error={api.error} />
      {done ? <p className="text-[13px] text-success" role="status">{done}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {kind === 'program' ? (
          <Field label="Department" htmlFor="as-dept" required error={api.fieldError('departmentId')}>
            <Select id="as-dept" value={f.departmentId} onChange={set('departmentId')}>
              <option value="">Choose…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        ) : null}
        {kind === 'section' ? (
          <>
            <Field label="Programme" htmlFor="as-prog" required error={api.fieldError('programId')}>
              <Select id="as-prog" value={f.programId} onChange={set('programId')}>
                <option value="">Choose…</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Year" htmlFor="as-year" required>
              <Select id="as-year" value={f.year} onChange={set('year')}>
                {Array.from({ length: program?.durationYears ?? 4 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Year {y}</option>)}
              </Select>
            </Field>
          </>
        ) : null}
        <Field label="Name" htmlFor="as-name" required error={api.fieldError('name')}>
          <Input id="as-name" value={f.name} onChange={set('name')} placeholder={kind === 'department' ? 'Management School' : kind === 'program' ? 'BBA' : 'Section A'} />
        </Field>
        <Field label="Code" htmlFor="as-code" required error={api.fieldError('code')}>
          <Input id="as-code" value={f.code} onChange={set('code')} placeholder={kind === 'department' ? 'MGMT' : kind === 'program' ? 'BBA' : 'BBA-1-A'} />
        </Field>
        {kind === 'department' ? (
          <Field label="School (optional)" htmlFor="as-school">
            <Input id="as-school" value={f.school} onChange={set('school')} />
          </Field>
        ) : null}
        {kind === 'program' ? (
          <>
            <Field label="Level" htmlFor="as-level">
              <Select id="as-level" value={f.level} onChange={set('level')}>
                {['UG', 'PG', 'DIPLOMA', 'PHD', 'CERTIFICATE'].map((l) => <option key={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Duration (years)" htmlFor="as-dur">
              <Select id="as-dur" value={f.durationYears} onChange={set('durationYears')}>
                {[1, 2, 3, 4, 5, 6].map((y) => <option key={y}>{y}</option>)}
              </Select>
            </Field>
          </>
        ) : null}
      </div>
      <Button type="submit" variant="primary" loading={api.loading} disabled={!f.name.trim() || !f.code.trim()}>
        Add {kind === 'program' ? 'programme' : kind}
      </Button>
    </form>
  );
}
