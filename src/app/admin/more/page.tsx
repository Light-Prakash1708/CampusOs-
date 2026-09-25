import Link from 'next/link';
import { requireAuth } from '@/lib/auth/context';
import { Card, CardBody, PageHeader } from '@/components/ui';
import { navForPortal } from '@/components/layout/navigation';
import { navIcon } from '@/components/layout/icons';
import { isEnabled, type FeatureFlag } from '@/lib/features';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'More · CampusOS' };

/** Mobile overflow: everything the sidebar shows on a large screen. */
export default async function AdminMorePage() {
  const user = await requireAuth();

  const groups = navForPortal('admin')
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.feature && !isEnabled(user.featureFlags, item.feature as FeatureFlag)) return false;
        if (item.permissions && !item.permissions.some((p) => user.permissions.has(p))) return false;
        return true;
      }),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <PageHeader title="More" description="Everything available to your role." />
      <div className="space-y-5">
        {groups.map((group, i) => (
          <section key={i}>
            {group.label ? (
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-subtle">
                {group.label}
              </h2>
            ) : null}
            <Card>
              <CardBody className="p-0">
                {group.items.map((item) => {
                  const Icon = navIcon(item.icon);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-5 py-3 last:border-0 hover:bg-surface-sunken"
                    >
                      <Icon size={16} className="shrink-0 text-subtle" />
                      <span className="text-[13.5px] text-default">{item.label}</span>
                    </Link>
                  );
                })}
              </CardBody>
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}
