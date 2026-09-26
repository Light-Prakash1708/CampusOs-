import Link from 'next/link';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { Alert, Card, CardBody, CardHeader, PageHeader, Section } from '@/components/ui';
import { humanize } from '@/lib/utils';
import { committeeStatus, listCommittee, UGC_TIMELINES } from '@/services/grievance-committee';
import { CommitteeManager } from './CommitteeManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SGRC & Ombudsperson · CampusOS' };

/**
 * The Students' Grievance Redressal Committee and the Ombudsperson
 * (CAMPUSOS-011). A checklist that supports the UGC 2023 structure — not a
 * compliance certificate.
 */
export default async function CommitteePage() {
  const user = await requirePermission('grievance:configure');
  const [members, status, staff] = await Promise.all([
    listCommittee(user),
    committeeStatus(user),
    db
      .select({ id: t.users.id, firstName: t.users.firstName, lastName: t.users.lastName, role: t.users.role })
      .from(t.users)
      .where(and(eq(t.users.institutionId, user.institutionId), eq(t.users.status, 'ACTIVE'), isNull(t.users.deletedAt), ne(t.users.role, 'STUDENT')))
      .orderBy(asc(t.users.firstName))
      .limit(1000),
  ]);

  return (
    <div>
      <PageHeader
        title="SGRC & Ombudsperson"
        description="Who handles student grievances and appeals. CampusOS supports a structured workflow aligned with the UGC (Redressal of Grievances of Students) Regulations, 2023; your college remains responsible for meeting them."
        breadcrumb={
          <Link href="/admin/redressal" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-default">
            <ArrowLeft size={13} /> Redressal
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <CommitteeManager
            members={members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), role: humanize(m.role), body: m.body, position: m.position, termEndsOn: m.termEndsOn }))}
            staff={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), role: humanize(s.role) }))}
            attestedAt={status.attestedAt}
          />
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Checklist" description={`${status.checks.filter((c) => c.done).length} of ${status.checks.length} in place`} />
            <CardBody>
              <ul className="space-y-2">
                {status.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-[13px]">
                    {c.done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-label="Done" /> : <Circle size={16} className="mt-0.5 shrink-0 text-subtle" aria-label="To do" />}
                    <span className="text-default">{c.label}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Section title="Timelines CampusOS tracks">
            <Card>
              <CardBody className="space-y-1.5 text-[13px] text-muted">
                <p>SGRC report: within <strong className="text-default">{UGC_TIMELINES.sgrcWorkingDays} working days</strong> of a grievance (Sundays and your holidays excluded).</p>
                <p>Student appeal to the Ombudsperson: within <strong className="text-default">{UGC_TIMELINES.appealWindowDays} days</strong> of the decision.</p>
                <p>Ombudsperson decision: within <strong className="text-default">{UGC_TIMELINES.ombudspersonDays} days</strong> of the appeal.</p>
              </CardBody>
            </Card>
          </Section>
          <Alert tone="info" title="What CampusOS does not record">
            Representation rules (a woman member; an SC/ST/OBC member) are confirmed by the college. CampusOS never asks for or stores anyone’s gender or social category for this.
          </Alert>
        </div>
      </div>
    </div>
  );
}
