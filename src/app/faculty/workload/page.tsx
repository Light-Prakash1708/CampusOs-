import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { Gauge, TriangleAlert } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Progress,
  Section,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate, humanize, num, pluralize, relativeTime } from '@/lib/utils';
import { getCurrentTerm, getMyFacultyProfile, getMyOfferings } from '../_lib/faculty';
import { NoFacultyProfile } from '../_components/NoFacultyProfile';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My workload · CampusOS' };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  BALANCED: 'success',
  HIGH: 'warning',
  CRITICAL: 'danger',
  UNDERLOADED: 'info',
};

const KIND_LABEL: Record<string, string> = {
  TEACHING: 'Teaching',
  LAB: 'Lab',
  ASSESSMENT: 'Assessment',
  ADMINISTRATIVE: 'Administrative',
  MENTORING: 'Mentoring',
  MEETING: 'Meetings',
  EXAM_DUTY: 'Exam duty',
  RESEARCH: 'Research',
  OTHER: 'Other',
};

export default async function WorkloadPage() {
  const user = await requirePermission('workload:view_own');

  if (!user.facultyProfileId) {
    return (
      <div>
        <PageHeader title="My workload" />
        <NoFacultyProfile what="Your workload" />
      </div>
    );
  }

  const [term, profile] = await Promise.all([
    getCurrentTerm(user.institutionId),
    getMyFacultyProfile(user),
  ]);

  if (!term) {
    return (
      <div>
        <PageHeader title="My workload" />
        <Alert tone="warning" icon={TriangleAlert} title="No current academic term">
          Workload is computed per term, and no term is marked current.
        </Alert>
      </div>
    );
  }

  const [summaryRows, records, offerings] = await Promise.all([
    db
      .select()
      .from(t.workloadSummaries)
      .where(
        and(
          eq(t.workloadSummaries.institutionId, user.institutionId),
          eq(t.workloadSummaries.facultyId, user.facultyProfileId),
          eq(t.workloadSummaries.termId, term.id),
        ),
      )
      .limit(1),
    db
      .select({
        id: t.workloadRecords.id,
        kind: t.workloadRecords.kind,
        description: t.workloadRecords.description,
        weeklyHours: t.workloadRecords.weeklyHours,
        source: t.workloadRecords.source,
        sourceType: t.workloadRecords.sourceType,
        offeringId: t.workloadRecords.offeringId,
        effectiveFrom: t.workloadRecords.effectiveFrom,
        effectiveTo: t.workloadRecords.effectiveTo,
        updatedAt: t.workloadRecords.updatedAt,
      })
      .from(t.workloadRecords)
      .where(
        and(
          eq(t.workloadRecords.institutionId, user.institutionId),
          eq(t.workloadRecords.facultyId, user.facultyProfileId),
          eq(t.workloadRecords.termId, term.id),
        ),
      )
      .orderBy(asc(t.workloadRecords.kind)),
    getMyOfferings(user, term.id),
  ]);

  const summary = summaryRows[0] ?? null;
  const contracted = profile?.maxWeeklyTeachingHours ?? null;
  const offeringById = new Map(offerings.map((o) => [o.id, o]));

  const recordTotal = records.reduce((sum, r) => sum + Number(r.weeklyHours), 0);
  const summaryTotal = summary ? Number(summary.totalHours) : null;
  const reconciles =
    summaryTotal === null || Math.abs(summaryTotal - recordTotal) < 0.01;

  const breakdown = summary
    ? [
        { kind: 'TEACHING', hours: Number(summary.teachingHours) },
        { kind: 'LAB', hours: Number(summary.labHours) },
        { kind: 'ASSESSMENT', hours: Number(summary.assessmentHours) },
        { kind: 'ADMINISTRATIVE', hours: Number(summary.administrativeHours) },
        { kind: 'MENTORING', hours: Number(summary.mentoringHours) },
        { kind: 'OTHER', hours: Number(summary.otherHours) },
      ].filter((b) => b.hours > 0)
    : Object.entries(
        records.reduce<Record<string, number>>((acc, r) => {
          acc[r.kind] = (acc[r.kind] ?? 0) + Number(r.weeklyHours);
          return acc;
        }, {}),
      ).map(([kind, hours]) => ({ kind, hours }));

  const maxBreakdown = Math.max(1, ...breakdown.map((b) => b.hours));
  const deptAverage = summary?.departmentAverage ? Number(summary.departmentAverage) : null;
  const total = summaryTotal ?? recordTotal;

  return (
    <div>
      <PageHeader
        title="My workload"
        description={`${term.name} · every hour below traces to a recorded item`}
        action={
          summary ? (
            <Badge tone={STATUS_TONE[summary.status] ?? 'neutral'} dot>
              {humanize(summary.status)}
            </Badge>
          ) : undefined
        }
      />

      {records.length === 0 && !summary ? (
        <Card>
          <EmptyState
            icon={Gauge}
            title="No workload has been recorded for you this term"
            description="Workload is built from your timetable allocations plus items recorded by your department. Nothing has been attributed to you yet."
          />
        </Card>
      ) : (
        <>
          {!reconciles ? (
            <Alert
              tone="warning"
              icon={TriangleAlert}
              title="The summary and the underlying records disagree"
              className="mb-5"
            >
              The cached summary says {num(summaryTotal)} hours a week, but the{' '}
              {pluralize(records.length, 'record')} below add up to {num(recordTotal)}. The records
              are the source of truth; the summary was last recomputed{' '}
              {relativeTime(summary?.recomputedAt)}. Ask your department to recompute it.
            </Alert>
          ) : null}

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Total weekly hours"
              value={`${num(total)} h`}
              icon={Gauge}
              tone={
                contracted !== null && total > contracted
                  ? 'danger'
                  : summary
                    ? STATUS_TONE[summary.status] ?? 'neutral'
                    : 'neutral'
              }
              sublabel={`From ${pluralize(records.length, 'record')}`}
            />
            <Stat
              label="Contracted maximum"
              value={contracted === null ? '—' : `${contracted} h`}
              sublabel={
                contracted !== null && total > contracted
                  ? `${num(total - contracted)} h over`
                  : contracted !== null
                    ? `${num(contracted - total)} h of headroom`
                    : 'Not recorded on your profile'
              }
            />
            <Stat
              label="Department average"
              value={deptAverage === null ? '—' : `${num(deptAverage)} h`}
              sublabel={
                deptAverage === null
                  ? 'Not computed'
                  : total > deptAverage
                    ? `${num(total - deptAverage)} h above average`
                    : `${num(deptAverage - total)} h below average`
              }
            />
            <Stat
              label="Utilisation"
              value={
                summary?.utilizationPercentage
                  ? `${num(summary.utilizationPercentage)}%`
                  : contracted
                    ? `${num((total / contracted) * 100)}%`
                    : '—'
              }
              sublabel="Of the contracted maximum"
            />
          </div>

          {contracted !== null ? (
            <Card className="mb-6">
              <CardBody>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] text-muted">
                    {num(total)} of {contracted} contracted hours
                  </p>
                  {deptAverage !== null ? (
                    <p className="text-[12.5px] text-subtle">
                      Department average {num(deptAverage)} h
                    </p>
                  ) : null}
                </div>
                <Progress
                  className="mt-2"
                  value={total}
                  max={Math.max(contracted, total)}
                  tone={total > contracted ? 'danger' : 'brand'}
                  showLabel
                />
                {total > contracted ? (
                  <p className="mt-2 text-[12.5px] text-danger">
                    You are {num(total - contracted)} hours a week above your contracted maximum.
                    Raise a workload readdressal case if this needs to be rebalanced.
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Section title="By kind">
            <Card>
              <CardBody>
                {breakdown.length === 0 ? (
                  <p className="text-[13px] text-muted">No hours have been attributed yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {breakdown.map((b) => (
                      <li key={b.kind}>
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="text-default">{KIND_LABEL[b.kind] ?? humanize(b.kind)}</span>
                          <span className="tabular text-muted">
                            {num(b.hours)} h · {Math.round((b.hours / (total || 1)) * 100)}%
                          </span>
                        </div>
                        <Progress className="mt-1" value={b.hours} max={maxBreakdown} />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-[12px] text-subtle">
                  {summary
                    ? `Figures from the cached workload summary, recomputed ${relativeTime(summary.recomputedAt)}.`
                    : 'No cached summary exists, so these figures are computed directly from the records below.'}
                </p>
              </CardBody>
            </Card>
          </Section>

          <Section
            title="Where every hour comes from"
            description="Derived items are recomputed from the timetable; manual items are entered by your department."
          >
            <Card>
              {records.length === 0 ? (
                <EmptyState
                  icon={Gauge}
                  title="No underlying records"
                  description="A summary exists but no records back it. Without records the total cannot be traced, so treat it with caution."
                />
              ) : (
                <>
                  <CardHeader
                    title={`${pluralize(records.length, 'record')} · ${num(recordTotal)} hours a week`}
                  />
                  <Table>
                    <thead>
                      <tr>
                        <Th>Kind</Th>
                        <Th>What it is</Th>
                        <Th>Source</Th>
                        <Th>Effective</Th>
                        <Th align="right">Hours / week</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => {
                        const offering = r.offeringId ? offeringById.get(r.offeringId) : null;
                        return (
                          <tr key={r.id}>
                            <Td>
                              <Badge tone="outline">{KIND_LABEL[r.kind] ?? humanize(r.kind)}</Badge>
                            </Td>
                            <Td>
                              {offering ? (
                                <Link
                                  href={`/faculty/classes/${offering.id}`}
                                  className="text-[13.5px] text-default hover:text-brand"
                                >
                                  {r.description}
                                </Link>
                              ) : (
                                <span className="text-[13.5px] text-default">{r.description}</span>
                              )}
                            </Td>
                            <Td>
                              <Badge tone={r.source === 'DERIVED' ? 'brand' : 'neutral'}>
                                {r.source === 'DERIVED'
                                  ? `derived from ${r.sourceType?.replace(/_/g, ' ') ?? 'the timetable'}`
                                  : 'entered manually'}
                              </Badge>
                            </Td>
                            <Td className="text-[12.5px] text-muted">
                              {r.effectiveFrom
                                ? `${formatDate(r.effectiveFrom, false)}${
                                    r.effectiveTo ? ` – ${formatDate(r.effectiveTo, false)}` : ' onwards'
                                  }`
                                : 'Whole term'}
                            </Td>
                            <Td align="right" className="tabular text-[13.5px] font-medium">
                              {num(r.weeklyHours)}
                            </Td>
                          </tr>
                        );
                      })}
                      <tr>
                        <Td />
                        <Td />
                        <Td />
                        <Td align="right" className="text-[12.5px] font-semibold text-muted">
                          Total
                        </Td>
                        <Td align="right" className="tabular text-[14px] font-semibold">
                          {num(recordTotal)}
                        </Td>
                      </tr>
                    </tbody>
                  </Table>
                </>
              )}
            </Card>
          </Section>
        </>
      )}
    </div>
  );
}
