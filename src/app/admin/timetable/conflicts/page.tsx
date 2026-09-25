import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { humanize, pluralize } from '@/lib/utils';
import { scanVersionConflicts } from '@/services/timetable/conflicts';
import { getCurrentTerm, getPublishedVersion } from '../../_lib/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Timetable conflicts · CampusOS' };

/**
 * Every conflict here is found by a live scan of the timetable, grouped by the
 * kind of clash, with the people it affects. There is no cached count.
 */
export default async function ConflictsPage() {
  const user = await requirePermission('timetable:view_all');
  const term = await getCurrentTerm(user.institutionId);
  const version = await getPublishedVersion(user.institutionId, term?.id);

  if (!version) {
    return (
      <div>
        <PageHeader title="Timetable conflicts" />
        <Alert tone="info" title="No published timetable">
          Conflict scanning runs against the published timetable. Publish one first.
        </Alert>
      </div>
    );
  }

  const scan = await scanVersionConflicts(user.institutionId, version.id);

  const grouped = scan.items.reduce<Record<string, typeof scan.items>>((acc, item) => {
    (acc[item.kind] ??= []).push(item);
    return acc;
  }, {});

  const totalAffected = scan.items.reduce((n, i) => n + i.affectedStudents, 0);

  return (
    <div>
      <PageHeader
        title="Timetable conflicts"
        description={`Live scan of “${version.name}”`}
        breadcrumb={
          <Link href="/admin/timetable" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-default">
            <ArrowLeft size={13} /> Back to timetable
          </Link>
        }
      />

      {scan.total === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="No conflicts found"
            description="Every room, faculty member and section is clash-free, every room is large enough, and every subject is in a suitable room type."
            action={
              <Button asChild variant="secondary">
                <Link href="/admin/timetable">Back to timetable</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Alert tone="danger" icon={AlertTriangle} className="mb-4" title={`${pluralize(scan.total, 'conflict')} found`}>
            Around {pluralize(totalAffected, 'student place')} are affected. Resolve each one from the
            timetable editor — moves are conflict-checked before they save.
          </Alert>

          <div className="space-y-4">
            {Object.entries(grouped).map(([kind, items]) => (
              <Card key={kind}>
                <CardHeader
                  title={humanize(kind)}
                  icon={AlertTriangle}
                  description={`${pluralize(items.length, 'occurrence')}`}
                />
                <CardBody className="p-0">
                  {items.map((item, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-start justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-3 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] text-default">{item.message}</p>
                        <p className="mt-0.5 text-[12px] text-subtle">
                          {item.timeLabel} · {pluralize(item.affectedStudents, 'student')} affected
                        </p>
                      </div>
                      <Button asChild variant="secondary" size="sm">
                        <Link href="/admin/timetable">Fix in editor</Link>
                      </Button>
                    </div>
                  ))}
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
