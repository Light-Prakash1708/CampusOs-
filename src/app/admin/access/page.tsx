import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAnyPermission, can } from '@/lib/auth/context';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Section } from '@/components/ui';
import { listPendingRegistrations } from '@/services/auth/accounts';
import { listDeletionRequests } from '@/services/privacy';
import { formatDateTime } from '@/lib/utils';
import { InviteForm, RegistrationDecision, DeletionDecision } from './AccessForms';
import { InviteActions } from '../_components/PeopleActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Access & Privacy · CampusOS' };

export default async function AccessPage() {
  const user = await requireAnyPermission(['user:invite', 'user:approve_registration', 'privacy:handle_requests']);

  const [departments, programs, sections, pending, deletions, invited] = await Promise.all([
    db.select({ id: t.departments.id, name: t.departments.name }).from(t.departments)
      .where(and(eq(t.departments.institutionId, user.institutionId), isNull(t.departments.deletedAt))).orderBy(asc(t.departments.name)),
    db.select({ id: t.programs.id, name: t.programs.name, departmentId: t.programs.departmentId }).from(t.programs)
      .where(and(eq(t.programs.institutionId, user.institutionId), isNull(t.programs.deletedAt))).orderBy(asc(t.programs.name)),
    db.select({ id: t.sections.id, name: t.sections.name, programId: t.sections.programId, year: t.sections.year }).from(t.sections)
      .where(and(eq(t.sections.institutionId, user.institutionId), isNull(t.sections.deletedAt))).orderBy(asc(t.sections.name)),
    can(user, 'user:approve_registration') ? listPendingRegistrations(user) : Promise.resolve([]),
    can(user, 'privacy:handle_requests') ? listDeletionRequests(user) : Promise.resolve([]),
    db.select({ id: t.users.id, email: t.users.email, role: t.users.role, createdAt: t.users.createdAt }).from(t.users)
      .where(and(eq(t.users.institutionId, user.institutionId), eq(t.users.status, 'INVITED'), isNull(t.users.deletedAt)))
      .orderBy(asc(t.users.createdAt)).limit(50),
  ]);

  const openDeletions = deletions.filter((d) => d.status === 'PENDING');

  return (
    <div>
      <PageHeader title="Access & Privacy" description="Invite people, approve student registrations and handle data requests." />

      {can(user, 'user:invite') ? (
        <Section title="Invite someone">
          <Card>
            <CardBody>
              <InviteForm
                canInviteStaff={can(user, 'role:manage')}
                departments={departments}
                programs={programs}
                sections={sections}
              />
            </CardBody>
          </Card>
          {invited.length > 0 ? (
            <Card className="mt-3">
              <CardHeader title="Waiting to accept" description="Invited or imported accounts that have not set a password yet." />
              <ul className="divide-y divide-[hsl(var(--border))]">
                {invited.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                    <span className="min-w-0 truncate text-default">{u.email}</span>
                    <span className="shrink-0 text-subtle">{u.role.toLowerCase()} · {formatDateTime(u.createdAt)}</span>
                    <InviteActions userId={u.id} email={u.email} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </Section>
      ) : null}

      {can(user, 'user:approve_registration') ? (
        <Section title="Student registrations">
          <Card>
            {pending.length === 0 ? (
              <EmptyState title="No registrations waiting" description="Students who register themselves appear here when your college reviews new accounts." />
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {pending.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-default">{r.firstName} {r.lastName} <span className="font-normal text-subtle">· {r.rollNumber}</span></p>
                      <p className="text-[12.5px] text-muted">
                        {r.email} · {r.programName} · Year {r.year}{r.sectionName ? ` · ${r.sectionName}` : ''}
                        {r.emailVerifiedAt ? '' : ' · email not confirmed yet'}
                      </p>
                    </div>
                    <RegistrationDecision userId={r.id} mode="decide" canApprove={!!r.emailVerifiedAt} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      ) : null}

      {can(user, 'privacy:handle_requests') ? (
        <Section title="Account deletion requests">
          <Card>
            {openDeletions.length === 0 ? (
              <EmptyState title="No open requests" description="When someone asks to delete their account, the request waits here for review." />
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {openDeletions.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-default">{d.name} <span className="font-normal text-subtle">· {d.role.toLowerCase()}</span></p>
                      <p className="text-[12.5px] text-muted">{d.email} · requested {formatDateTime(d.requestedAt)}{d.reason ? ` · “${d.reason}”` : ''}</p>
                    </div>
                    <DeletionDecision requestId={d.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="mt-2 text-[12.5px] text-subtle">
            Approving anonymises the account: personal data is deleted, academic records your institution must keep stay attached to an anonymous identity.
          </p>
        </Section>
      ) : null}
    </div>
  );
}
