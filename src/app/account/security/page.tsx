import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import { Alert, PageHeader } from '@/components/ui';
import { listSessions } from '@/services/auth/accounts';
import { formatDateTime } from '@/lib/utils';
import { ChangePasswordForm, SessionList } from './SecurityForms';

export const metadata = { title: 'Security · CampusOS' };
export const dynamic = 'force-dynamic';

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const user = await requireAuth();
  const { required } = await searchParams;
  const [row] = await db
    .select({ mustChange: t.users.mustChangePassword, changedAt: t.users.passwordChangedAt, verifiedAt: t.users.emailVerifiedAt })
    .from(t.users)
    .where(eq(t.users.id, user.userId));
  const sessions = await listSessions(user);

  return (
    <div className="space-y-6">
      <PageHeader title="Security" description="Your password and the devices signed in to your account." />
      {row?.mustChange || required ? (
        <Alert tone="warning" title="Please set a new password">
          Your account was created with a temporary password. Choose your own to continue.
        </Alert>
      ) : null}
      <section className="rounded-xl border border-[hsl(var(--border))] bg-surface p-5">
        <h2 className="text-[15px] font-semibold text-default">Password</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          {row?.changedAt ? `Last changed ${formatDateTime(row.changedAt)}.` : 'Changing it signs out every other device.'}
        </p>
        <div className="mt-4 max-w-sm">
          <ChangePasswordForm />
        </div>
      </section>
      <section className="rounded-xl border border-[hsl(var(--border))] bg-surface p-5">
        <h2 className="text-[15px] font-semibold text-default">Where you’re signed in</h2>
        <p className="mt-0.5 text-[13px] text-muted">Sign out any device you don’t recognise.</p>
        <div className="mt-4">
          <SessionList
            sessions={sessions.map((s) => ({
              id: s.id,
              current: s.current,
              device: describeDevice(s.userAgent),
              ip: s.ipAddress,
              lastSeen: formatDateTime(s.lastSeenAt),
            }))}
          />
        </div>
      </section>
      <p className="text-[12.5px] text-subtle">
        Email {user.email} {row?.verifiedAt ? 'is confirmed.' : 'is not confirmed yet.'}
      </p>
    </div>
  );
}

function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
