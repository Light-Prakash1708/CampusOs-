import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Boxes } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { humanize } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Subjects · CampusOS' };

export default async function SubjectsPage() {
  const user = await requirePermission('academic:view_structure');

  const rows = await db
    .select({
      id: t.subjects.id,
      code: t.subjects.code,
      name: t.subjects.name,
      kind: t.subjects.kind,
      credits: t.subjects.credits,
      weeklyHours: t.subjects.weeklyHours,
      blockSize: t.subjects.consecutiveBlockSize,
      roomType: t.subjects.requiredRoomType,
      semester: t.subjects.semester,
      departmentCode: t.departments.code,
      outcomes: t.subjects.outcomes,
      offeringCount: sql<number>`(
        select count(*) from course_offerings co
        where co.subject_id = ${t.subjects.id} and co.deleted_at is null
      )`,
    })
    .from(t.subjects)
    .innerJoin(t.departments, eq(t.departments.id, t.subjects.departmentId))
    .where(and(eq(t.subjects.institutionId, user.institutionId), isNull(t.subjects.deletedAt)))
    .orderBy(asc(t.subjects.code));

  return (
    <div>
      <PageHeader
        title="Subjects"
        description={`${rows.length} in the catalogue. Weekly hours and block size drive how the solver places them.`}
      />

      <Card>
        <CardHeader title="Subject catalogue" />
        {rows.length === 0 ? (
          <EmptyState icon={Boxes} title="No subjects" description="Import your subject catalogue from the Data Import Centre." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Subject</Th>
                <Th>Dept</Th>
                <Th>Type</Th>
                <Th align="right">Credits</Th>
                <Th align="right">Hrs/week</Th>
                <Th>Room needed</Th>
                <Th align="right">Sections</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-surface-sunken">
                  <Td><span className="font-mono text-[12.5px] text-muted">{s.code}</span></Td>
                  <Td>
                    <span className="text-[13.5px] font-medium text-default">{s.name}</span>
                    {(s.outcomes ?? []).length ? (
                      <span className="block pt-0.5 text-[11.5px] text-subtle">
                        {(s.outcomes as string[])[0]}
                      </span>
                    ) : null}
                  </Td>
                  <Td><span className="text-[12.5px] text-muted">{s.departmentCode}</span></Td>
                  <Td><Badge tone={s.kind === 'LAB' ? 'info' : 'neutral'}>{humanize(s.kind)}</Badge></Td>
                  <Td align="right" className="tabular text-muted">{s.credits}</Td>
                  <Td align="right" className="tabular">
                    {s.weeklyHours}
                    {s.blockSize > 1 ? (
                      <span className="text-[11px] text-subtle"> ({s.blockSize}-period blocks)</span>
                    ) : null}
                  </Td>
                  <Td><span className="text-[12.5px] text-muted">{s.roomType ? humanize(s.roomType) : 'Any'}</span></Td>
                  <Td align="right" className="tabular text-muted">{Number(s.offeringCount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
