'use client';

import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

/**
 * "Register your college." Sends a request to the CampusOS team — it does not
 * create an account or grant any role. The team checks the college and sets
 * it up; the first administrator is then invited by email.
 */
export function CollegeRequestForm() {
  const [f, setF] = React.useState({
    collegeName: '',
    university: '',
    city: '',
    website: '',
    contactName: '',
    contactEmail: '',
    contactRole: '',
    studentCount: '',
    message: '',
    company: '',
  });
  const [done, setDone] = React.useState(false);
  const api = useApi<{ received: boolean }>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = await api.call('/api/public/college-requests', {
      ...f,
      studentCount: f.studentCount.trim() ? Number(f.studentCount) : null,
    });
    if (data?.received) setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-surface p-5" role="status">
        <CheckCircle2 size={24} className="text-success" aria-hidden />
        <p className="text-[15px] font-bold text-default">Thanks — we’ve got your request.</p>
        <p className="text-[13.5px] leading-relaxed text-muted">
          The CampusOS team will check the details and write to {f.contactEmail} from an official address. Once your college is
          set up, you’ll get an invitation to create the administrator account. Nothing has been created yet.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ErrorBox error={api.error} />
      <Field label="College name" htmlFor="cr-name" required error={api.fieldError('collegeName')}>
        <Input id="cr-name" value={f.collegeName} onChange={set('collegeName')} autoComplete="organization" />
      </Field>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <Field label="University" htmlFor="cr-uni" hint="If affiliated" error={api.fieldError('university')}>
          <Input id="cr-uni" value={f.university} onChange={set('university')} />
        </Field>
        <Field label="City" htmlFor="cr-city" required error={api.fieldError('city')}>
          <Input id="cr-city" value={f.city} onChange={set('city')} autoComplete="address-level2" />
        </Field>
      </div>
      <Field label="College website" htmlFor="cr-web" error={api.fieldError('website')}>
        <Input id="cr-web" value={f.website} onChange={set('website')} placeholder="snuniv.ac.in" inputMode="url" />
      </Field>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <Field label="Your name" htmlFor="cr-contact" required error={api.fieldError('contactName')}>
          <Input id="cr-contact" value={f.contactName} onChange={set('contactName')} autoComplete="name" />
        </Field>
        <Field label="Your role" htmlFor="cr-role" required error={api.fieldError('contactRole')}>
          <Input id="cr-role" value={f.contactRole} onChange={set('contactRole')} placeholder="HOD, Management" />
        </Field>
      </div>
      <Field label="Official email" htmlFor="cr-email" required hint="Your college address, so we can confirm it’s you." error={api.fieldError('contactEmail')}>
        <Input id="cr-email" type="email" value={f.contactEmail} onChange={set('contactEmail')} autoComplete="email" />
      </Field>
      <Field label="Students in the first group" htmlFor="cr-count" hint="Roughly — a department or batch is a good start." error={api.fieldError('studentCount')}>
        <Input id="cr-count" type="number" min={1} value={f.studentCount} onChange={set('studentCount')} inputMode="numeric" />
      </Field>
      <Field label="Anything we should know?" htmlFor="cr-msg" error={api.fieldError('message')}>
        <Textarea id="cr-msg" rows={3} value={f.message} onChange={set('message')} maxLength={1000} />
      </Field>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="cr-company">Company</label>
        <input id="cr-company" tabIndex={-1} autoComplete="off" value={f.company} onChange={set('company')} />
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        loading={api.loading}
        disabled={f.collegeName.trim().length < 3 || f.city.trim().length < 2 || f.contactName.trim().length < 2 || !f.contactEmail.includes('@') || f.contactRole.trim().length < 2}
      >
        Send request
      </Button>
      <p className="text-[12px] leading-relaxed text-subtle">
        This doesn’t create an account. The CampusOS team sets up each college and invites its first administrator.
      </p>
    </form>
  );
}
