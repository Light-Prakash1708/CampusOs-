import { and, asc, eq, isNull } from 'drizzle-orm';
import { UserCog } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { num } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Faculty · CampusOS' };

export default async function FacultyPage() {
  const user = await requirePermission('user:view_all');

  const rows = await db
    .select({
      id: t.facultyProfiles.id,
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
      ),
    )
    .orderBy(asc(t.facultyProfiles.employeeCode));

  const STATUS_TONE = {
    BALANCED: 'success', HIGH: 'warning', CRITICAL: 'danger', UNDERLOADED: 'info',
  } as const;

  return (
    <div>
      <PageHeader title="Faculty" description={`${rows.length} members`} />

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
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
