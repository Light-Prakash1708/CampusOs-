import Link from 'next/link';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui';
import { getCurrentTerm, getMyOfferings } from '../../_lib/faculty';
import { NoFacultyProfile } from '../../_components/NoFacultyProfile';
import { NewAssignmentForm } from './NewAssignmentForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New assignment · CampusOS' };

export default async function NewAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ offering?: string }>;
}) {
  const user = await requirePermission('assignment:create');
  const { offering } = await searchParams;

  if (!user.facultyProfileId) {
    return (
      <div>
        <PageHeader title="New assignment" />
        <NoFacultyProfile what="Creating an assignment" />
      </div>
    );
  }

  const term = await getCurrentTerm(user.institutionId);
  const offerings = await getMyOfferings(user, term?.id ?? null);
  const offeringIds = offerings.map((o) => o.id);

  const counts = offeringIds.length
    ? await db
        .select({
          offeringId: t.enrollments.offeringId,
          students: sql<number>`count(*)::int`,
        })
        .from(t.enrollments)
        .where(
          and(
            eq(t.enrollments.institutionId, user.institutionId),
            inArray(t.enrollments.offeringId, offeringIds),
            isNull(t.enrollments.droppedAt),
          ),
        )
        .groupBy(t.enrollments.offeringId)
    : [];
  const countBy = new Map(counts.map((c) => [c.offeringId, c.students]));

  // Skills already mapped to the subjects taught — real suggestions, not invented ones.
  const subjectIds = [...new Set(offerings.map((o) => o.subjectId))];
  const skillRows = subjectIds.length
    ? await db
        .select({ name: t.skills.name })
        .from(t.subjectSkills)
        .innerJoin(t.skills, eq(t.skills.id, t.subjectSkills.skillId))
        .where(
          and(
            eq(t.subjectSkills.institutionId, user.institutionId),
            inArray(t.subjectSkills.subjectId, subjectIds),
          ),
        )
    : [];

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link href="/faculty/assignments" className="text-[12.5px] text-muted hover:text-brand">
            ← Assignments
          </Link>
        }
        title="New assignment"
        description="Students see it only once you publish."
      />
      <NewAssignmentForm
        offerings={offerings.map((o) => ({
          id: o.id,
          label: `${o.subjectCode} ${o.subjectName} — ${o.sectionCode}`,
          students: countBy.get(o.id) ?? 0,
        }))}
        defaultOfferingId={offerings.find((o) => o.id === offering)?.id ?? null}
        suggestedSkills={[...new Set(skillRows.map((s) => s.name))]}
      />
    </div>
  );
}
