import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { Button, PageHeader } from '@/components/ui';
import { isEnabled } from '@/lib/features';

import { requireStudentContext } from '../../_lib/auth';
import { ModuleDisabled } from '../../_components/bits';
import { NewCaseForm, type CategoryOption } from './NewCaseForm';

export const metadata = { title: 'Raise a case' };
export const dynamic = 'force-dynamic';

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; subject?: string; offering?: string }>;
}) {
  const user = await requireStudentContext('grievance:raise');

  if (!isEnabled(user.featureFlags, 'grievance_enabled')) {
    return (
      <>
        <PageHeader title="Raise a case" />
        <ModuleDisabled
          module="The Readdressal Centre"
          blurb="Structured grievance handling is not part of your institution's current configuration."
        />
      </>
    );
  }

  const { category: categorySlug, subject: subjectCode, offering } = await searchParams;

  // Only categories the institution has enabled AND opened to this role.
  const categories: CategoryOption[] = await db
    .select({
      id: t.grievanceCategories.id,
      name: t.grievanceCategories.name,
      slug: t.grievanceCategories.slug,
      description: t.grievanceCategories.description,
      responseSlaHours: t.grievanceCategories.responseSlaHours,
      resolutionSlaHours: t.grievanceCategories.resolutionSlaHours,
      allowAnonymous: t.grievanceCategories.allowAnonymous,
      isSensitive: t.grievanceCategories.isSensitive,
    })
    .from(t.grievanceCategories)
    .where(
      and(
        eq(t.grievanceCategories.institutionId, user.institutionId),
        eq(t.grievanceCategories.isEnabled, true),
        sql`${t.grievanceCategories.availableToRoles} @> ${JSON.stringify([user.role])}::jsonb`,
      ),
    )
    .orderBy(asc(t.grievanceCategories.sortOrder));

  const preselected = categories.find((c) => c.slug === categorySlug) ?? null;

  // Only trust an offering id that this student is actually enrolled in.
  const [linkedOffering] = offering
    ? await db
        .select({ id: t.courseOfferings.id, code: t.subjects.code, name: t.subjects.name })
        .from(t.enrollments)
        .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.enrollments.offeringId))
        .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
        .where(
          and(
            eq(t.enrollments.studentId, user.studentProfileId),
            eq(t.enrollments.offeringId, offering),
          ),
        )
        .limit(1)
    : [undefined];

  const label = linkedOffering ? `${linkedOffering.code} ${linkedOffering.name}` : subjectCode ?? '';

  const initialSubject =
    preselected?.slug === 'attendance' && label
      ? `Attendance discrepancy in ${label}`
      : preselected?.slug === 'examination' && label
        ? `Re-evaluation request for ${label}`
        : '';

  const initialDescription =
    preselected?.slug === 'attendance' && label
      ? `I believe my attendance record for ${label} is incorrect.\n\nDates I was present but marked absent:\n- \n\nEvidence I can provide:\n- `
      : '';

  return (
    <>
      <PageHeader
        title="Raise a case"
        description="Cases are never deleted. Every status change is recorded, and the deadline is set by the category you choose."
        breadcrumb={
          <Button asChild size="sm" variant="ghost" icon={ChevronLeft}>
            <Link href="/student/readdressal">All cases</Link>
          </Button>
        }
      />

      <div className="max-w-3xl">
        <NewCaseForm
          categories={categories}
          anonymousEnabled={isEnabled(user.featureFlags, 'anonymous_grievance_enabled')}
          initial={{
            categoryId: preselected?.id ?? '',
            subject: initialSubject,
            description: initialDescription,
            relatedEntityType: linkedOffering ? 'course_offering' : null,
            relatedEntityId: linkedOffering?.id ?? null,
          }}
        />
      </div>
    </>
  );
}
