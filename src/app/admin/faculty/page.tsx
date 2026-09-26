import { and, asc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';
import { UserCog } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { can, requirePermission } from '@/lib/auth/context';
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { num } from '@/lib/utils';
import { AccessToggle, InviteActions } from '../_components/PeopleActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Faculty · CampusOS' };

const ACCOUNT_TONE = { ACTIVE: 'success', INVITED: 'info', SUSPENDED: 'danger' } as const;

export default async function FacultyPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requirePermission('user:view_all');
  const params = await searchParams;
  const q = (params.q ?? '').trim().slice(0, 80);
  const statusFilter = ['ACTIVE', 'INVITED', 'SUSPENDED'].includes(params.status ?? '') ? params.status! : '';
  const filters: SQL[] = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(or(ilike(t.users.firstName, like), ilike(t.users.lastName, like), ilike(t.users.email, like), ilike(t.facultyProfiles.employeeCode, like))!);
  }
  if (statusFilter) filters.push(eq(t.users.status, statusFilter as 'ACTIVE' | 'INVITED' | 'SUSPENDED'));
  const canManage = can(user, 'user:deactivate');
  const canInvite = can(user, 'user:invite');

  const rows = await db
    .select({
      id: t.facultyProfiles.id,
      userId: t.users.id,
      accountStatus: t.users.status,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      email: t.users.email,
      employeeCode: t.facultyProfiles.employeeCode,
      designation: t.facultyProfiles.designation,
      departmentCode: t.departments.code,
      specializations: t.facultyProfiles.specializations,
      maxHours: t.facultyProfiles.maxWeeklyTeachingHours,
      constraintNotes: t.facultyProfiles.constraintNotes,
      totalHours: t.workloadSummaries.totalHours,
      status: t.workloadSummaries.status,
    })
    .from(t.facultyProfiles)
    .innerJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
    .innerJoin(t.departments, eq(t.departments.id, t.facultyProfiles.departmentId))
    .leftJoin(t.workloadSummaries, eq(t.workloadSummaries.facultyId, t.facultyProfiles.id))
    .where(
      and(
        eq(t.facultyProfiles.institutionId, user.institutionId),
        isNull(t.facultyProfiles.deletedAt),
        isNull(t.users.deletedAt),
        ...filters,
      ),
    )
    .orderBy(asc(t.facultyProfiles.employeeCode))
    .limit(500);

  const STATUS_TONE = {
    BALANCED: 'success', HIGH: 'warning', CRITICAL: 'danger', UNDERLOADED: 'info',
  } as const;

  return (
    <div>
      <PageHeader title="Faculty" description={`${rows.length} ${q || statusFilter ? 'matching' : 'members'}`} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <label className="min-w-[220px] flex-1">
          <span className="sr-only">Search faculty</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email or employee code"
            className="h-10 w-full rounded-lg border border-[hsl(var(--border-strong))] bg-surface px-3 text-[13.5px] text-default"
          />
        </label>
        <label>
          <span className="sr-only">Account status</span>
          <select name="status" defaultValue={statusFilter} className="h-10 rounded-lg border border-[hsl(var(--border-strong))] bg-surface px-3 text-[13.5px] text-default">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
        <button type="submit" className="h-10 rounded-lg border border-[hsl(var(--border-strong))] px-4 text-[13.5px] font-semibold text-default hover:bg-surface-sunken">
          Filter
        </button>
      </form>

      <Card>
        <CardHeader title="Faculty register" />
        {rows.length === 0 ? (
          <EmptyState icon={UserCog} title="No faculty recorded" description="Import your faculty list from the Data Import Centre." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Department</Th>
                <Th>Designation</Th>
                <Th align="right">Load</Th>
                <Th>Specialisations</Th>
                <Th>Account</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="hover:bg-surface-sunken">
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={`${f.firstName} ${f.lastName}`} size={28} />
                      <span>
                        <span className="block text-[13.5px] font-medium text-default">
                          {f.firstName} {f.lastName}
                        </span>
                        <span className="block text-[11.5px] text-subtle">{f.email}</span>
                      </span>
                    </span>
                  </Td>
                  <Td><span className="font-mono text-[12.5px] text-muted">{f.employeeCode}</span></Td>
                  <Td><span className="text-[12.5px] text-muted">{f.departmentCode}</span></Td>
                  <Td>
                    <span className="text-[12.5px] text-muted">{f.designation}</span>
                    {f.constraintNotes ? (
                      <span className="block pt-0.5 text-[11px] text-warning">{f.constraintNotes}</span>
                    ) : null}
                  </Td>
                  <Td align="right">
                    {f.totalHours ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="tabular text-[13px] text-default">
                          {num(f.totalHours)}/{f.maxHours}
                        </span>
                        {f.status ? (
                          <Badge tone={STATUS_TONE[f.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
                            {f.status.charAt(0) + f.status.slice(1).toLowerCase()}
                          </Badge>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-[11.5px] text-subtle">
                      {(f.specializations ?? []).length
                        ? (f.specializations as string[]).slice(0, 2).join(', ')
                        : '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={ACCOUNT_TONE[f.accountStatus as keyof typeof ACCOUNT_TONE] ?? 'neutral'}>
                        {f.accountStatus.charAt(0) + f.accountStatus.slice(1).toLowerCase()}
                      </Badge>
                      {f.accountStatus === 'INVITED' && canInvite ? <InviteActions userId={f.userId} email={f.email} /> : null}
                      {canManage ? <AccessToggle userId={f.userId} status={f.accountStatus} name={`${f.firstName} ${f.lastName}`} /> : null}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
