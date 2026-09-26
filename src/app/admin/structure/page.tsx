import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { Building2 } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { can, requirePermission } from '@/lib/auth/context';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { pluralize } from '@/lib/utils';
import { AddStructure } from './AddStructure';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Academic structure · CampusOS' };

/**
 * The academic hierarchy that drives audience targeting, timetabling and
 * reporting: Institution → Campus → Department → Programme → Section.
 */
export default async function StructurePage() {
  const user = await requirePermission('academic:view_structure');

  const [departments, programs, sections, campuses, terms] = await Promise.all([
    db
      .select({
        id: t.departments.id,
        code: t.departments.code,
        name: t.departments.name,
        school: t.departments.school,
        hodFirst: t.users.firstName,
        hodLast: t.users.lastName,
      })
      .from(t.departments)
      .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.departments.headOfDepartmentId))
      .leftJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
      .where(and(eq(t.departments.institutionId, user.institutionId), isNull(t.departments.deletedAt)))
      .orderBy(asc(t.departments.code)),
    db
      .select({
        id: t.programs.id,
        code: t.programs.code,
        name: t.programs.name,
        level: t.programs.level,
        durationYears: t.programs.durationYears,
        departmentCode: t.departments.code,
      })
      .from(t.programs)
      .innerJoin(t.departments, eq(t.departments.id, t.programs.departmentId))
      .where(and(eq(t.programs.institutionId, user.institutionId), isNull(t.programs.deletedAt)))
      .orderBy(asc(t.programs.code)),
    db
      .select({
        id: t.sections.id,
        code: t.sections.code,
        year: t.sections.year,
        semester: t.sections.semester,
        strength: t.sections.strength,
        programCode: t.programs.code,
        homeRoom: t.rooms.code,
      })
      .from(t.sections)
      .innerJoin(t.programs, eq(t.programs.id, t.sections.programId))
      .leftJoin(t.rooms, eq(t.rooms.id, t.sections.homeRoomId))
      .where(and(eq(t.sections.institutionId, user.institutionId), isNull(t.sections.deletedAt)))
      .orderBy(asc(t.sections.code)),
    db
      .select({ id: t.campuses.id, code: t.campuses.code, name: t.campuses.name, isPrimary: t.campuses.isPrimary })
      .from(t.campuses)
      .where(and(eq(t.campuses.institutionId, user.institutionId), isNull(t.campuses.deletedAt))),
    db
      .select({
        id: t.terms.id,
        name: t.terms.name,
        semesterNumber: t.terms.semesterNumber,
        startDate: t.terms.startDate,
        endDate: t.terms.endDate,
        isCurrent: t.terms.isCurrent,
      })
      .from(t.terms)
      .where(eq(t.terms.institutionId, user.institutionId))
      .orderBy(asc(t.terms.startDate)),
  ]);

  return (
    <div>
      <PageHeader
        title="Academic structure"
        description="The hierarchy that drives targeting, timetabling and reporting."
      />

      {can(user, 'academic:manage_structure') ? (
        <Section title="Add to your structure">
          <Card>
            <CardBody>
              <AddStructure
                departments={departments.map((d) => ({ id: d.id, name: `${d.name} (${d.code})` }))}
                programs={programs.map((p) => ({ id: p.id, name: `${p.name} (${p.code})`, durationYears: p.durationYears }))}
              />
            </CardBody>
          </Card>
        </Section>
      ) : null}

      <Section title="Campuses">
        <Card>
          <CardBody className="flex flex-wrap gap-2">
            {campuses.map((c) => (
              <Badge key={c.id} tone={c.isPrimary ? 'brand' : 'neutral'}>
                {c.name} ({c.code}){c.isPrimary ? ' · primary' : ''}
              </Badge>
            ))}
            {campuses.length === 0 ? (
              <p className="text-[13px] text-muted">No campuses configured.</p>
            ) : null}
          </CardBody>
        </Card>
      </Section>

      <Section title="Academic terms">
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Term</Th>
                <Th align="right">Semester</Th>
                <Th>Starts</Th>
                <Th>Ends</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {terms.map((term) => (
                <tr key={term.id}>
                  <Td><span className="font-medium text-default">{term.name}</span></Td>
                  <Td align="right" className="tabular text-muted">{term.semesterNumber}</Td>
                  <Td><span className="text-[12.5px] text-muted">{term.startDate}</span></Td>
                  <Td><span className="text-[12.5px] text-muted">{term.endDate}</span></Td>
                  <Td>{term.isCurrent ? <Badge tone="success">Current</Badge> : <Badge tone="neutral">Past</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Section>

      <Section title={`Departments (${departments.length})`}>
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Department</Th>
                <Th>School</Th>
                <Th>Head of department</Th>
                <Th align="right">Programmes</Th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className="hover:bg-surface-sunken">
                  <Td><span className="font-mono text-[12.5px] text-muted">{d.code}</span></Td>
                  <Td><span className="font-medium text-default">{d.name}</span></Td>
                  <Td><span className="text-[12.5px] text-muted">{d.school ?? '—'}</span></Td>
                  <Td>
                    <span className="text-[12.5px] text-muted">
                      {d.hodFirst ? `${d.hodFirst} ${d.hodLast ?? ''}`.trim() : 'Not assigned'}
                    </span>
                  </Td>
                  <Td align="right" className="tabular text-muted">
                    {programs.filter((p) => p.departmentCode === d.code).length}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Section>

      <Section title={`Programmes (${programs.length})`}>
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Programme</Th>
                <Th>Department</Th>
                <Th>Level</Th>
                <Th align="right">Duration</Th>
                <Th align="right">Sections</Th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="hover:bg-surface-sunken">
                  <Td><span className="font-mono text-[12.5px] text-muted">{p.code}</span></Td>
                  <Td><span className="font-medium text-default">{p.name}</span></Td>
                  <Td><span className="text-[12.5px] text-muted">{p.departmentCode}</span></Td>
                  <Td><Badge tone="neutral">{p.level}</Badge></Td>
                  <Td align="right" className="tabular text-muted">{p.durationYears} yrs</Td>
                  <Td align="right" className="tabular text-muted">
                    {sections.filter((s) => s.programCode === p.code).length}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Section>

      <Section title={`Sections (${sections.length})`}>
        <Card>
          {sections.length === 0 ? (
            <EmptyState icon={Building2} title="No sections" description="Sections group students who share a timetable." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Section</Th>
                  <Th>Programme</Th>
                  <Th align="right">Year</Th>
                  <Th align="right">Semester</Th>
                  <Th align="right">Strength</Th>
                  <Th>Home room</Th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-sunken">
                    <Td><span className="font-medium text-default">{s.code}</span></Td>
                    <Td><span className="text-[12.5px] text-muted">{s.programCode}</span></Td>
                    <Td align="right" className="tabular text-muted">{s.year}</Td>
                    <Td align="right" className="tabular text-muted">{s.semester}</Td>
                    <Td align="right" className="tabular">{s.strength}</Td>
                    <Td><span className="text-[12.5px] text-muted">{s.homeRoom ?? '—'}</span></Td>
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
