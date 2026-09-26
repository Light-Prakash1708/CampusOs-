import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ExternalLink } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { formatDateTime } from '@/lib/utils';
import { CampusCard, CampusPill, CampusSectionHeader, CampusTabs } from '@/components/campus';
import { ImportFeedButton, ModerateControls, OpportunityForm } from '@/components/campus/OpportunityActions';
import { adminOpportunities, KIND_LABEL } from '@/services/opportunities';

export const metadata = { title: 'Opportunities' };
export const dynamic = 'force-dynamic';

const STATUSES = ['PENDING', 'PUBLISHED', 'CLOSED', 'REJECTED'] as const;
const LABEL = { PENDING: 'To review', PUBLISHED: 'Published', CLOSED: 'Closed', REJECTED: 'Rejected' } as const;

export default async function AdminOpportunitiesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePermission('opportunity:manage');
  if (!isEnabled(user.featureFlags, 'opportunity_hub_enabled')) notFound();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof STATUSES)[number]) : 'PENDING';
  const [data, departments] = await Promise.all([
    adminOpportunities(user, status),
    db.select({ id: t.departments.id, name: t.departments.name }).from(t.departments).where(eq(t.departments.institutionId, user.institutionId)),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[26px] font-extrabold text-default sm:text-[30px]">Opportunities</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Publish listings for students, review what students share, and import from your college’s feed. Students only ever see what you’ve approved; you see how many applied, never who.
        </p>
      </header>

      <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="feed-h">
        <CampusSectionHeader id="feed-h" title="Feed" />
        <div className="mt-2">
          <ImportFeedButton feedName={data.feed?.name ?? null} />
        </div>
      </CampusCard>

      <CampusTabs
        label="Listings by status"
        active={status}
        tabs={STATUSES.map((s) => ({ key: s, label: LABEL[s], href: `/admin/opportunities?status=${s}`, count: data.counts[s] ?? 0 }))}
      />

      {data.rows.length === 0 ? (
        <p className="text-[13px] text-subtle">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {data.rows.map((o) => (
            <li key={o.id}>
              <CampusCard className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CampusPill tone="lavender">{KIND_LABEL[o.kind]}</CampusPill>
                    <CampusPill tone={o.source === 'COLLEGE' ? 'mint' : o.source === 'STUDENT' ? 'sun' : 'sky'}>
                      {o.source === 'COLLEGE' ? 'College' : o.source === 'STUDENT' ? `Student${o.submittedBy ? ` · ${o.submittedBy}` : ''}` : `Feed · ${o.sourceName}`}
                    </CampusPill>
                  </div>
                  <p className="text-[15px] font-extrabold text-default">{o.title}</p>
                  <p className="text-[13px] text-muted">
                    {o.organization}
                    {o.deadline ? ` · apply by ${formatDateTime(o.deadline)}` : ''}
                    {status !== 'PENDING' ? ` · ${o.applications} applied` : ''}
                  </p>
                  {o.skills.length ? <p className="text-[12px] text-subtle">Skills: {o.skills.join(', ')}</p> : null}
                  {o.reviewNote ? <p className="text-[12px] text-subtle">Note: {o.reviewNote}</p> : null}
                  {o.applyUrl ? (
                    <a href={o.applyUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-[36px] items-center gap-1 text-[12.5px] font-bold text-brand hover:underline">
                      Check the organiser’s page <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : (
                    <p className="text-[12px] font-bold text-coral-ink">No link to verify — ask the submitter for one.</p>
                  )}
                </div>
                <ModerateControls opportunityId={o.id} status={status} />
              </CampusCard>
            </li>
          ))}
        </ul>
      )}

      <CampusCard as="section" className="p-4 sm:p-6" aria-labelledby="add-h">
        <CampusSectionHeader id="add-h" title="Publish a listing" />
        <div className="mt-3">
          <OpportunityForm staff departments={departments} />
        </div>
      </CampusCard>
    </div>
  );
}
