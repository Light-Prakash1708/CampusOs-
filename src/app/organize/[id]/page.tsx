import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Pencil } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { CampusCard, CampusPill, CampusSectionHeader } from '@/components/campus';
import { formatEventDates } from '@/components/campus/events';
import { getManagedEvent } from '@/services/events/organizer';
import { AttendeeDecision, CancelEventAction, CertificatesAction, CheckInPanel, UpdateComposer } from './OrganizerTools';

export const metadata = { title: 'Manage event' };
export const dynamic = 'force-dynamic';

const REG_TONE: Record<string, 'mint' | 'sun' | 'sky' | 'coral' | 'lavender'> = {
  REGISTERED: 'mint', WAITLISTED: 'sun', PENDING_APPROVAL: 'sky', REJECTED: 'coral', CANCELLED: 'lavender',
};

export default async function ManageEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ announced?: string }> }) {
  const user = await requirePermission('event:create');
  if (!isEnabled(user.featureFlags, 'events_enabled')) notFound();
  const { id } = await params;
  const { announced } = await searchParams;
  let m;
  try {
    m = await getManagedEvent(user, id);
  } catch {
    notFound();
  }
  const e = m.event;
  const live = e.status === 'SCHEDULED' || e.status === 'COMPLETED';
  const conversion = e.capacity ? Math.round((m.stats.registered / e.capacity) * 100) : null;
  const active = m.registrations.filter((r) => r.status !== 'CANCELLED');
  const editable = e.status !== 'CANCELLED' && e.endsAt >= new Date();

  return (
    <div className="space-y-5">
      <Link href="/organize" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted hover:text-default">
        <ArrowLeft size={15} aria-hidden /> All my events
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold text-default">{e.title}</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {formatEventDates(e.startsAt, e.endsAt)} · {e.venueText ?? e.city ?? 'Online'} ·{' '}
            {e.visibility === 'PUBLIC' ? 'Open to all colleges' : 'Your college only'}
          </p>
          {e.status === 'PENDING_APPROVAL' ? (
            <p className="mt-2 text-[13px] font-bold text-sun-ink">Waiting for your college to approve it. Students can’t see it yet.</p>
          ) : null}
          {e.status === 'DRAFT' && e.moderationNote ? (
            <p className="mt-2 text-[13px] font-bold text-coral-ink">Moderator note: {e.moderationNote}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {live && user.portal === 'student' ? (
            <Link href={`/student/events/${e.id}`} className="inline-flex min-h-[44px] items-center gap-1.5 px-2 text-[13px] font-bold text-brand hover:underline">
              View as a student <ExternalLink size={13} aria-hidden />
            </Link>
          ) : null}
          {editable ? (
            <>
              <Link
                href={`/organize/${e.id}/edit`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-surface px-3.5 text-[13px] font-bold shadow-pop campus-press"
              >
                <Pencil size={14} aria-hidden /> Edit
              </Link>
              <CancelEventAction eventId={e.id} live={e.status === 'SCHEDULED'} />
            </>
          ) : null}
        </div>
      </header>
      {e.status === 'CANCELLED' ? (
        <p role="status" className="rounded-xl border-[1.5px] border-ink bg-coral p-3 text-[13.5px] font-bold text-coral-ink">
          This event is cancelled. Attendees were notified.
        </p>
      ) : null}
      {announced ? (
        <p role="status" className="rounded-xl border-[1.5px] border-ink bg-mint p-3 text-[13.5px] font-bold text-mint-ink">
          Saved. The time or venue change was announced to everyone registered and following.
        </p>
      ) : null}

      <section aria-label="Registration stats" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ['Registered', `${m.stats.registered}${e.capacity ? ` / ${e.capacity}` : ''}`],
            ['Fill rate', conversion === null ? '—' : `${conversion}%`],
            ['Waitlist', String(m.stats.waitlisted)],
            ['Checked in', String(m.stats.checkedIn)],
            ['No-shows', e.endsAt < new Date() ? String(m.stats.noShows) : '—'],
            ['Certificates', String(m.stats.certificates)],
          ] as const
        ).map(([label, value]) => (
          <CampusCard key={label} className="p-3">
            <p className="text-[12px] font-bold text-muted">{label}</p>
            <p className="tabular font-display text-[24px] font-extrabold text-default">{value}</p>
          </CampusCard>
        ))}
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <CampusCard as="section" className="overflow-hidden" aria-labelledby="att-h">
          <div className="p-4">
            <CampusSectionHeader id="att-h" title={`Attendees (${active.length})`} />
          </div>
          {m.registrations.length === 0 ? (
            <p className="px-4 pb-5 text-[13.5px] text-muted">No registrations yet. Post an update to followers to get the word out.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-y border-[hsl(var(--border))] bg-surface-sunken text-[11.5px] font-bold uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-2 py-2">College</th>
                    <th className="px-2 py-2">Code</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Checked in</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))]">
                  {m.registrations.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2">
                        <p className="font-bold text-default">{r.name}</p>
                        <p className="text-[11.5px] text-subtle">{r.email}{r.teamName ? ` · Team ${r.teamName}` : ''}</p>
                      </td>
                      <td className="px-2 py-2 text-muted">{r.college ?? '—'}</td>
                      <td className="px-2 py-2 font-mono text-[12px]">{r.code}</td>
                      <td className="px-2 py-2">
                        <CampusPill tone={REG_TONE[r.status] ?? 'sky'}>{r.status.replace('_', ' ').toLowerCase()}</CampusPill>
                      </td>
                      <td className="px-2 py-2 text-muted">
                        {r.attendedAt ? formatDateTime(r.attendedAt) : '—'}
                        {r.certified ? ' · certified' : ''}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.status === 'PENDING_APPROVAL' ? <AttendeeDecision eventId={e.id} registrationId={r.id} /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CampusCard>

        <div className="space-y-5">
          {live ? <CheckInPanel eventId={e.id} /> : null}
          {live ? <UpdateComposer eventId={e.id} /> : null}
          {live && e.certificateOffered ? (
            <CertificatesAction
              eventId={e.id}
              eligible={m.registrations.filter((r) => r.attendedAt && !r.certified && r.status === 'REGISTERED').length}
            />
          ) : null}
          {m.updates.length ? (
            <CampusCard className="p-4">
              <CampusSectionHeader title="Sent updates" />
              <ul className="mt-2 space-y-2 text-[13px]">
                {m.updates.map((u) => (
                  <li key={u.id}>
                    <p className="font-bold text-default">{u.title}</p>
                    <p className="text-[12px] text-subtle">
                      {u.kind.replace('_', ' ').toLowerCase()} · {u.recipientCount} recipients · {relativeTime(u.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </CampusCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
