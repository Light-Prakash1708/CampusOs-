import Link from 'next/link';
import { Building2, CheckCircle2, Circle, ShieldCheck } from 'lucide-react';
import type { AuthContext } from '@/lib/auth/context';
import { can } from '@/lib/auth/context';
import { Card, CardBody, CardHeader, Progress } from '@/components/ui';
import { getSetupProgress, isPlatformOperator } from '@/services/institutions';
import { LaunchButton } from './LaunchButton';

/**
 * "From no CampusOS to ready for a pilot": the setup checklist, computed from
 * what exists, plus the platform link for operators. Hidden once launched.
 */
export async function SetupProgress({ user, pending }: { user: AuthContext; pending?: { label: string; href: string; count: number }[] }) {
  const operator = isPlatformOperator(user);
  const canSee = can(user, 'institution:view_settings');
  const progress = canSee ? await getSetupProgress(user.institutionId) : null;
  const pendingItems = (pending ?? []).filter((p) => p.count > 0);
  if (!operator && (!progress || progress.launched) && pendingItems.length === 0) return null;

  const done = progress ? progress.steps.filter((s) => s.done).length : 0;
  return (
    <div className="mb-6 space-y-3">
      {operator ? (
        <Link
          href="/admin/institutions"
          className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-surface px-4 py-2.5 text-[13.5px] font-medium text-default hover:border-[hsl(var(--border-strong))]"
        >
          <Building2 size={16} className="text-brand" aria-hidden /> Platform: create and manage institutions
        </Link>
      ) : null}

      {progress && !progress.launched ? (
        <Card>
          <CardHeader
            title="Set up your campus"
            description={`${done} of ${progress.steps.length} steps done. Everything saves as you go — pick up where you left off.`}
          />
          <CardBody className="space-y-4">
            <Progress value={(done / progress.steps.length) * 100} />
            <ol className="grid gap-2 sm:grid-cols-2">
              {progress.steps.map((s) => (
                <li key={s.key}>
                  <Link href={s.href} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-sunken">
                    {s.done ? (
                      <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" aria-label="Done" />
                    ) : (
                      <Circle size={17} className="mt-0.5 shrink-0 text-subtle" aria-label="To do" />
                    )}
                    <span>
                      <span className="block text-[13.5px] font-medium text-default">{s.label}</span>
                      <span className="block text-[12px] text-muted">{s.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            {can(user, 'institution:manage') ? <LaunchButton ready={progress.ready} /> : null}
          </CardBody>
        </Card>
      ) : null}

      {pendingItems.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pendingItems.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--warning-border))] bg-warning-subtle px-3 py-1.5 text-[13px] font-medium text-default"
            >
              <ShieldCheck size={15} aria-hidden /> {p.count} {p.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
