'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  X,
  Bell,
  Search,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Command,
  GraduationCap,
  UserCog,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, Badge, Button } from '@/components/ui';
import type { NavGroup } from './navigation';
import { navIcon, type NavIconKey } from './icons';
import { CommandPalette } from './CommandPalette';

export interface ShellUser {
  fullName: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  roleLabel: string;
  institutionName: string;
  institutionLogoUrl: string | null;
  portal: 'student' | 'faculty' | 'admin';
  subtitle: string | null;
}

export interface ShellBadges {
  notifications: number;
  grievances: number;
  approvals: number;
  pendingGrading: number;
}

/** Serializable nav (icons resolved to names on the server would lose typing,
 *  so the icon component is passed through directly from a client-safe module). */
export function AppShell({
  user,
  nav,
  badges,
  mobileNav,
  demoMode,
  children,
}: {
  user: ShellUser;
  nav: NavGroup[];
  badges: ShellBadges;
  mobileNav: { label: string; href: string; icon: NavIconKey }[];
  demoMode: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Cmd/Ctrl+K opens the command palette anywhere in the app.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const portalIcon =
    user.portal === 'student' ? GraduationCap : user.portal === 'faculty' ? UserCog : ShieldCheck;

  return (
    <div className="min-h-screen bg-surface-muted">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} portal={user.portal} />

      {/* ---------------------------- Sidebar ---------------------------- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[260px] border-r border-[hsl(var(--border))] bg-surface',
          'flex flex-col transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0 shadow-lg' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[hsl(var(--border))] px-4">
          <Link href={`/${user.portal}`} className="flex min-w-0 items-center gap-2.5">
            {user.institutionLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.institutionLogoUrl} alt="" className="h-7 w-7 rounded-md object-cover" />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-[13px] font-bold text-white">
                {user.institutionName.charAt(0)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold leading-tight text-default">
                {user.institutionName}
              </span>
              <span className="block text-[11px] leading-tight text-subtle">CampusOS</span>
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1.5 text-muted hover:bg-surface-sunken lg:hidden"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-none">
          {nav.map((group, gi) => (
            <div key={gi}>
              {group.label ? (
                <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
                  {group.label}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== `/${user.portal}` && pathname.startsWith(`${item.href}/`));
                  const count = item.badgeKey ? badges[item.badgeKey] : 0;
                  const Icon = navIcon(item.icon);

                  if (item.unavailable) {
                    return (
                      <li key={item.href}>
                        <span
                          className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] text-subtle opacity-60"
                          title="This module is not enabled for your institution."
                        >
                          <Icon size={16} className="shrink-0" aria-hidden />
                          <span className="flex-1 truncate">{item.label}</span>
                          <span className="text-[10px] uppercase">Soon</span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] font-medium transition-colors',
                          active
                            ? 'bg-brand-subtle text-brand'
                            : 'text-muted hover:bg-surface-sunken hover:text-default',
                        )}
                      >
                        <Icon size={16} className="shrink-0" aria-hidden />
                        <span className="flex-1 truncate">{item.label}</span>
                        {count > 0 ? (
                          <span className="tabular rounded-full bg-danger px-1.5 text-[10.5px] font-semibold leading-[18px] text-white">
                            {count > 99 ? '99+' : count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[hsl(var(--border))] p-3">
          <UserMenu user={user} onSignOut={signOut} signingOut={signingOut} icon={portalIcon} />
        </div>
      </aside>

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* ----------------------------- Main ------------------------------ */}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[hsl(var(--border))] bg-surface/85 px-4 backdrop-blur-md">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-2 text-muted hover:bg-surface-sunken lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 flex-1 max-w-md items-center gap-2 rounded-md border border-[hsl(var(--border-strong))] bg-surface-muted px-2.5 text-[13px] text-subtle transition-colors hover:bg-surface-sunken"
          >
            <Search size={14} aria-hidden />
            <span className="flex-1 text-left">Search or ask anything…</span>
            <kbd className="hidden items-center gap-0.5 rounded border border-[hsl(var(--border))] bg-surface px-1 py-0.5 font-mono text-[10px] text-subtle sm:inline-flex">
              <Command size={9} />K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            {demoMode ? (
              <Badge tone="warning" className="mr-1 hidden sm:inline-flex">
                Demo data
              </Badge>
            ) : null}
            <ThemeToggle />
            <Link
              href={`/${user.portal}/notifications`}
              className="relative rounded-md p-2 text-muted transition-colors hover:bg-surface-sunken hover:text-default"
              aria-label={`Notifications${badges.notifications ? `, ${badges.notifications} unread` : ''}`}
            >
              <Bell size={17} />
              {badges.notifications > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-bold text-white">
                  {badges.notifications > 9 ? '9+' : badges.notifications}
                </span>
              ) : null}
            </Link>
          </div>
        </header>

        <main id="main" className="px-4 pb-24 pt-5 sm:px-6 lg:pb-10 lg:px-8">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>

      {/* ------------------------- Mobile bottom nav --------------------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[hsl(var(--border))] bg-surface/95 backdrop-blur-md lg:hidden"
        aria-label="Quick navigation"
      >
        {mobileNav.map((item) => {
          const active = pathname === item.href;
          const Icon = navIcon(item.icon);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium transition-colors',
                active ? 'text-brand' : 'text-subtle',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={19} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/* ------------------------------- User menu ------------------------------- */

function UserMenu({
  user,
  onSignOut,
  signingOut,
  icon: PortalIcon,
}: {
  user: ShellUser;
  onSignOut: () => void;
  signingOut: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      {open ? (
        <div className="absolute bottom-full left-0 right-0 mb-2 animate-fade-up overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-surface shadow-lg">
          <div className="border-b border-[hsl(var(--border))] px-3 py-2.5">
            <p className="truncate text-[13px] font-medium text-default">{user.fullName}</p>
            <p className="truncate text-[11.5px] text-subtle">{user.email}</p>
          </div>
          <div className="p-1">
            <Link
              href={`/${user.portal}/profile`}
              className="block rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-surface-sunken hover:text-default"
            >
              Profile
            </Link>
            <Link
              href={`/${user.portal}/settings`}
              className="block rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-surface-sunken hover:text-default"
            >
              Settings
            </Link>
            <button
              onClick={onSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-danger hover:bg-danger-subtle disabled:opacity-60"
            >
              {signingOut ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-sunken"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar name={user.fullName} src={user.avatarUrl} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-tight text-default">
            {user.displayName}
          </span>
          <span className="flex items-center gap-1 text-[11px] leading-tight text-subtle">
            <PortalIcon size={10} />
            {user.subtitle ?? user.roleLabel}
          </span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-subtle" aria-hidden />
      </button>
    </div>
  );
}

/* ------------------------------ Theme toggle ----------------------------- */

function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('campusos-theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable — theme simply won't persist */
    }
  }

  return (
    <button
      onClick={toggle}
      className="rounded-md p-2 text-muted transition-colors hover:bg-surface-sunken hover:text-default"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
