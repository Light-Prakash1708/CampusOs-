import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/context';
import { Button } from '@/components/ui';
import { humanize } from '@/lib/utils';

export const metadata = { title: 'Access not permitted' };

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ permission?: string }>;
}) {
  const user = await getCurrentUser();
  const { permission } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-6">
      <div className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-surface p-7 text-center shadow-xs">
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-warning-subtle">
          <ShieldAlert size={20} className="text-warning" />
        </span>
        <h1 className="text-[17px] font-semibold text-default">You do not have access to this</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Your account{user ? ` (${humanize(user.role)})` : ''} is not permitted to open this page.
          If you believe this is wrong, ask your institution administrator to review your role.
        </p>
        {permission ? (
          <p className="mt-3 rounded-md bg-surface-sunken px-3 py-2 font-mono text-[11.5px] text-subtle">
            Required capability: {permission}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="primary">
            <Link href={user ? `/${user.portal}` : '/login'}>
              {user ? 'Back to dashboard' : 'Sign in'}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
