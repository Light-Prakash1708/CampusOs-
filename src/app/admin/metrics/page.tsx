import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Section, Stat, Table, Td, Th } from '@/components/ui';
import { isPlatformOperator } from '@/services/institutions';
import { getPlatformMetrics } from '@/services/product-metrics';
import { getCampusDemand } from '@/services/campus-demand';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Product metrics · CampusOS' };

const WINDOWS = [7, 30, 90] as const;
const fmtPct = (v: number | null) => (v === null ? '—' : `${v}%`);

/**
 * PRODUCT METRICS (platform operators only). Every number is a count over
 * pseudonymous product events or the source tables; each carries its
 * definition. Colleges never see this page. See docs/ANALYTICS.md.
 */
export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireAuth();
  if (!isPlatformOperator(user)) notFound();
  const { days } = await searchParams;
  const windowDays = WINDOWS.includes(Number(days) as never) ? Number(days) : 30;
  const [m, demand] = await Promise.all([getPlatformMetrics(user, windowDays), getCampusDemand(user)]);

  return (
    <div>
      <PageHeader
        title="Product metrics"
        description="What people actually do in CampusOS. Pseudonymous counts only — no names, no messages, no page-by-page tracking."
        action={
          <div className="flex gap-1.5" role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <Link
                key={w}
                href={`/admin/metrics?days=${w}`}
                aria-current={w === windowDays ? 'page' : undefined}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium ${w === windowDays ? 'border-ink bg-ink text-white' : 'border-[hsl(var(--border))] bg-surface text-default'}`}
              >
                {w} days
              </Link>
            ))}
          </div>
        }
      />

      <Section title="Acquisition" description={`Last ${m.windowDays} days.`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Student sign-ups" value={m.acquisition.signups} sublabel="Personal workspaces created" />
          <Stat label="College join requests" value={m.acquisition.joinRequests} sublabel="Sent for verification" />
          <Stat label="Verified memberships" value={m.acquisition.verified} sublabel="Approved by a college" />
          <Stat label="Warm campuses" value={demand.warm.length} sublabel={`Unlisted colleges with ≥ ${demand.threshold} interested students`} />
        </div>
      </Section>

      <Section title="Activation" description="Sign-ups at least 7 days old in this window, who did something meaningful within 7 days (acknowledged a notice, checked attendance, used the planner, saved an opportunity, set a goal or career goal, or raised a grievance).">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Activation rate" value={fmtPct(m.activation.rate)} sublabel={`${m.activation.activated} of ${m.activation.cohort} sign-ups`} />
          <Stat label="Median time to first action" value={m.activation.medianHoursToFirstAction === null ? '—' : `${m.activation.medianHoursToFirstAction} h`} sublabel="Among activated sign-ups" />
          <Stat label="Evidence packs generated" value={m.institutional.evidencePacks} sublabel={`Last ${m.windowDays} days`} />
        </div>
      </Section>

      <Section title="Engagement" description="Distinct people who opened a portal (Asia/Kolkata days).">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Daily active" value={m.engagement.dau} sublabel="Today" />
          <Stat label="Weekly active" value={m.engagement.wau} sublabel="Last 7 days" />
          <Stat label="Monthly active" value={m.engagement.mau} sublabel="Last 30 days" />
          <Stat label="Weekly active students" value={fmtPct(m.engagement.wauPerStudent)} sublabel={`${m.engagement.wauStudents} of ${m.engagement.activeStudentAccounts} active student accounts`} />
        </div>
      </Section>

      <Section title="Institutions" description={`Colleges only (personal workspaces excluded). Notices and grievances: last ${m.windowDays} days.`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active colleges" value={m.institutional.activeColleges} sublabel="Anyone active in the last 7 days" />
          <Stat label="Active faculty (7 days)" value={m.institutional.activeFaculty7d} />
          <Stat label="Notices published" value={m.institutional.noticesPublished} />
          <Stat
            label="Acknowledgement rate"
            value={fmtPct(m.institutional.ackRate)}
            sublabel={`${m.institutional.ackReceived} of ${m.institutional.ackRequiredRecipients} required acknowledgements`}
          />
          <Stat label="Grievances opened" value={m.institutional.grievancesOpened} />
          <Stat label="Grievances resolved" value={m.institutional.grievancesResolved} />
        </div>
      </Section>

      <Section title="Retention" description="People first seen 60–150 days ago, and the share who came back in each period after their first day.">
        {m.retention.cohortSize === 0 ? (
          <Card><EmptyState title="Not enough history yet" description="Retention appears once people first seen 60+ days ago exist." /></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Cohort size" value={m.retention.cohortSize} />
            <Stat label="Week 1" value={fmtPct(m.retention.week1)} sublabel="Active on days 7–13" />
            <Stat label="Week 4" value={fmtPct(m.retention.week4)} sublabel="Active on days 28–34" />
            <Stat label="Month 1" value={fmtPct(m.retention.month1)} sublabel="Active on days 30–59" />
          </div>
        )}
      </Section>

      <Section title="Feature adoption" description="Distinct people who used each feature in the last 30 days, as a share of monthly actives.">
        <Card>
          <Table>
            <thead>
              <tr><Th>Feature</Th><Th align="right">People</Th><Th align="right">Share of monthly active</Th></tr>
            </thead>
            <tbody>
              {m.adoption.map((a) => (
                <tr key={a.feature}><Td>{a.feature}</Td><Td align="right">{a.actors}</Td><Td align="right">{fmtPct(a.shareOfMau)}</Td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Section>

      <Section title="By college" description="Active people in the last 7 days; notices in the window.">
        <Card>
          <CardHeader title={`${m.byInstitution.length} colleges`} />
          {m.byInstitution.length === 0 ? (
            <CardBody><EmptyState title="No colleges yet" description="Create one from Institutions." /></CardBody>
          ) : (
            <Table>
              <thead>
                <tr><Th>College</Th><Th align="right">Students active</Th><Th align="right">Staff active</Th><Th align="right">Notices</Th><Th align="right">Ack rate</Th></tr>
              </thead>
              <tbody>
                {m.byInstitution.map((i) => (
                  <tr key={i.id}>
                    <Td>{i.name}</Td>
                    <Td align="right">{i.activeStudents7d}</Td>
                    <Td align="right">{i.activeStaff7d}</Td>
                    <Td align="right">{i.notices}</Td>
                    <Td align="right">{fmtPct(i.ackRate)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>

      <Section title="Warm campuses" description={`Colleges not yet on CampusOS that at least ${demand.threshold} students have named. Counts only — individual students are never shown.`}>
        <Card>
          {demand.warm.length === 0 ? (
            <CardBody><EmptyState title="No warm campuses yet" description="When enough students name the same college, it appears here." /></CardBody>
          ) : (
            <Table>
              <thead>
                <tr><Th>College (as students typed it)</Th><Th align="right">Students</Th><Th>Last activity</Th></tr>
              </thead>
              <tbody>
                {demand.warm.map((d) => (
                  <tr key={d.key}>
                    <Td>{d.displayName}{d.city ? <span className="block text-[11.5px] text-subtle">{d.city}</span> : null}</Td>
                    <Td align="right">{d.students}</Td>
                    <Td>{d.lastSeen}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>
    </div>
  );
}
