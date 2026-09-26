'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Building2,
  ChevronDown,
  Command,
  Inbox,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Search,
  Sparkles,
  Sun,
  Plus,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PixelAvatar, type AvatarTone } from '@/components/campus/pixel';
import type { MobileNavItem, NavGroup, QuickCreateEntry } from './navigation';
import { CampusBottomSheet, CampusDrawer } from '@/components/campus/overlays';
import { CampusComingSoon, CampusLevelChip } from '@/components/campus';
import { CampusLogo } from '@/components/brand';
import { navIcon } from './icons';
import { CommandPalette } from './CommandPalette';

export interface ShellUser {
  fullName: string;
  displayName: string;
  firstName: string;
  email: string;
  avatarUrl: string | null;
  avatarTone: AvatarTone;
  roleLabel: string;
  institutionName: string;
  institutionLabel: string;
  institutionLogoUrl: string | null;
  portal: 'student' | 'faculty' | 'admin';
  subtitle: string | null;
  /** Students only. `level` null until the gamification engine ships. */
  progress: { level: number | null; xpIntoLevel?: number; xpForLevel?: number; planned: string | null } | null;
}

export interface ShellBadges {
  notifications: number;
  grievances: number;
  approvals: number;
  pendingGrading: number;
}

/**
 * CampusOS application shell.
 *   desktop  narrow calm sidebar (logo · nav · pinned Profile/Settings · user card)
 *            + top bar (search · AI · inbox · notifications · institution · avatar)
 *   mobile   compact top bar + 5-slot bottom nav with a central ＋ sheet
 * Navigation arrives pre-filtered by capability and feature flag from
 * PortalLayout; this component only renders it.
 */
export function AppShell({
  user,
  nav,
  badges,
  mobileNav,
  quickCreate,
  demoMode,
  children,
}: {
  user: ShellUser;
  nav: NavGroup[];
  badges: ShellBadges;
  mobileNav: MobileNavItem[];
  quickCreate: QuickCreateEntry[];
  demoMode: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  React.useEffect(() => {
    setDrawerOpen(false);
    setCreateOpen(false);
  }, [pathname]);

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

  const home = `/${user.portal}`;
  const isActive = (href: string) => pathname === href || (href !== home && pathname.startsWith(`${href}/`));

  return (
    <div className="min-h-screen bg-surface-muted">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} portal={user.portal} />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-[hsl(var(--border))] bg-surface-muted lg:flex">
        <CampusSidebar user={user} nav={nav} badges={badges} isActive={isActive} onSignOut={signOut} signingOut={signingOut} />
      </aside>

      {/* Mobile drawer (shared CampusDrawer: focus trap, Esc, scroll lock) */}
      <CampusDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Navigation" side="left" bare className="w-[280px] lg:hidden">
        <CampusSidebar user={user} nav={nav} badges={badges} isActive={isActive} onSignOut={signOut} signingOut={signingOut} onClose={() => setDrawerOpen(false)} />
      </CampusDrawer>

      <div className="lg:pl-[232px]">
        <CampusTopbar
          user={user}
          badges={badges}
          demoMode={demoMode}
          canCreate={quickCreate.length > 0}
          createOpen={createOpen}
          onOpenNav={() => setDrawerOpen(true)}
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenCreate={() => setCreateOpen(true)}
        />
        <main id="main" className="px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>

      <CampusMobileNav items={mobileNav} isActive={isActive} createOpen={createOpen} onCreate={() => setCreateOpen(true)} onMenu={() => setDrawerOpen(true)} />

      {/* Quick-create: bottom sheet on phones, centred dialog on desktop */}
      <CampusBottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="What would you like to do?" desktop="modal">
        <QuickCreateList items={quickCreate} />
      </CampusBottomSheet>
    </div>
  );
}

/* ----------------------------- Shell parts -------------------------------- */

