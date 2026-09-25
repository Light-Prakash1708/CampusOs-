import Link from 'next/link';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui';
import { GrievanceForm } from './GrievanceForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Raise a case · CampusOS' };

export default async function NewGrievancePage() {
  const user = await requirePermission('grievance:raise');

  // Only categories this institution has opened to the caller's role.
  const categories = await db
    .select({
      id: t.grievanceCategories.id,
      name: t.grievanceCategories.name,
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

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link href="/faculty/redressal" className="text-[12.5px] text-muted hover:text-brand">
            ← Redressal
          </Link>
        }
        title="Raise a case"
        description="Choose the category that owns the problem — it decides who handles it and by when."
      />
      <GrievanceForm categories={categories} />
    </div>
  );
}
