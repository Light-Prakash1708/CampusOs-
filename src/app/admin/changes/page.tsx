import { History } from 'lucide-react';
import { requireAuth } from '@/lib/auth/context';
import { Badge, Card, CardBody, EmptyState, PageHeader } from '@/components/ui';
import { formatDateTime, humanize, pluralize, relativeTime } from '@/lib/utils';
import { getRecentChanges } from '../_lib/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campus changes · CampusOS' };

/**
 * The campus change feed. Every entry shows BEFORE → AFTER, the reason, who
 * made it and how many people it affected — the record that answers
 * "why did this change?" without anyone having to ask.
 */
export default async function ChangesPage() {
  const user = await requireAuth();
  const changes = await getRecentChanges(user.institutionId, 60);

  return (
    <div>
      <PageHeader
        title="What changed"
        description="Every institutional change, with its reason and who approved it."
      />

      {changes.length === 0 ? (
        <Card>
          <EmptyState
            icon={History}
            title="No changes recorded"
            description="Timetable moves, cancellations, deadline changes and holidays appear here as they happen."
          />
        </Card>
      ) : (
        <ol className="space-y-3">
          {changes.map((c) => (
            <li key={c.id}>
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{humanize(c.kind)}</Badge>
                    <p className="text-[14px] font-medium text-default">{c.title}</p>
                  </div>

                  <p className="mt-2 rounded-md bg-surface-sunken px-3 py-2 font-mono text-[12.5px] text-default">
                    {c.summary}
                  </p>

                  {c.reason ? (
                    <p className="mt-2 text-[13px] text-muted">
                      <span className="font-medium text-default">Reason: </span>
                      {c.reason}
                    </p>
                  ) : null}

                  <p className="mt-2 text-[12px] text-subtle">
                    Changed by {c.byFirst ? `${c.byFirst} ${c.byLast ?? ''}`.trim() : 'the system'} ·{' '}
                    {formatDateTime(c.createdAt)} ({relativeTime(c.createdAt)}) ·{' '}
                    {pluralize(c.affectedCount, 'person', 'people')} affected
                  </p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
