'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

const ORDINARY = ['STUDENT', 'FACULTY', 'CLUB_ADMIN', 'EVENT_ORGANIZER', 'CAMPUS_REP'];
const STAFF = ['ADMIN', 'HOD', 'DEPARTMENT_ADMIN', 'EXAM_CELL', 'COUNSELLOR', 'IT_SUPPORT', 'FINANCE', 'HR', 'LIBRARY', 'MANAGEMENT'];
const label = (r: string) => r.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function InviteForm({
  canInviteStaff,
  departments,
  programs,
  sections,
}: {
  canInviteStaff: boolean;
  departments: { id: string; name: string }[];
  programs: { id: string; name: string; departmentId: string }[];
  sections: { id: string; name: string; programId: string; year: number }[];
}) {
  const router = useRouter();
  const api = useApi<{ userId: string; emailSent: boolean }>();
  const [f, setF] = React.useState({
    email: '', firstName: '', lastName: '', role: 'STUDENT', departmentId: '', programId: '', sectionId: '', year: '1', rollNumber: '', employeeCode: '',
  });
  const [done, setDone] = React.useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const deptPrograms = programs.filter((p) => !f.departmentId || p.departmentId === f.departmentId);
  const progSections = sections.filter((s) => s.programId === f.programId && s.year === Number(f.year));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = await api.call('/api/admin/users/invite', {
      email: f.email, firstName: f.firstName, lastName: f.lastName, role: f.role,
      departmentId: f.departmentId || null,
      programId: f.role === 'STUDENT' ? f.programId || null : null,
      sectionId: f.role === 'STUDENT' ? f.sectionId || null : null,
      year: f.role === 'STUDENT' ? Number(f.year) : null,
      rollNumber: f.role === 'STUDENT' ? f.rollNumber || null : null,
      employeeCode: f.role === 'FACULTY' ? f.employeeCode || null : null,
    });
    if (data) {
      setDone(data.emailSent ? `Invitation sent to ${f.email}.` : `Account created for ${f.email}, but the email could not be sent — check the email provider settings.`);
      setF({ ...f, email: '', firstName: '', lastName: '', rollNumber: '', employeeCode: '' });
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ErrorBox error={api.error} />
      {done ? <p className="text-[13px] text-success" role="status">{done}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Email" htmlFor="inv-email" required error={api.fieldError('email')}><Input id="inv-email" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="First name" htmlFor="inv-first" required><Input id="inv-first" value={f.firstName} onChange={set('firstName')} /></Field>
        <Field label="Last name" htmlFor="inv-last" required><Input id="inv-last" value={f.lastName} onChange={set('lastName')} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Role" htmlFor="inv-role">
          <Select id="inv-role" value={f.role} onChange={set('role')}>
            {ORDINARY.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            {canInviteStaff ? STAFF.map((r) => <option key={r} value={r}>{label(r)}</option>) : null}
          </Select>
        </Field>
        <Field label="Department" htmlFor="inv-dept" required={f.role === 'FACULTY'}>
          <Select id="inv-dept" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value, programId: '', sectionId: '' })}>
            <option value="">—</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        {f.role === 'FACULTY' ? (
          <Field label="Employee code" htmlFor="inv-emp" required><Input id="inv-emp" value={f.employeeCode} onChange={set('employeeCode')} /></Field>
        ) : null}
      </div>
      {f.role === 'STUDENT' ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Programme" htmlFor="inv-prog" required>
            <Select id="inv-prog" value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value, sectionId: '' })}>
              <option value="">Select</option>
              {deptPrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Year" htmlFor="inv-year">
            <Select id="inv-year" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value, sectionId: '' })}>
              {[1, 2, 3, 4, 5].map((y) => <option key={y} value={String(y)}>Year {y}</option>)}
            </Select>
          </Field>
          <Field label="Section" htmlFor="inv-sec">
            <Select id="inv-sec" value={f.sectionId} onChange={set('sectionId')} disabled={progSections.length === 0}>
              <option value="">—</option>
              {progSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Student ID" htmlFor="inv-roll" required><Input id="inv-roll" value={f.rollNumber} onChange={set('rollNumber')} /></Field>
        </div>
      ) : null}
      <Button type="submit" variant="primary" loading={api.loading} disabled={!f.email || !f.firstName || !f.lastName}>
        Send invitation
      </Button>
    </form>
  );
}

export function RegistrationDecision({ userId, mode, canApprove = true }: { userId: string; mode: 'decide' | 'resend'; canApprove?: boolean }) {
  const router = useRouter();
  const api = useApi();
  const [msg, setMsg] = React.useState<string | null>(null);

  if (mode === 'resend') {
    return (
      <span className="flex items-center gap-2">
        {msg ? <span className="text-[12px] text-success">{msg}</span> : null}
        <Button size="sm" variant="ghost" loading={api.loading} onClick={async () => {
          const d = await api.call(`/api/admin/users/${userId}/resend-invite`, {});
          if (d) setMsg('Sent');
        }}>Resend</Button>
      </span>
    );
  }

  async function decide(approve: boolean) {
    const d = await api.call(`/api/admin/registrations/${userId}`, { approve });
    if (d) router.refresh();
  }
  return (
    <div className="flex items-center gap-2">
      {api.error ? <span className="text-[12px] text-danger">{api.error.message}</span> : null}
      <Button size="sm" variant="ghost" loading={api.loading} onClick={() => decide(false)}>Decline</Button>
      <Button size="sm" variant="primary" loading={api.loading} disabled={!canApprove} onClick={() => decide(true)}
        title={canApprove ? undefined : 'The student must confirm their email first'}>Approve</Button>
    </div>
  );
}

export function DeletionDecision({ requestId }: { requestId: string }) {
  const router = useRouter();
  const api = useApi();
  const [confirming, setConfirming] = React.useState(false);
  async function decide(approve: boolean) {
    const d = await api.call(`/api/admin/privacy/deletion-requests/${requestId}`, { approve });
    if (d) router.refresh();
  }
  return (
    <div className="flex items-center gap-2">
      {api.error ? <span className="text-[12px] text-danger">{api.error.message}</span> : null}
      <Button size="sm" variant="ghost" loading={api.loading} onClick={() => decide(false)}>Decline</Button>
      {confirming ? (
        <Button size="sm" variant="danger" loading={api.loading} onClick={() => decide(true)}>Confirm anonymise</Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>Approve</Button>
      )}
    </div>
  );
}
