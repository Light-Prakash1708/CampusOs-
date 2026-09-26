'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button, Card, CardBody, Field, Input, Select } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';
import { cn } from '@/lib/utils';
import { InviteLinkNotice } from '../_components/PeopleActions';

interface Module {
  key: string;
  label: string;
  description: string;
  defaultOn: boolean;
}

const STEPS = ['Institution', 'Joining & modules', 'Administrator', 'Review'] as const;

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function CreateInstitutionWizard({ types, modules }: { types: string[]; modules: Module[] }) {
  const router = useRouter();
  const api = useApi<{ slug: string; emailSent: boolean; inviteUrl: string | null }>();
  const [step, setStep] = React.useState(0);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [f, setF] = React.useState({
    name: '',
    shortName: '',
    slug: '',
    institutionType: 'University',
    website: '',
    officialDomain: '',
    city: '',
    state: '',
    country: 'India',
    timezone: 'Asia/Kolkata',
    joinPolicy: 'ADMIN_APPROVAL' as 'ADMIN_APPROVAL' | 'INVITATION_ONLY',
    idDocument: 'OPTIONAL' as 'OPTIONAL' | 'REQUIRED',
    listed: true,
    modules: modules.filter((m) => m.defaultOn).map((m) => m.key),
    adminFirst: '',
    adminLast: '',
    adminEmail: '',
  });
  const [result, setResult] = React.useState<{ slug: string; emailSent: boolean; inviteUrl: string | null; email: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const stepValid = [
    f.name.trim().length >= 3 && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(f.slug),
    true,
    !!f.adminFirst.trim() && !!f.adminLast.trim() && /\S+@\S+\.\S+/.test(f.adminEmail),
    true,
  ];

  async function create() {
    const data = await api.call('/api/admin/institutions', {
      name: f.name,
      shortName: f.shortName || null,
      slug: f.slug,
      institutionType: f.institutionType || null,
      website: f.website || null,
      officialDomain: f.officialDomain || null,
      city: f.city || null,
      state: f.state || null,
      country: f.country || null,
      timezone: f.timezone,
      joinPolicy: f.joinPolicy,
      idDocument: f.idDocument,
      listed: f.listed,
      modules: f.modules,
      admin: { firstName: f.adminFirst, lastName: f.adminLast, email: f.adminEmail},
    });
    if (data) {
      setResult({ ...data, email: f.adminEmail });
      router.refresh();
    }
  }

  if (result) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-default">
            <CheckCircle2 size={18} className="text-success" aria-hidden /> {f.name} is on CampusOS.
          </p>
          <p className="text-[13.5px] text-muted">
            {result.emailSent
              ? `We emailed ${result.email} an invitation to become the administrator.`
              : 'The administrator account is ready.'}{' '}
            They set their password from the invitation, then finish setup: academic structure, faculty, students and modules.
          </p>
          {result.inviteUrl ? <InviteLinkNotice url={result.inviteUrl} email={result.email} /> : null}
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setStep(0);
              setSlugTouched(false);
              setF((p) => ({ ...p, name: '', shortName: '', slug: '', website: '', officialDomain: '', city: '', state: '', adminFirst: '', adminLast: '', adminEmail: '' }));
            }}
          >
            Create another
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                disabled={i > step && !stepValid.slice(0, i).every(Boolean)}
                onClick={() => setStep(i)}
                aria-current={i === step ? 'step' : undefined}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-left text-[12.5px] font-semibold transition-colors disabled:opacity-50',
                  i === step ? 'border-brand bg-brand-subtle text-brand-text' : 'border-[hsl(var(--border))] text-muted hover:border-[hsl(var(--border-strong))]',
                )}
              >
                <span className="block text-[11px] font-medium text-subtle">Step {i + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>

        <ErrorBox error={api.error} />

        {step === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Official name" htmlFor="ci-name" required error={api.fieldError('name')}>
              <Input
                id="ci-name"
                value={f.name}
                onChange={(e) => {
                  set('name', e.target.value);
                  if (!slugTouched) set('slug', slugify(e.target.value));
                }}
              />
            </Field>
            <Field label="Short name" htmlFor="ci-short" hint="e.g. SNU">
              <Input id="ci-short" value={f.shortName} onChange={(e) => set('shortName', e.target.value)} />
            </Field>
            <Field label="Web name (slug)" htmlFor="ci-slug" required hint="Lowercase letters, digits and hyphens" error={api.fieldError('slug')}>
              <Input
                id="ci-slug"
                value={f.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set('slug', e.target.value.toLowerCase());
                }}
              />
            </Field>
            <Field label="Type" htmlFor="ci-type">
              <Select id="ci-type" value={f.institutionType} onChange={(e) => set('institutionType', e.target.value)}>
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Website" htmlFor="ci-web" error={api.fieldError('website')}>
              <Input id="ci-web" type="url" placeholder="https://" value={f.website} onChange={(e) => set('website', e.target.value)} />
            </Field>
            <Field label="Official email domain" htmlFor="ci-domain" hint="Used as a verification signal, e.g. college.edu.in" error={api.fieldError('officialDomain')}>
              <Input id="ci-domain" value={f.officialDomain} onChange={(e) => set('officialDomain', e.target.value)} />
            </Field>
            <Field label="City" htmlFor="ci-city">
              <Input id="ci-city" value={f.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="State" htmlFor="ci-state">
              <Input id="ci-state" value={f.state} onChange={(e) => set('state', e.target.value)} />
            </Field>
            <Field label="Country" htmlFor="ci-country">
              <Input id="ci-country" value={f.country} onChange={(e) => set('country', e.target.value)} />
            </Field>
            <Field label="Timezone" htmlFor="ci-tz" error={api.fieldError('timezone')}>
              <Input id="ci-tz" value={f.timezone} onChange={(e) => set('timezone', e.target.value)} />
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-5">
            <fieldset>
              <legend className="text-[13.5px] font-semibold text-default">How do existing CampusOS students join?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  { v: 'ADMIN_APPROVAL', t: 'Students request, the college reviews', d: 'Students ask to join and give their programme and roll number; an administrator approves each one.' },
                  { v: 'INVITATION_ONLY', t: 'Invitations and imports only', d: 'Only people the college invites or imports can join.' },
                ].map((o) => (
                  <label key={o.v} className={cn('cursor-pointer rounded-lg border p-3', f.joinPolicy === o.v ? 'border-brand bg-brand-subtle' : 'border-[hsl(var(--border))]')}>
                    <input type="radio" name="joinPolicy" className="sr-only" checked={f.joinPolicy === o.v} onChange={() => set('joinPolicy', o.v as typeof f.joinPolicy)} />
                    <span className="block text-[13.5px] font-semibold text-default">{o.t}</span>
                    <span className="block text-[12.5px] text-muted">{o.d}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {f.joinPolicy === 'ADMIN_APPROVAL' ? (
              <Field label="College ID with join requests" htmlFor="ci-id">
                <Select id="ci-id" value={f.idDocument} onChange={(e) => set('idDocument', e.target.value as typeof f.idDocument)}>
                  <option value="OPTIONAL">Optional — students may attach it</option>
                  <option value="REQUIRED">Required — every request must include one</option>
                </Select>
              </Field>
            ) : null}
            <label className="flex items-center gap-2 text-[13.5px] text-default">
              <input type="checkbox" checked={f.listed} onChange={(e) => set('listed', e.target.checked)} />
              List this institution where students search for their college
            </label>
            <fieldset>
              <legend className="text-[13.5px] font-semibold text-default">Modules</legend>
              <p className="text-[12.5px] text-muted">The college administrator can change these later in Settings.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {modules.map((m) => (
                  <label key={m.key} className="flex items-start gap-2 rounded-lg border border-[hsl(var(--border))] p-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={f.modules.includes(m.key)}
                      onChange={(e) => set('modules', e.target.checked ? [...f.modules, m.key] : f.modules.filter((k) => k !== m.key))}
                    />
                    <span>
                      <span className="block text-[13px] font-semibold text-default">{m.label}</span>
                      <span className="block text-[12px] text-muted">{m.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" htmlFor="ci-af" required error={api.fieldError('admin.firstName')}>
              <Input id="ci-af" value={f.adminFirst} onChange={(e) => set('adminFirst', e.target.value)} />
            </Field>
            <Field label="Last name" htmlFor="ci-al" required error={api.fieldError('admin.lastName')}>
              <Input id="ci-al" value={f.adminLast} onChange={(e) => set('adminLast', e.target.value)} />
            </Field>
            <Field label="Official email" htmlFor="ci-ae" required error={api.fieldError('admin.email')}>
              <Input id="ci-ae" type="email" value={f.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} />
            </Field>
            <p className="text-[12.5px] text-muted sm:col-span-2">
              They become this institution’s super administrator. The invitation link works once and expires in 7 days.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <dl className="grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-[180px_1fr]">
            <dt className="text-muted">Institution</dt>
            <dd className="text-default">{f.name} ({f.slug})</dd>
            <dt className="text-muted">Location</dt>
            <dd className="text-default">{[f.city, f.state, f.country].filter(Boolean).join(', ') || '—'} · {f.timezone}</dd>
            <dt className="text-muted">Joining</dt>
            <dd className="text-default">
              {f.joinPolicy === 'ADMIN_APPROVAL' ? `Requests reviewed by the college · ID ${f.idDocument.toLowerCase()}` : 'Invitations and imports only'}
              {f.listed ? ' · listed' : ' · unlisted'}
            </dd>
            <dt className="text-muted">Modules</dt>
            <dd className="text-default">{f.modules.length} on</dd>
            <dt className="text-muted">Administrator</dt>
            <dd className="text-default">{f.adminFirst} {f.adminLast} · {f.adminEmail}</dd>
          </dl>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="ghost" icon={ArrowLeft} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" disabled={!stepValid[step]} onClick={() => setStep((s) => s + 1)}>
              Continue <ArrowRight size={16} aria-hidden />
            </Button>
          ) : (
            <Button variant="primary" loading={api.loading} disabled={!stepValid.every(Boolean)} onClick={create}>
              Create institution and invite administrator
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
