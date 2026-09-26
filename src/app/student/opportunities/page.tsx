import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Briefcase, CalendarClock, CheckCircle2, ExternalLink, MapPin, Search } from 'lucide-react';
import { isEnabled } from '@/lib/features';
import { cn, formatDateTime, relativeTime, truncate } from '@/lib/utils';
import { CampusCard, CampusEmptyState, CampusFilter, CampusPill, CampusSectionHeader, CampusTabs } from '@/components/campus';
import { OpportunityForm, TrackSelect } from '@/components/campus/OpportunityActions';
import { KIND_LABEL, listForStudent, OPPORTUNITY_KINDS } from '@/services/opportunities';
import { requireStudentContext } from '../_lib/auth';

export const metadata = { title: 'Opportunities' };
export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string; q?: string }> }) {
  const user = await requireStudentContext('opportunity:view');
  if (!isEnabled(user.featureFlags, 'opportunity_hub_enabled')) notFound();
  const sp = await searchParams;
  const tab = sp.tab === 'mine' ? 'mine' : sp.tab === 'submit' ? 'submit' : 'discover';
  const kind = (OPPORTUNITY_KINDS as readonly string[]).includes(sp.kind ?? '') ? sp.kind : undefined;
  const q = sp.q?.trim().slice(0, 120) || undefined;
  const items = tab === 'submit' ? [] : await listForStudent(user, { kind, q, tracked: tab === 'mine' });
  const skillsOn = isEnabled(user.featureFlags, 'skill_engine_enabled');
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ tab, kind, q, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `/student/opportunities?${s}` : '/student/opportunities';
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[26px] font-extrabold text-default sm:text-[30px]">Opportunities</h1>
        <p className="mt-1 text-[13.5px] text-muted">Internships, jobs, hackathons and scholarships shared at your college — each one checked by your college before it appears here.</p>
      </header>

      <CampusTabs
        label="Opportunities"
        active={tab}
        tabs={[
          { key: 'discover', label: 'Discover', href: '/student/opportunities' },
          { key: 'mine', label: 'My applications', href: '/student/opportunities?tab=mine' },
          { key: 'submit', label: 'Share one', href: '/student/opportunities?tab=submit' },
        ]}
      />

      {tab === 'submit' ? (
        <CampusCard as="section" className="p-4 sm:p-6" aria-labelledby="share-h">
          <CampusSectionHeader id="share-h" title="Share an opportunity" />
          <p className="mt-1 text-[13px] text-muted">Found something good? Share it with your college. Include the organiser’s own link so others can check it.</p>
          <div className="mt-4">
            <OpportunityForm staff={user.permissions.has('opportunity:manage')} />
          </div>
        </CampusCard>
      ) : (
        <>
          <form action="/student/opportunities" method="get" role="search" aria-label="Search opportunities" className="flex gap-2">
            {tab === 'mine' ? <input type="hidden" name="tab" value="mine" /> : null}
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            <label className="relative flex-1">
              <span className="sr-only">Search</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                name="q"
                defaultValue={q}
                placeholder="Role, organisation or skill"
                className="h-11 w-full rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface pl-9 pr-3 text-[13.5px] text-default placeholder:text-subtle focus:border-ink"
              />
            </label>
            <button type="submit" className="min-h-[44px] rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[13px] font-extrabold text-white shadow-pop campus-press">
              Search
            </button>
          </form>
          <CampusFilter
            label="Type"
            options={[
              { key: 'all', label: 'All', href: qs({ kind: undefined }), active: !kind },
              ...OPPORTUNITY_KINDS.map((k) => ({ key: k, label: KIND_LABEL[k], href: qs({ kind: k }), active: kind === k })),
            ]}
          />

          {items.length === 0 ? (
            <CampusCard className="py-4">
              <CampusEmptyState
                sprite="student"
                title={tab === 'mine' ? 'You aren’t tracking anything yet' : q || kind ? 'Nothing matches' : 'No open opportunities right now'}
                description={
                  tab === 'mine'
                    ? 'Set a status on any listing — Saved, Applied, Interviewing — and it shows up here. Only you can see it.'
                    : 'Your placement cell publishes listings here. You can also share one you found.'
                }
                action={
                  tab !== 'mine' ? (
                    <Link href="/student/opportunities?tab=submit" className="inline-flex min-h-[44px] items-center rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[13px] font-extrabold text-white shadow-pop">
                      Share an opportunity
                    </Link>
                  ) : undefined
                }
              />
            </CampusCard>
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label={`${items.length} opportunities`}>
              {items.map((o) => {
                const closed = !!o.deadline && o.deadline < new Date();
                return (
                  <li key={o.id}>
                    <CampusCard className="flex h-full flex-col gap-2.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[15px] font-extrabold leading-snug text-default">{o.title}</p>
                          <p className="text-[13px] font-semibold text-muted">{o.organization}</p>
                        </div>
                        <CampusPill tone="lavender">{KIND_LABEL[o.kind]}</CampusPill>
                      </div>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-subtle">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} aria-hidden /> {o.workMode === 'REMOTE' ? 'Remote' : [o.location, o.workMode === 'HYBRID' ? 'Hybrid' : null].filter(Boolean).join(' · ') || 'Location not given'}
                        </span>
                        {o.compensation ? (
                          <span className="inline-flex items-center gap-1">
                            <Briefcase size={12} aria-hidden /> {o.compensation}
                          </span>
                        ) : null}
                        {o.deadline ? (
                          <span className={cn('inline-flex items-center gap-1 font-bold', closed ? 'text-coral-ink' : 'text-muted')}>
                            <CalendarClock size={12} aria-hidden /> {closed ? 'Closed' : `Apply by ${formatDateTime(o.deadline)} (${relativeTime(o.deadline)})`}
                          </span>
                        ) : null}
                      </p>
                      {o.description ? <p className="text-[12.5px] text-muted">{truncate(o.description, 200)}</p> : null}
                      {o.eligibility ? <p className="text-[12px] text-subtle">Eligibility: {o.eligibility}</p> : null}
                      {o.skills.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {o.skills.map((s) => {
                            const has = o.match.matched.includes(s);
                            return (
                              <span
                                key={s}
                                className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-bold', has ? 'border-ink bg-mint text-mint-ink' : 'border-[hsl(var(--border))] text-muted')}
                              >
                                {has ? <CheckCircle2 size={11} aria-label="You have this skill" /> : null}
                                {s}
                              </span>
                            );
                          })}
                          {skillsOn ? (
                            <span className="text-[11.5px] text-subtle">
                              You have {o.match.matched.length} of {o.skills.length} from your skill profile
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                        {o.applyUrl && !closed ? (
                          <a
                            href={o.applyUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-brand px-3.5 text-[13px] font-extrabold text-white shadow-pop campus-press"
                          >
                            Apply on their site <ExternalLink size={13} aria-hidden />
                          </a>
                        ) : null}
                        <TrackSelect opportunityId={o.id} status={o.track} title={o.title} />
                      </div>
                      <p className="text-[11px] text-subtle">{o.source === 'COLLEGE' ? 'Posted by your college' : o.source === 'STUDENT' ? 'Shared by a student · approved by your college' : 'From your college’s feed · approved by your college'}</p>
                    </CampusCard>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
