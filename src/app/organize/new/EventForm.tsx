'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** ISO instant → value for <input type="datetime-local"> in the browser's timezone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Existing event values for edit mode (instants as ISO strings). */
export interface EventFormInitial {
  title: string; category: string; description: string | null; visibility: string; organizerName: string | null; mode: string;
  venueText: string | null; city: string | null; area: string | null; onlineUrl: string | null; startsAt: string; endsAt: string;
  capacity: number | null; registrationRequired: boolean; registrationDeadline: string | null; registrationMode: string;
  waitlistEnabled: boolean; priceInr: number; certificateOffered: boolean; teamSizeMin: number; teamSizeMax: number;
  eligibility: string | null; rules: string | null; prizes: string | null; tags: string[]; contactEmail: string | null;
  agenda: { time: string; title: string }[]; faqs: { q: string; a: string }[];
}

function lines(value: string): string[][] {
  return value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]);
}

export function EventForm({
  categories,
  canPublic,
  initial,
  eventId,
}: {
  categories: { value: string; label: string }[];
  canPublic: boolean;
  /** Edit mode: the event's current values. */
  initial?: EventFormInitial;
  eventId?: string;
}) {
  const router = useRouter();
  const api = useApi<{ id: string; status: string; announced?: string[] }>();
  const [f, setF] = React.useState(() =>
    initial
      ? {
          title: initial.title, category: initial.category, description: initial.description ?? '', visibility: initial.visibility,
          organizerName: initial.organizerName ?? '', mode: initial.mode, venueText: initial.venueText ?? '', city: initial.city ?? '',
          area: initial.area ?? '', onlineUrl: initial.onlineUrl ?? '', startsAt: toLocalInput(initial.startsAt), endsAt: toLocalInput(initial.endsAt),
          capacity: initial.capacity ? String(initial.capacity) : '', registrationRequired: initial.registrationRequired,
          registrationDeadline: toLocalInput(initial.registrationDeadline), registrationMode: initial.registrationMode,
          waitlistEnabled: initial.waitlistEnabled, priceInr: String(initial.priceInr), certificateOffered: initial.certificateOffered,
          teamSizeMin: String(initial.teamSizeMin), teamSizeMax: String(initial.teamSizeMax), eligibility: initial.eligibility ?? '',
          rules: initial.rules ?? '', prizes: initial.prizes ?? '', tags: initial.tags.join(', '), contactEmail: initial.contactEmail ?? '',
          agenda: initial.agenda.map((a) => `${a.time} | ${a.title}`).join('\n'), faqs: initial.faqs.map((q) => `${q.q} | ${q.a}`).join('\n'),
        }
      : {
          title: '', category: 'WORKSHOP', description: '', visibility: 'INSTITUTION', organizerName: '', mode: 'OFFLINE',
          venueText: '', city: 'Kolkata', area: '', onlineUrl: '', startsAt: '', endsAt: '', capacity: '', registrationRequired: true,
          registrationDeadline: '', registrationMode: 'INSTANT', waitlistEnabled: true, priceInr: '0', certificateOffered: false,
          teamSizeMin: '1', teamSizeMax: '1', eligibility: '', rules: '', prizes: '', tags: '', contactEmail: '', agenda: '', faqs: '',
        },
  );
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = await api.call(eventId ? `/api/events/${eventId}` : '/api/events', {
      title: f.title, category: f.category, description: f.description || null, visibility: f.visibility,
      organizerName: f.organizerName || null, mode: f.mode, venueText: f.venueText || null, city: f.city || null, area: f.area || null,
      onlineUrl: f.onlineUrl || null, startsAt: toIso(f.startsAt), endsAt: toIso(f.endsAt),
      capacity: f.capacity ? Number(f.capacity) : null, registrationRequired: f.registrationRequired,
      registrationDeadline: toIso(f.registrationDeadline), registrationMode: f.registrationMode, waitlistEnabled: f.waitlistEnabled,
      priceInr: Number(f.priceInr || 0), certificateOffered: f.certificateOffered, teamSizeMin: Number(f.teamSizeMin), teamSizeMax: Number(f.teamSizeMax),
      eligibility: f.eligibility || null, rules: f.rules || null, prizes: f.prizes || null,
      tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8), contactEmail: f.contactEmail || null,
      agenda: lines(f.agenda).map(([time, title]) => ({ time: time!, title: title ?? '' })),
      faqs: lines(f.faqs).map(([q, a]) => ({ q: q!, a: a ?? '' })),
    }, eventId ? 'PATCH' : 'POST');
    if (data) {
      router.push(`/organize/${data.id}${data.announced?.length ? '?announced=1' : ''}`);
      router.refresh();
    }
  }

  const err = api.fieldError;
  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <ErrorBox error={api.error} />
      <Section title="The basics">
        <Field label="Event name" htmlFor="ev-title" required error={err('title')}><Input id="ev-title" value={f.title} onChange={set('title')} maxLength={140} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="ev-cat"><Select id="ev-cat" value={f.category} onChange={set('category')}>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
          <Field label="Organised by" htmlFor="ev-org" hint="e.g. E-Cell, KBI"><Input id="ev-org" value={f.organizerName} onChange={set('organizerName')} /></Field>
        </div>
        <Field label="Description" htmlFor="ev-desc"><Textarea id="ev-desc" rows={5} value={f.description} onChange={set('description')} /></Field>
        <Field label="Who can see it" htmlFor="ev-vis">
          <Select id="ev-vis" value={f.visibility} onChange={set('visibility')}>
            <option value="INSTITUTION">Students of my college</option>
            {canPublic ? <option value="PUBLIC">Students of any college (public)</option> : null}
          </Select>
        </Field>
      </Section>
      <Section title="When & where">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts" htmlFor="ev-start" required error={err('startsAt')}><Input id="ev-start" type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /></Field>
          <Field label="Ends" htmlFor="ev-end" required error={err('endsAt')}><Input id="ev-end" type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Format" htmlFor="ev-mode"><Select id="ev-mode" value={f.mode} onChange={set('mode')}><option value="OFFLINE">Offline</option><option value="ONLINE">Online</option><option value="HYBRID">Hybrid</option></Select></Field>
          <Field label="City" htmlFor="ev-city"><Input id="ev-city" value={f.city} onChange={set('city')} /></Field>
          <Field label="Area" htmlFor="ev-area" hint="Salt Lake, New Town…"><Input id="ev-area" value={f.area} onChange={set('area')} /></Field>
        </div>
        {f.mode !== 'ONLINE' ? <Field label="Venue" htmlFor="ev-venue"><Input id="ev-venue" value={f.venueText} onChange={set('venueText')} /></Field> : null}
        {f.mode !== 'OFFLINE' ? <Field label="Joining link" htmlFor="ev-url" error={err('onlineUrl')}><Input id="ev-url" type="url" value={f.onlineUrl} onChange={set('onlineUrl')} placeholder="https://" /></Field> : null}
      </Section>
      <Section title="Registration">
        <label className="flex items-center gap-2 text-[13.5px] font-semibold text-default"><input type="checkbox" checked={f.registrationRequired} onChange={set('registrationRequired')} /> Students must register</label>
        {f.registrationRequired ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Capacity" htmlFor="ev-cap" hint="Leave empty for unlimited"><Input id="ev-cap" type="number" min={1} value={f.capacity} onChange={set('capacity')} /></Field>
              <Field label="Registration closes" htmlFor="ev-dl" error={err('registrationDeadline')}><Input id="ev-dl" type="datetime-local" value={f.registrationDeadline} onChange={set('registrationDeadline')} /></Field>
              <Field label="Mode" htmlFor="ev-rm"><Select id="ev-rm" value={f.registrationMode} onChange={set('registrationMode')}><option value="INSTANT">Instant</option><option value="APPROVAL">Organiser approves</option><option value="INVITE_ONLY">Invite only</option></Select></Field>
            </div>
            <label className="flex items-center gap-2 text-[13.5px] font-semibold text-default"><input type="checkbox" checked={f.waitlistEnabled} onChange={set('waitlistEnabled')} /> Keep a waitlist when full</label>
          </>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Entry fee (₹)" htmlFor="ev-price"><Input id="ev-price" type="number" min={0} value={f.priceInr} onChange={set('priceInr')} /></Field>
          <Field label="Team size (min)" htmlFor="ev-tmin"><Input id="ev-tmin" type="number" min={1} value={f.teamSizeMin} onChange={set('teamSizeMin')} /></Field>
          <Field label="Team size (max)" htmlFor="ev-tmax" error={err('teamSizeMax')}><Input id="ev-tmax" type="number" min={1} value={f.teamSizeMax} onChange={set('teamSizeMax')} /></Field>
        </div>
        <label className="flex items-center gap-2 text-[13.5px] font-semibold text-default"><input type="checkbox" checked={f.certificateOffered} onChange={set('certificateOffered')} /> Attendees get a certificate</label>
      </Section>
      <Section title="Details (optional)">
        <Field label="Eligibility" htmlFor="ev-elig"><Input id="ev-elig" value={f.eligibility} onChange={set('eligibility')} /></Field>
        <Field label="Rules" htmlFor="ev-rules"><Textarea id="ev-rules" rows={3} value={f.rules} onChange={set('rules')} /></Field>
        <Field label="Prizes" htmlFor="ev-prizes"><Input id="ev-prizes" value={f.prizes} onChange={set('prizes')} /></Field>
        <Field label="Schedule" htmlFor="ev-agenda" hint="One per line: time | what happens"><Textarea id="ev-agenda" rows={3} value={f.agenda} onChange={set('agenda')} placeholder={'10:00 | Check-in\n10:30 | Opening talk'} /></Field>
        <Field label="FAQs" htmlFor="ev-faqs" hint="One per line: question | answer"><Textarea id="ev-faqs" rows={3} value={f.faqs} onChange={set('faqs')} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tags" htmlFor="ev-tags" hint="Comma separated, up to 8"><Input id="ev-tags" value={f.tags} onChange={set('tags')} /></Field>
          <Field label="Contact email" htmlFor="ev-mail" error={err('contactEmail')}><Input id="ev-mail" type="email" value={f.contactEmail} onChange={set('contactEmail')} /></Field>
        </div>
      </Section>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" variant="primary" size="lg" loading={api.loading} disabled={!f.title || !f.startsAt || !f.endsAt}>{eventId ? 'Save changes' : 'Create event'}</Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-2xl campus-outline bg-surface-raised p-4 sm:p-5">
      <legend className="px-1 font-display text-[16px] font-extrabold text-default">{title}</legend>
      {children}
    </fieldset>
  );
}
