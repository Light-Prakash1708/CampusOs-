import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { AlertTriangle, LifeBuoy, Plus, Timer } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  Section,
} from '@/components/ui';
import { formatDate, humanize, relativeTime } from '@/lib/utils';
import { isEnabled } from '@/lib/features';

import { requireStudentContext } from '../_lib/auth';
import { slaState } from '../_lib/sla';
import { grievanceStatusTone, ModuleDisabled, urgencyTone } from '../_components/bits';

export const metadata = { title: 'Readdressal' };
export const dynamic = 'force-dynamic';

const OPEN_STATES = [
  'SUBMITTED',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'UNDER_REVIEW',
  'AWAITING_INFORMATION',
  'RESOLUTION_PROPOSED',
  'REOPENED',
];

export default async function ReaddressalPage() {
  const user = await requireStudentContext('grievance:view_own');

  if (!isEnabled(user.featureFlags, 'grievance_enabled')) {
    return (
      <>
        <PageHeader title="Readdressal" />
        <ModuleDisabled
          module="The Readdressal Centre"
          blurb="Structured grievance handling is not part of your institution's current configuration."
        />
      </>
    );
  }

  const cases = await db
    .select({
      id: t.grievances.id,
      caseNumber: t.grievances.caseNumber,
      subject: t.grievances.subject,
      status: t.grievances.status,
      urgency: t.grievances.urgency,
      createdAt: t.grievances.createdAt,
      updatedAt: t.grievances.updatedAt,
      responseDueAt: t.grievances.responseDueAt,
      resolutionDueAt: t.grievances.resolutionDueAt,
      firstResponseAt: t.grievances.firstResponseAt,
      resolvedAt: t.grievances.resolvedAt,
      isSlaBreached: t.grievances.isSlaBreached,
      escalationLevel: t.grievances.escalationLevel,
      isAnonymous: t.grievances.isAnonymous,
      categoryName: t.grievanceCategories.name,
    })
    .from(t.grievances)
    .innerJoin(t.grievanceCategories, eq(t.grievanceCategories.id, t.grievances.categoryId))
    .where(
      and(
        eq(t.grievances.institutionId, user.institutionId),
        eq(t.grievances.raisedById, user.userId),
      ),
    )
    .orderBy(desc(t.grievances.createdAt));

  const open = cases.filter((c) => OPEN_STATES.includes(c.status));
  const closed = cases.filter((c) => !OPEN_STATES.includes(c.status));

  return (
    <>
      <PageHeader
        title="Readdressal"
        description="Raise an issue and track it to a resolution, with a deadline the institution is held to."
        action={
          <Button asChild variant="primary" icon={Plus}>
            <Link href="/student/readdressal/new">Raise a case</Link>
          </Button>
        }
      />

      {cases.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={LifeBuoy}
              title="You have not raised any cases"
              description="Attendance disputes, timetable clashes, exam queries, facilities and IT problems all go through here. Each case gets a reference, an owner and a response deadline."
              action={
                <Button asChild variant="primary" size="sm" icon={Plus}>
                  <Link href="/student/readdressal/new">Raise a case</Link>
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <Section title={`Open · ${open.length}`}>
            {open.length === 0 ? (
              <Card>
                <CardBody className="p-0">
                  <EmptyState
                    icon={LifeBuoy}
                    title="No open cases"
                    description="Everything you have raised has been resolved or closed."
                  />
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-3">
                {open.map((c) => (
                  <CaseCard key={c.id} item={c} />
                ))}
              </div>
            )}
          </Section>

          {closed.length > 0 ? (
            <Section title={`Closed · ${closed.length}`}>
              <div className="space-y-3">
                {closed.map((c) => (
                  <CaseCard key={c.id} item={c} />
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}

type CaseRow = {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
  urgency: string;
  createdAt: Date;
  updatedAt: Date;
  responseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  isSlaBreached: boolean;
  escalationLevel: number;
  isAnonymous: boolean;
  categoryName: string;
};

function CaseCard({ item }: { item: CaseRow }) {
  const isOpen = OPEN_STATES.includes(item.status);
  const sla = slaState(item);

  return (
    <Card>
      <CardBody>
        <Link href={`/student/readdressal/${item.id}`} className="group block">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11.5px] text-subtle">{item.caseNumber}</p>
              <p className="mt-0.5 text-[14px] font-medium leading-snug text-default group-hover:text-brand">
                {item.subject}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Badge tone={grievanceStatusTone(item.status)}>{humanize(item.status)}</Badge>
              <Badge tone={urgencyTone(item.urgency)}>{humanize(item.urgency)}</Badge>
            </div>
          </div>
        </Link>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-subtle">
          <span>{item.categoryName}</span>
          <span>Raised {formatDate(item.createdAt)}</span>
          <span>Updated {relativeTime(item.updatedAt)}</span>
          {item.isAnonymous ? <Badge tone="neutral">anonymous</Badge> : null}
          {item.escalationLevel > 0 ? (
            <Badge tone="warning">escalated ×{item.escalationLevel}</Badge>
          ) : null}
        </div>

        {isOpen ? (
          <p
            className={`mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] ${
              sla.breached
                ? 'bg-danger-subtle text-danger'
                : sla.urgent
                  ? 'bg-warning-subtle text-warning'
                  : 'bg-surface-sunken text-muted'
            }`}
          >
            {sla.breached ? <AlertTriangle size={12} aria-hidden /> : <Timer size={12} aria-hidden />}
            {sla.label}
          </p>
        ) : item.resolvedAt ? (
          <p className="mt-2.5 text-[12px] text-success">
            Resolved {formatDate(item.resolvedAt)}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