/** Sidebar content: logo, grouped nav, pinned Profile/Settings, user card. */
export function CampusSidebar({
  user,
  nav,
  badges,
  isActive,
  onSignOut,
  signingOut,
  onClose,
}: {
  user: ShellUser;
  nav: NavGroup[];
  badges: ShellBadges;
  isActive: (href: string) => boolean;
  onSignOut: () => void;
  signingOut: boolean;
  /** Present when rendered in the mobile drawer. */
  onClose?: () => void;
}) {
  const mainGroups = nav.filter((g) => g.position !== 'bottom');
  const bottomGroups = nav.filter((g) => g.position === 'bottom');
  return (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link href={`/${user.portal}`} className="flex items-center rounded-lg" aria-label="CampusOS home">
          <CampusLogo size="md" decorative />
        </Link>
        {onClose ? (
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface-sunken lg:hidden" aria-label="Close navigation">
            <X size={18} />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-none" aria-label="Main navigation">
        {mainGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
            {group.label ? <p className="mb-1 px-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-subtle">{group.label}</p> : null}
            <NavList items={group.items} isActive={isActive} badges={badges} />
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 px-3 pb-3">
        {bottomGroups.map((g, i) => (
          <NavList key={i} items={g.items} isActive={isActive} badges={badges} />
        ))}
        <UserCard user={user} onSignOut={onSignOut} signingOut={signingOut} />
      </div>
    </>
  );
}

/** Top bar: search (⌘K), Create, AI, notices, notifications, theme, college, avatar. */
export function CampusTopbar({
  user,
  badges,
  demoMode,
  canCreate,
  createOpen,
  onOpenNav,
  onOpenSearch,
  onOpenCreate,
}: {
  user: ShellUser;
  badges: ShellBadges;
  demoMode: boolean;
  canCreate: boolean;
  createOpen: boolean;
  onOpenNav: () => void;
  onOpenSearch: () => void;
  onOpenCreate: () => void;
}) {
  const home = `/${user.portal}`;
  const assistantHref = user.portal === 'faculty' ? '/faculty/copilot' : `/${user.portal}/assistant`;
  const inboxHref = user.portal === 'admin' ? '/admin/communications' : `/${user.portal}/announcements`;
  return (
    <header className="sticky top-0 z-30 border-b border-[hsl(var(--border))] bg-surface-muted/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-4 sm:px-6 lg:px-8">
        <button onClick={onOpenNav} className="-ml-1 rounded-lg p-2 text-default hover:bg-surface-sunken lg:hidden" aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <Link href={home} className="flex shrink-0 items-center rounded-lg lg:hidden" aria-label="CampusOS home">
          <CampusLogo size="sm" decorative />
        </Link>

        <button
          onClick={onOpenSearch}
          className="ml-auto hidden h-10 min-w-0 max-w-[440px] flex-1 items-center gap-2 rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-3 text-[13px] text-subtle transition-colors hover:border-ink sm:flex lg:ml-0"
          aria-label="Search classes, events, tools, people"
        >
          <Search size={15} aria-hidden />
          <span className="flex-1 truncate text-left">Search classes, events, tools, people…</span>
          <kbd className="hidden items-center gap-0.5 rounded-md border border-[hsl(var(--border))] bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] md:inline-flex">
            <Command size={9} />K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <button onClick={onOpenSearch} className="rounded-lg p-2 text-default hover:bg-surface-sunken sm:hidden" aria-label="Search">
            <Search size={19} />
          </button>
          {demoMode ? <span className="mr-1 hidden rounded-md bg-sun px-2 py-0.5 text-[11px] font-bold text-sun-ink xl:inline">Demo data</span> : null}
          {canCreate ? (
            <button
              onClick={onOpenCreate}
              className="mr-1 hidden h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-brand px-3 text-[13px] font-bold text-white shadow-pop campus-press lg:inline-flex"
              aria-haspopup="dialog"
              aria-expanded={createOpen}
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Create
            </button>
          ) : null}
          <TopIcon href={assistantHref} label={user.portal === 'faculty' ? 'Teaching copilot' : 'AI assistant'} className="hidden sm:inline-flex">
            <Sparkles size={18} />
          </TopIcon>
          <TopIcon href={inboxHref} label="Notices" className="hidden sm:inline-flex">
            <Inbox size={18} />
          </TopIcon>
          <TopIcon href={`/${user.portal}/notifications`} label={`Notifications${badges.notifications ? `, ${badges.notifications} unread` : ''}`}>
            <Bell size={18} />
            {badges.notifications > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-ink bg-coral-ink px-1 text-[9.5px] font-extrabold text-white">
                {badges.notifications > 9 ? '9+' : badges.notifications}
              </span>
            ) : null}
          </TopIcon>
          <ThemeToggle />
          <span
            className="ml-1 hidden items-center gap-1.5 rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-2.5 py-1.5 text-[12px] font-bold text-default xl:inline-flex"
            title={user.institutionName}
          >
            <Building2 size={14} className="text-brand" aria-hidden />
            <span className="max-w-[150px] truncate">{user.institutionLabel}</span>
          </span>
          <Link href={`/${user.portal}/profile`} className="ml-1 rounded-xl border-[1.5px] border-ink bg-lavender p-0.5 shadow-pop" aria-label="Your profile">
            <PixelAvatar tone={user.avatarTone} size={30} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Phone bottom navigation: 5 slots with the central ＋ (create sheet). */
export function CampusMobileNav({
  items,
  isActive,
  createOpen,
  onCreate,
  onMenu,
}: {
  items: MobileNavItem[];
  isActive: (href: string) => boolean;
  createOpen: boolean;
  onCreate: () => void;
  onMenu: () => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-ink bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Quick navigation">
      <ul className="flex items-end">
        {items.map((item) => {
          const Icon = navIcon(item.icon);
          if (item.kind === 'create') {
            return (
              <li key="create" className="flex flex-1 justify-center">
                <button
                  onClick={onCreate}
                  className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-ink bg-brand text-white shadow-pop campus-press"
                  aria-label="Create"
                  aria-haspopup="dialog"
                  aria-expanded={createOpen}
                >
                  <Icon size={24} strokeWidth={2.5} />
                </button>
              </li>
            );
          }
          if (item.href === '#menu') {
            return (
              <li key="menu" className="flex-1">
                <button onClick={onMenu} className="flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-subtle">
                  <Icon size={20} aria-hidden />
                  {item.label}
                </button>
              </li>
            );
          }
          const active = isActive(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-brand' : 'text-subtle')}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ------------------------------- Pieces ---------------------------------- */

function QuickCreateList({ items }: { items: QuickCreateEntry[] }) {
  if (items.length === 0) return <p className="py-4 text-[13px] text-muted">Nothing to create here yet.</p>;
  const ready = items.filter((q) => !q.planned);
  const planned = items.filter((q) => q.planned);
  return (
    <div className="space-y-4">
      <ul className="space-y-1.5">
        {ready.map((q) => {
          const Icon = navIcon(q.icon);
          return (
            <li key={q.href}>
              <Link href={q.href} className="flex min-h-[56px] items-center gap-3 rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] px-3 hover:border-ink focus-visible:border-ink">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-ink bg-lavender text-lavender-ink">
                  <Icon size={17} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-default">{q.label}</span>
                  <span className="block text-[12px] text-muted">{q.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {planned.length ? (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">On the roadmap</p>
          <ul className="space-y-1.5">
            {planned.map((q) => {
              const Icon = navIcon(q.icon);
              return (
                <li key={q.href} className="flex min-h-[52px] items-center gap-3 rounded-xl border-[1.5px] border-dashed border-[hsl(var(--border-strong))] px-3" aria-disabled="true">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-[hsl(var(--border-strong))] text-subtle">
                    <Icon size={17} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-muted">{q.label}</span>
                    <span className="block text-[12px] text-subtle">{q.description}</span>
                  </span>
                  <CampusComingSoon label={q.planned!} className="shrink-0" />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NavList({
  items,
  isActive,
  badges,
}: {
  items: NavGroup['items'];
  isActive: (href: string) => boolean;
  badges: ShellBadges;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = navIcon(item.icon);
        const active = isActive(item.href);
        const count = item.badgeKey ? badges[item.badgeKey] : 0;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[40px] items-center gap-3 rounded-xl px-3 text-[13.5px] font-semibold transition-colors',
                active ? 'bg-lavender text-lavender-ink' : 'text-muted hover:bg-surface-sunken hover:text-default',
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} className="shrink-0" aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              {count > 0 ? (
                <span className="tabular rounded-full bg-coral-ink px-1.5 text-[10.5px] font-extrabold leading-[18px] text-white">
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TopIcon({ href, label, className, children }: { href: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label} title={label} className={cn('relative inline-flex rounded-lg p-2 text-default transition-colors hover:bg-surface-sunken', className)}>
      {children}
    </Link>
  );
}

function UserCard({ user, onSignOut, signingOut }: { user: ShellUser; onSignOut: () => void; signingOut: boolean }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const links = [
    { href: `/${user.portal}/profile`, label: 'Profile' },
    { href: '/account/security', label: 'Security' },
    { href: '/account/privacy', label: 'Privacy' },
  ];

  return (
    <div ref={ref} className="relative">
      {open ? (
        <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border-[1.5px] border-ink bg-surface shadow-pop animate-fade-up" role="menu">
          <div className="border-b border-[hsl(var(--border))] px-3 py-2.5">
            <p className="truncate text-[13px] font-bold text-default">{user.fullName}</p>
            <p className="truncate text-[11.5px] text-subtle">{user.email}</p>
          </div>
          <div className="p-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} role="menuitem" className="block rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted hover:bg-surface-sunken hover:text-default">
                {l.label}
              </Link>
            ))}
            <button
              onClick={onSignOut}
              disabled={signingOut}
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-coral-ink hover:bg-coral disabled:opacity-60"
            >
              {signingOut ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      ) : null}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl border-[1.5px] border-ink bg-surface px-2.5 py-2 text-left shadow-pop"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="rounded-lg bg-lavender p-0.5">
          <PixelAvatar tone={user.avatarTone} size={32} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-extrabold leading-tight text-default">{user.displayName}</span>
          <span className="block truncate text-[11px] font-medium leading-tight text-subtle">{user.subtitle ?? user.roleLabel}</span>
          {user.progress ? (
            <CampusLevelChip
              className="mt-1"
              level={user.progress.level}
              xpIntoLevel={user.progress.xpIntoLevel}
              xpForLevel={user.progress.xpForLevel}
              plannedLabel={user.progress.planned ?? undefined}
            />
          ) : null}
        </span>
        <ChevronDown size={14} className="shrink-0 text-subtle" aria-hidden />
      </button>
    </div>
  );
}

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
      className="rounded-lg p-2 text-default transition-colors hover:bg-surface-sunken"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
