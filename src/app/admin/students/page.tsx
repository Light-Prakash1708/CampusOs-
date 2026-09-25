import Link from 'next/link';
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { GraduationCap, Search } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, Input, PageHeader, Table, Td, Th,
} from '@/components/ui';
import { num } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Students · CampusOS' };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; risk?: string }>;
}) {
  const user = await requirePermission('user:view_all');
  const { q, risk } = await searchParams;
  const term = (q ?? '').trim();

  const rows = await db
    .select({
      id: t.studentProfiles.id,
      userId: t.users.id,
      rollNumber: t.studentProfiles.rollNumber,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      email: t.users.email,
      year: t.studentProfiles.currentYear,
      semester: t.studentProfiles.currentSemester,
      attendance: t.studentProfiles.attendancePercentage,
      cgpa: t.studentProfiles.cgpa,
      sectionCode: t.sections.code,
      programCode: t.programs.code,
    })
    .from(t.studentProfiles)
    .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
    .innerJoin(t.programs, eq(t.programs.id, t.studentProfiles.programId))
    .leftJoin(t.sections, eq(t.sections.id, t.studentProfiles.sectionId))
    .where(
      and(
        eq(t.studentProfiles.institutionId, user.institutionId),
        isNull(t.studentProfiles.deletedAt),
        term
          ? or(
              ilike(t.users.firstName, `%${term}%`),
              ilike(t.users.lastName, `%${term}%`),
              ilike(t.studentProfiles.rollNumber, `%${term}%`),
            )
          : sql`true`,
        risk === 'attendance'
          ? sql`${t.studentProfiles.attendancePercentage} < 75`
          : sql`true`,
      ),
    )
    .orderBy(asc(t.studentProfiles.rollNumber))
    .limit(300);

  return (
    <div>
      <PageHeader
        title="Students"
        description={`${rows.length} shown${term ? ` matching “${term}”` : ''}`}
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/admin/students">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input
            name="q"
            defaultValue={term}
            placeholder="Search by name or roll number"
            className="pl-8"
          />
        </div>
        <Link
          href={risk === 'attendance' ? '/admin/students' : '/admin/students?risk=attendance'}
          className={
            risk === 'attendance'
              ? 'rounded-md bg-warning-subtle px-3 py-1.5 text-[13px] font-medium text-warning'
              : 'rounded-md border border-[hsl(var(--border-strong))] px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-surface-sunken'
          }
        >
          Attendance risk
        </Link>
      </form>

      <Card>
        <CardHeader title="Student register" />
        {rows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={term ? 'No students match that search' : 'No students yet'}
            description={
              term
                ? 'Try a different name or roll number.'
                : 'Import your student list from the Data Import Centre.'
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Roll number</Th>
                <Th>Programme</Th>
                <Th>Section</Th>
                <Th align="right">Attendance</Th>
                <Th align="right">CGPA</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const attendance = s.attendance ? Number(s.attendance) : null;
                return (
                  <tr key={s.id} className="hover:bg-surface-sunken">
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                        <span>
                          <span className="block text-[13.5px] font-medium text-default">
                            {s.firstName} {s.lastName}
                          </span>
                          <span className="block text-[11.5px] text-subtle">{s.email}</span>
                        </span>
                      </span>
                    </Td>
                    <Td><span className="font-mono text-[12.5px] text-muted">{s.rollNumber}</span></Td>
                    <Td><span className="text-[12.5px] text-muted">{s.programCode}</span></Td>
                    <Td><span className="text-[12.5px] text-muted">{s.sectionCode ?? '—'}</span></Td>
                    <Td align="right">
                      {attendance === null ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <span className={`tabular ${attendance < 75 ? 'text-danger font-medium' : 'text-default'}`}>
                          {attendance.toFixed(1)}%
                        </span>
                      )}
                    </Td>
                    <Td align="right" className="tabular text-muted">
                      {s.cgpa ? num(s.cgpa, 2) : '—'}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
