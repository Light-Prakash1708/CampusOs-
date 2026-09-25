'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, ChevronDown } from 'lucide-react';
import { Badge, Button, Card, CardBody, ErrorState, type BadgeTone } from '@/components/ui';
import { cn, relativeTime } from '@/lib/utils';

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  priority: string;
  category: string;
  actionUrl: string | null;
  readAt: string | null;
  isMandatory: boolean;
  createdAt: string;
}

export interface NotificationGroup {
  key: string;
  label: string;
  priority: string;
  unread: number;
  items: NotificationItem[];
}

function tone(priority: string): BadgeTone {
  if (priority === 'CRITICAL') return 'danger';
  if (priority === 'IMPORTANT') return 'warning';
  if (priority === 'INFORMATIONAL') return 'neutral';
  return 'info';
}

/**
 * Grouped notification list. Collapsing by `groupKey` is what turns twelve
 * separate pings into "5 Academic Updates" — the grouping is stored on the
 * record, not guessed here.
 */
export function NotificationGroups({
  groups,
  totalUnread,
}: {
  groups: NotificationGroup[];
  totalUnread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.key, group.unread > 0 || groups.length === 1])),
  );
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);

  async function markRead(payload: Record<string, unknown>, token: string) {
    setPending(token);
    setError(null);
    try {
      const response = await fetch('/api/student/notifications/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: { message?: string; hint?: string } }
        | null;

      if (!response.ok || !data?.ok) {
        setError({
          message: data?.error?.message ?? `Could not update (HTTP ${response.status}).`,
          hint: data?.error?.hint,
        });
        return;
      }
      router.refresh();
    } catch {
      setError({
        message: 'Could not reach the server.',
        hint: 'Nothing was changed. Try again when you are back online.',
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {totalUnread > 0
            ? `${totalUnread} unread across ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`
            : 'Everything is read'}
        </p>
        {totalUnread > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            icon={Check}
            loading={pending === 'all'}
            onClick={() => markRead({ all: true }, 'all')}
          >
            Mark all as read
          </Button>
        ) : null}
      </div>

      {error ? <ErrorState message={error.message} hint={error.hint} /> : null}

      {groups.map((group) => {
        const isOpen = open[group.key] ?? false;
        return (
          <Card key={group.key}>
            <div className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen((state) => ({ ...state, [group.key]: !isOpen }))}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <ChevronDown
                  size={16}
                  className={cn(
                    'shrink-0 text-subtle transition-transform',
                    isOpen && 'rotate-180',
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-default">
                    {group.items.length} {group.label}
                  </span>
                  <span className="block text-[11.5px] text-subtle">
                    Most recent {relativeTime(group.items[0]?.createdAt ?? null)}
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-2">
                {group.unread > 0 ? (
                  <Badge tone={tone(group.priority)} dot>
                    {group.unread} unread
                  </Badge>
                ) : (
                  <Badge tone="neutral">read</Badge>
                )}
                {group.unread > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending === group.key}
                    onClick={() =>
                      markRead(
                        group.key === '__ungrouped'
                          ? { ids: group.items.filter((i) => !i.readAt).map((i) => i.id) }
                          : { groupKey: group.key },
                        group.key,
                      )
                    }
                  >
                    Mark read
                  </Button>
                ) : null}
              </div>
            </div>

            {isOpen ? (
              <CardBody className="border-t border-[hsl(var(--border))] p-0">
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className={cn('px-4 py-3', !item.readAt && 'bg-brand-subtle/30')}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 shrink-0">
                          {item.readAt ? (
                            <span className="block h-1.5 w-1.5 rounded-full bg-transparent" />
                          ) : (
                            <span className="block h-1.5 w-1.5 rounded-full bg-brand" aria-label="unread" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-medium text-default">
                              {item.title}
                            </span>
                            {item.priority !== 'NORMAL' ? (
                              <Badge tone={tone(item.priority)}>
                                {item.priority.toLowerCase()}
                              </Badge>
                            ) : null}
                            {item.isMandatory ? <Badge tone="warning">mandatory</Badge> : null}
                          </p>
                          {item.body ? (
                            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                              {item.body}
                            </p>
                          ) : null}
                          <p className="mt-1 flex flex-wrap items-center gap-3 text-[11.5px] text-subtle">
                            <span>{relativeTime(item.createdAt)}</span>
                            {item.actionUrl ? (
                              <Link
                                href={item.actionUrl}
                                className="font-medium text-brand hover:underline"
                              >
                                Open
                              </Link>
                            ) : null}
                            {!item.readAt ? (
                              <button
                                type="button"
                                onClick={() => markRead({ ids: [item.id] }, item.id)}
                                disabled={pending === item.id}
                                className="font-medium text-muted hover:text-default hover:underline disabled:opacity-60"
                              >
                                {pending === item.id ? 'Marking…' : 'Mark read'}
                              </button>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            ) : null}
          </Card>
        );
      })}

      {groups.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center">
            <Bell size={20} className="mx-auto mb-2 text-subtle" aria-hidden />
            <p className="text-sm font-medium text-default">Nothing to show</p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
