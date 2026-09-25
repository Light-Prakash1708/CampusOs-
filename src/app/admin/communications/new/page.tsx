import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAnyPermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui';
import { getDepartments, getSections } from '../../_lib/admin';
import { NoticeComposer } from './NoticeComposer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New notice · CampusOS' };

export default async function NewNoticePage() {
  const user = await requireAnyPermission([
    'announcement:create_official',
    'announcement:create_informational',
  ]);

  const [departments, sections, programs] = await Promise.all([
    getDepartments(user.institutionId),
    getSections(user.institutionId),
    db
      .select({ id: t.programs.id, code: t.programs.code, name: t.programs.name })
      .from(t.programs)
      .where(and(eq(t.programs.institutionId, user.institutionId), isNull(t.programs.deletedAt)))
      .orderBy(asc(t.programs.code)),
  ]);

  return (
    <div>
      <PageHeader
        title="New notice"
        description="Address it precisely — CampusOS works out exactly who is affected and tracks who has read it."
        breadcrumb={
          <Link
            href="/admin/communications"
            className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-default"
          >
            <ArrowLeft size={13} /> Communications
          </Link>
        }
      />
      <NoticeComposer
        canPublishOfficial={user.permissions.has('announcement:create_official')}
        canEmergencyBroadcast={user.permissions.has('announcement:emergency_broadcast')}
        departments={departments}
        programs={programs}
        sections={sections.map((s) => ({ id: s.id, code: s.code, programCode: s.programCode }))}
      />
    </div>
  );
}
