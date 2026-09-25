import { navIcon } from '@/components/layout/icons';
import Link from 'next/link';
import { Bell, ChevronRight, Settings, User, type LucideIcon } from 'lucide-react';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { Badge, Card, PageHeader, Section } from '@/components/ui';
import { STUDENT_NAV } from '@/components/layout/navigation';
import { isEnabled, type FeatureFlag } from '@/lib/features';
import { requireStudentContext } from '../_lib/auth';

export const metadata = { title: 'More' };
export const dynamic = 'force-dynamic';

interface Entry {
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  badge?: number;
}

const DESCRIPTIONS: Record<string, string> = {
  '/student': 'What needs your attention today',
  '/student/schedule': 'Weekly timetable, rooms and faculty',
  '/student/attendance': 'Percentages, shortages and disputes',
  '/student/assignments': 'Due, submitted and evaluated work',
  '/student/assessments': 'Exam schedule and released results',
  '/student/resources': 'Notes, slides and question banks',
  '/student/skills': 'Skill graph, career goal and gap plan',
  '/student/announcements': 'Notices addressed to you',
  '/student/calendar': 'Everything on one calendar',
  '/student/readdressal': 'Raise and track an issue',
  '/student/assistant': 'Ask about your own records',
};

export default async function MorePage() {
  const user = await requireStudentContext();

  const [unreadNotifications] = await db
    .select({ value: count() })
    .from(t.notifications)
    .where(
      and(
        eq(t.notifications.institutionId, user.institutionId),
        eq(t.notifications.userId, user.userId),
        isNull(t.notifications.readAt),
      ),
    );

  const [pendingAcks] = await db
    .select({ value: count() })
    .from(t.announcementRecipients)
    .innerJoin(t.announcements, eq(t.announcements.id, t.announcementRecipients.announcementId))
    .where(
      and(
        eq(t.announcementRecipients.institutionId, user.institutionId),
        eq(t.announcementRecipients.userId, user.userId),
        eq(t.announcements.requiresAcknowledgement, true),
        isNull(t.announcementRecipients.acknowledgedAt),
      ),
    );

  // Same filtering rule the sidebar uses: a module that is off is absent, not
  // present-but-broken.
  const groups = STUDENT_NAV.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => {
        if (item.feature && !isEnabled(user.featureFlags, item.feature as FeatureFlag)) {
          return false;
        }
        if (item.permissions && !item.permissions.some((p) => user.permissions.has(p))) {
          return false;
        }
        return true;
      })
      .map<Entry>((item) => ({
        label: item.label,
        href: item.href,
        icon: navIcon(item.icon),
        description: DESCRIPTIONS[item.href],
        badge: item.href === '/student/announcements' ? (pendingAcks?.value ?? 0) : undefined,
      })),
  })).filter((group) => group.items.length > 0);

  const account: Entry[] = [
    {
      label: 'Notifications',
      href: '/student/notifications',
      icon: Bell,
      description: 'Grouped updates, priority first',
      badge: unreadNotifications?.value ?? 0,
    },
    {
      label: 'Profile',
      href: '/student/profile',
      icon: User,
      description: 'Your official institutional record',
    },
    {
      label: 'Settings',
      href: '/student/settings',
      icon: Settings,
      description: 'Notification preferences and theme',
    },
  ];

  return (
    <>
      <PageHeader title="More" description="Everything in your portal, in one list." />

      {groups.map((group, index) => (
        <Section key={group.label ?? `group-${index}`} title={group.label ?? 'Overview'}>
          <EntryList entries={group.items} />
        </Section>
      ))}

      <Section title="Account">
        <EntryList entries={account} />
      </Section>

      <p className="mt-6 text-center text-[12px] text-subtle">
        {user.institutionName} · signed in as {user.email}
      </p>
    </>
  );
}

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-[hsl(var(--border))]">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
                  <Icon size={16} className="text-muted" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-default">
                    {entry.label}
                  </span>
                  {entry.description ? (
                    <span className="block truncate text-[12px] text-subtle">
                      {entry.description}
                    </span>
                  ) : null}
                </span>
                {entry.badge && entry.badge > 0 ? (
                  <Badge tone="danger" className="tabular shrink-0">
                    {entry.badge}
                  </Badge>
                ) : null}
                <ChevronRight size={15} className="shrink-0 text-subtle" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
