import { requireAuth } from '@/lib/auth/context';

/**
 * Account area shared by every role (security, privacy). Deliberately outside
 * the three portals so the same pages serve students, faculty and staff.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="border-b border-[hsl(var(--border))] bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <a href={`/${user.portal}`} className="flex items-center gap-2 text-[13.5px] font-medium text-default">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-[13px] font-bold text-white">C</span>
            Back to CampusOS
          </a>
          <nav aria-label="Account" className="flex gap-1 text-[13px]">
            <a href="/account/security" className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-sunken hover:text-default">Security</a>
            <a href="/account/privacy" className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-sunken hover:text-default">Privacy</a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
