import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Award,
  CalendarDays,
  Globe2,
  Mail,
  MapPin,
  Megaphone,
  QrCode,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';
import { isEnabled } from '@/lib/features';
import { relativeTime } from '@/lib/utils';
import { CampusCard, CampusPill, CampusSectionHeader, toneForTag } from '@/components/campus';
import { EventCover, VerificationBadge, categoryTone, formatEventDates } from '@/components/campus/events';
import { RegisterControl, SaveToggle } from '@/components/campus/EventActions';
import { DEMO_SOURCE, EVENT_CATEGORIES, getEvent } from '@/services/events';
import { requireStudentContext } from '../../_lib/auth';
import { ReportEvent } from './ReportEvent';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: 'Event' };
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStudentContext();
  if (!isEnabled(user.featureFlags, 'events_enabled')) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let detail;
  try {
    detail = await getEvent(user, id);
  } catch {
    notFound();
  }
  const { event: e, registration: reg } = detail;
  const now = new Date();
  const full = e.capacity !== null && detail.registeredCount >= e.capacity;
  const closed = (!!e.registrationDeadline && e.registrationDeadline < now) || e.status !== 'SCHEDULED' || e.endsAt < now;
  const categoryLabel = EVENT_CATEGORIES[e.category as keyof typeof EVENT_CATEGORIES] ?? 'Event';
  const where =
    e.mode === 'ONLINE' ? 'Online' : joinPlace([detail.venue, e.area, e.city]) || 'Venue to be announced';
  const sections = [
    { id: 'about', label: 'About', show: !!e.description },
    { id: 'schedule', label: 'Schedule', show: e.agenda.length > 0 },
    { id: 'rules', label: 'Rules', show: !!e.rules },
    { id: 'prizes', label: 'Prizes', show: !!e.prizes },
    { id: 'eligibility', label: 'Eligibility', show: !!e.eligibility },
    { id: 'organizer', label: 'Organiser', show: true },
    { id: 'faqs', label: 'FAQs', show: e.faqs.length > 0 },
  ].filter((s) => s.show);

  const action = (
    <RegisterControl
      eventId={e.id}
      status={reg?.status ?? null}
      registrationRequired={e.registrationRequired}
      closed={closed}
      full={full}
      waitlistEnabled={e.waitlistEnabled}
      saved={detail.saved}
      size="lg"
      allowCancel
      waitlistPosition={reg?.waitlistPosition}
    />
  );

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <Link href="/student/events" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted hover:text-default">
        <ArrowLeft size={15} aria-hidden /> All events
      </Link>

      <CampusCard as="section" className="overflow-hidden" aria-labelledby="event-title">
        <div className="relative border-b-[1.5px] border-ink">
          <EventCover title={e.title} category={e.category} coverUrl={e.coverUrl} className="h-[140px] sm:h-[190px]" />
          <div className="absolute right-3 top-3">
            <SaveToggle eventId={e.id} saved={detail.saved} title={e.title} />
          </div>
          {e.sourceName === DEMO_SOURCE ? (
            <span className="absolute left-3 top-3 rounded-md border border-ink bg-sun px-1.5 text-[10.5px] font-extrabold uppercase text-sun-ink">Demo event</span>
          ) : null}
        </div>
        <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <CampusPill tone={categoryTone(e.category)}>{categoryLabel}</CampusPill>
            {e.tags.filter((tg) => tg.toLowerCase() !== categoryLabel.toLowerCase()).slice(0, 3).map((tg) => (
              <CampusPill key={tg} tone={toneForTag(tg)}>{tg}</CampusPill>
            ))}
            <VerificationBadge verification={e.verification} />
          </div>
          <h1 id="event-title" className="mt-2 font-display text-[26px] font-extrabold leading-tight text-default sm:text-[32px]">{e.title}</h1>
          <p className="mt-1 text-[14px] font-semibold text-muted">
            {e.organizerName ?? detail.institutionName}
            {!detail.ownCollege && e.organizerName && !e.organizerName.includes(detail.institutionName) ? ` · ${detail.institutionName}` : ''}
          </p>
          <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 lg:grid-cols-4">
            <Fact icon={CalendarDays} label="When" value={formatEventDates(e.startsAt, e.endsAt)} />
            <Fact icon={e.mode === 'ONLINE' ? Globe2 : MapPin} label={e.mode === 'HYBRID' ? 'Hybrid' : e.mode === 'ONLINE' ? 'Online' : 'Where'} value={where} />
            <Fact icon={Ticket} label="Entry" value={e.priceInr === 0 ? 'Free' : `₹${e.priceInr}`} />
            <Fact
              icon={Users}
              label={e.teamSizeMax > 1 ? `Teams of ${e.teamSizeMin}–${e.teamSizeMax}` : 'Seats'}
              value={e.capacity ? `${detail.registeredCount} / ${e.capacity} registered` : e.registrationRequired ? `${detail.registeredCount} registered` : 'Open entry'}
            />
          </dl>
          {e.registrationDeadline && !closed ? (
            <p className="mt-3 text-[12.5px] font-semibold text-coral-ink">Registration closes {relativeTime(e.registrationDeadline)}.</p>
          ) : null}
        </div>
      </CampusCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {sections.length > 1 ? (
            <nav aria-label="Event sections" className="-mx-1 overflow-x-auto px-1 scrollbar-none">
              <ul className="flex w-max gap-2">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="inline-flex min-h-[36px] items-center rounded-lg border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-3 text-[13px] font-bold text-muted hover:border-ink hover:text-default">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {detail.updates.length > 0 ? (
            <CampusCard as="section" tone="sun" className="p-4" aria-labelledby="updates-h">
              <CampusSectionHeader id="updates-h" title="Updates from the organisers" />
              <ul className="mt-2 space-y-2">
                {detail.updates.map((u) => (
                  <li key={u.id} className="flex gap-2">
                    <Megaphone size={15} className="mt-0.5 shrink-0 text-sun-ink" aria-hidden />
                    <div>
                      <p className="text-[13.5px] font-bold text-default">{u.title}</p>
                      {u.body ? <p className="text-[13px] text-muted">{u.body}</p> : null}
                      <p className="text-[11.5px] text-subtle">{relativeTime(u.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CampusCard>
          ) : null}

          <CampusCard as="article" className="divide-y divide-[hsl(var(--border))]">
            {e.description ? <Block id="about" title="About">{e.description.split(/\n{2,}/).map((p, i) => <p key={i} className="mb-2 last:mb-0">{p}</p>)}</Block> : null}
            {e.agenda.length ? (
              <Block id="schedule" title="Schedule">
                <ol className="space-y-1.5">
                  {e.agenda.map((a, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-28 shrink-0 font-bold text-default">{a.time}</span>
                      <span>{a.title}</span>
                    </li>
                  ))}
                </ol>
              </Block>
            ) : null}
            {e.rules ? <Block id="rules" title="Rules"><p className="whitespace-pre-line">{e.rules}</p></Block> : null}
            {e.prizes ? (
              <Block id="prizes" title="Prizes">
                <p className="flex gap-2"><Trophy size={16} className="mt-0.5 shrink-0 text-sun-ink" aria-hidden />{e.prizes}</p>
              </Block>
            ) : null}
            {e.eligibility ? <Block id="eligibility" title="Eligibility"><p>{e.eligibility}</p></Block> : null}
            <Block id="organizer" title="Organiser">
              <p className="font-bold text-default">{e.organizerName ?? detail.institutionName}</p>
              <p>{detail.institutionName}</p>
              <VerificationBadge verification={e.verification} className="mt-1" />
              {e.contactEmail ? (
                <p className="mt-2"><a href={`mailto:${e.contactEmail}`} className="inline-flex items-center gap-1.5 font-bold text-brand hover:underline"><Mail size={14} aria-hidden />{e.contactEmail}</a></p>
              ) : null}
              {e.sourceUrl ? <p className="mt-1 text-[12px] text-subtle">Source: <a href={e.sourceUrl} className="underline" rel="noreferrer noopener" target="_blank">{e.sourceName}</a></p> : null}
            </Block>
            {e.faqs.length ? (
              <Block id="faqs" title="FAQs">
                <div className="space-y-2">
                  {e.faqs.map((f, i) => (
                    <details key={i} className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                      <summary className="cursor-pointer font-bold text-default">{f.q}</summary>
                      <p className="mt-1">{f.a}</p>
                    </details>
                  ))}
                </div>
              </Block>
            ) : null}
          </CampusCard>

          <ReportEvent eventId={e.id} />
        </div>

        <aside className="space-y-4" aria-label="Registration">
          <CampusCard className="hidden p-4 lg:block">
            <p className="mb-3 font-display text-[16px] font-extrabold text-default">
              {reg?.status === 'REGISTERED' ? 'You’re in! 🎉' : closed ? 'Registration closed' : full ? 'Event is full' : 'Join this event'}
            </p>
            {action}
          </CampusCard>
          {reg?.status === 'REGISTERED' ? (
            <CampusCard tone="lavender" className="p-4">
              <p className="font-display text-[15px] font-extrabold text-default">Your pass</p>
              <p className="mt-0.5 text-[12.5px] text-muted">Show it at the check-in desk. Code <span className="font-mono font-bold text-default">{reg.code}</span></p>
              {reg.checkedInAt ? (
                <p className="mt-2 text-[13px] font-bold text-mint-ink">✓ Checked in {relativeTime(reg.checkedInAt)}</p>
              ) : (
                <Link href={`/student/events/${e.id}/pass`} className="mt-3 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-surface text-[14px] font-extrabold text-default shadow-pop campus-press">
                  <QrCode size={17} aria-hidden /> Open QR pass
                </Link>
              )}
            </CampusCard>
          ) : null}
          {detail.certificate ? (
            <CampusCard tone="mint" className="p-4">
              <p className="flex items-center gap-2 font-display text-[15px] font-extrabold text-default"><Award size={17} aria-hidden /> Certificate earned</p>
              <Link href={`/student/certificates/${detail.certificate.id}`} className="mt-2 inline-block text-[13px] font-bold text-brand hover:underline">View certificate</Link>
            </CampusCard>
          ) : null}
          {e.certificateOffered && !detail.certificate ? (
            <p className="text-[12.5px] text-subtle">This event gives a certificate to attendees who check in.</p>
          ) : null}
        </aside>
      </div>

      {/* Sticky action on phones */}
      <div className="fixed inset-x-0 bottom-[68px] z-30 border-t-[1.5px] border-ink bg-surface p-3 lg:hidden">{action}</div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-ink bg-lavender text-lavender-ink" aria-hidden>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <dt className="text-[11.5px] font-bold uppercase tracking-wide text-subtle">{label}</dt>
        <dd className="font-bold text-default">{value}</dd>
      </div>
    </div>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 p-4 text-[14px] leading-relaxed text-muted sm:p-5" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="mb-2 font-display text-[17px] font-extrabold text-default">{title}</h2>
      {children}
    </section>
  );
}

/** "Hall B, New Town" + "New Town" + "Kolkata" → "Hall B, New Town, Kolkata" (no repeated parts). */
function joinPlace(parts: (string | null | undefined)[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    const seen = out.join(', ').toLowerCase();
    if (!seen.includes(part.toLowerCase())) out.push(part);
  }
  return out.join(', ');
}
