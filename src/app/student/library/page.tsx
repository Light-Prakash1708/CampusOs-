import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookMarked, BookOpen, Clock, ExternalLink, ListChecks, MapPin, Search } from 'lucide-react';
import { isEnabled } from '@/lib/features';
import { cn, formatDate, humanize, truncate } from '@/lib/utils';
import { CampusCard, CampusEmptyState, CampusPill, CampusStat, CampusTabs } from '@/components/campus';
import { ResourceSaveToggle } from '@/components/campus/ResourceSave';
import { CancelReservationButton, RenewButton, ReserveButton } from '@/components/campus/LibraryActions';
import { myLibrary, searchBooks } from '@/services/library';
import { listStudentResources } from '@/services/resources';
import { requireStudentContext } from '../_lib/auth';

export const metadata = { title: 'Library' };
export const dynamic = 'force-dynamic';

type Tab = 'catalogue' | 'loans' | 'reservations' | 'pyqs' | 'notes' | 'saved';

/**
 * Library: the physical catalogue with loans and reservations (library_enabled),
 * plus notes, PYQs and saved material from the Resource Hub (resource_hub_enabled).
 * Each half shows only when its module is on.
 */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requireStudentContext();
  const booksOn = isEnabled(user.featureFlags, 'library_enabled') && user.permissions.has('library:borrow');
  const hubOn = isEnabled(user.featureFlags, 'resource_hub_enabled') && user.permissions.has('resource:view_department');
  if (!booksOn && !hubOn) notFound();

  const sp = await searchParams;
  const tabs: { key: Tab; label: string }[] = [
    ...(booksOn ? [{ key: 'catalogue' as Tab, label: 'Books' }, { key: 'loans' as Tab, label: 'My loans' }, { key: 'reservations' as Tab, label: 'Reservations' }] : []),
    ...(hubOn ? [{ key: 'pyqs' as Tab, label: 'PYQs' }, { key: 'notes' as Tab, label: 'Notes' }, { key: 'saved' as Tab, label: 'Saved' }] : []),
  ];
  const tab: Tab = tabs.some((x) => x.key === sp.tab) ? (sp.tab as Tab) : tabs[0]!.key;
  const q = sp.q?.trim().slice(0, 120) || undefined;

  const mine = booksOn ? await myLibrary(user) : null;
  const activeLoans = mine?.loans.filter((l) => !l.returnedAt) ?? [];
  const openRes = mine?.reservations.filter((r) => r.status === 'WAITING' || r.status === 'READY') ?? [];

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ tab, q, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/student/library?${p}`;
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold text-default sm:text-[30px]">Library</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {booksOn ? 'Find books, see what’s on the shelf, renew and reserve. ' : ''}
            {hubOn ? 'Notes and previous-year papers shared by your faculty.' : ''}
          </p>
        </div>
        {hubOn ? (
          <Link href="/student/resources" className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-brand hover:underline">
            All resources <ExternalLink size={13} aria-hidden />
          </Link>
        ) : null}
      </header>

      {mine ? (
        <section aria-label="Your library" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CampusStat label="Books with you" value={activeLoans.length} tone="lavender" href={qs({ tab: 'loans' })} />
          <CampusStat label="Overdue" value={activeLoans.filter((l) => l.overdue).length} tone="coral" href={qs({ tab: 'loans' })} />
          <CampusStat label="Ready to collect" value={openRes.filter((r) => r.status === 'READY').length} tone="mint" href={qs({ tab: 'reservations' })} />
          <CampusStat
            label="Estimated fines"
            value={`₹${activeLoans.reduce((s, l) => s + l.fineInr, 0)}`}
            hint="Payable at the desk"
            tone="sun"
          />
        </section>
      ) : null}

      <CampusTabs label="Library sections" active={tab} tabs={tabs.map((x) => ({ key: x.key, label: x.label, href: qs({ tab: x.key, q: undefined }) }))} />

      {tab === 'catalogue' || tab === 'pyqs' || tab === 'notes' ? (
        <form action="/student/library" method="get" role="search" aria-label="Search the library" className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <label className="relative flex-1">
            <span className="sr-only">Search</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder={tab === 'catalogue' ? 'Title, author, ISBN or subject' : 'Search by topic or subject'}
              className="h-11 w-full rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface pl-9 pr-3 text-[13.5px] text-default placeholder:text-subtle focus:border-ink"
            />
          </label>
          <button type="submit" className="min-h-[44px] rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[13px] font-extrabold text-white shadow-pop campus-press">
            Search
          </button>
        </form>
      ) : null}

      {tab === 'catalogue' ? <Catalogue user={user} q={q} /> : null}
      {tab === 'loans' && mine ? <Loans loans={mine.loans} policy={mine.policy} /> : null}
      {tab === 'reservations' && mine ? <Reservations reservations={mine.reservations} holdDays={mine.policy.holdDays} /> : null}
      {tab === 'pyqs' || tab === 'notes' || tab === 'saved' ? <Resources user={user} tab={tab} q={q} /> : null}
    </div>
  );
}

async function Catalogue({ user, q }: { user: Awaited<ReturnType<typeof requireStudentContext>>; q?: string }) {
  const books = await searchBooks(user, { q });
  if (!books.length) {
    return (
      <CampusCard className="py-4">
        <CampusEmptyState sprite="student" title={q ? 'No books match that search' : 'The catalogue is empty'} description={q ? 'Try the author’s surname or a subject code.' : 'Your library hasn’t added books to CampusOS yet.'} />
      </CampusCard>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label={`${books.length} books`}>
      {books.map((b) => (
        <li key={b.id}>
          <CampusCard className="flex h-full flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14.5px] font-extrabold leading-snug text-default">{b.title}</p>
                <p className="text-[12.5px] text-muted">
                  {[b.authors, b.edition, b.publishedYear].filter(Boolean).join(' · ') || 'Author not listed'}
                </p>
              </div>
              <CampusPill tone={b.available > 0 ? 'mint' : 'coral'}>{b.available > 0 ? `${b.available} on shelf` : 'All out'}</CampusPill>
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-subtle">
              {b.shelf ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} aria-hidden /> {b.shelf}
                </span>
              ) : null}
              {b.subject ? <span>{b.subject}</span> : null}
              <span>
                {b.totalCopies} {b.totalCopies === 1 ? 'copy' : 'copies'}
                {b.waiting ? ` · ${b.waiting} waiting` : ''}
              </span>
              {b.isbn ? <span>ISBN {b.isbn}</span> : null}
            </p>
            <div className="mt-auto pt-1">
              {b.myLoan ? (
                <p className="text-[12.5px] font-bold text-lavender-ink">You have this book.</p>
              ) : b.myReservation === 'READY' ? (
                <p className="text-[12.5px] font-bold text-mint-ink">A copy is held for you at the desk.</p>
              ) : b.myReservation === 'WAITING' ? (
                <p className="text-[12.5px] font-bold text-muted">You’re in the queue.</p>
              ) : b.available > 0 ? (
                <p className="text-[12.5px] text-muted">Borrow it at the library desk with your ID card.</p>
              ) : (
                <ReserveButton bookId={b.id} title={b.title} />
              )}
            </div>
          </CampusCard>
        </li>
      ))}
    </ul>
  );
}

function Loans({ loans, policy }: { loans: Awaited<ReturnType<typeof myLibrary>>['loans']; policy: Awaited<ReturnType<typeof myLibrary>>['policy'] }) {
  const open = loans.filter((l) => !l.returnedAt);
  const past = loans.filter((l) => l.returnedAt);
  return (
    <div className="space-y-4">
      {open.length === 0 ? (
        <CampusCard className="py-4">
          <CampusEmptyState sprite="student" title="No books with you" description="Books you borrow at the desk show up here with their due dates." />
        </CampusCard>
      ) : (
        <ul className="space-y-3">
          {open.map((l) => (
            <li key={l.id}>
              <CampusCard className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between', l.overdue && 'bg-coral')}>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-extrabold text-default">{l.title}</p>
                  <p className={cn('mt-0.5 flex items-center gap-1.5 text-[12.5px] font-bold', l.overdue ? 'text-coral-ink' : 'text-muted')}>
                    <Clock size={13} aria-hidden />
                    {l.overdue ? `Overdue since ${formatDate(l.dueAt)} · estimated fine ₹${l.fineInr}` : `Due ${formatDate(l.dueAt)}`}
                    {l.renewals ? ` · renewed ${l.renewals}×` : ''}
                  </p>
                  {!l.canRenew && l.renewBlockedReason ? <p className="mt-1 text-[12px] text-subtle">{l.renewBlockedReason}</p> : null}
                </div>
                {l.canRenew ? <RenewButton loanId={l.id} title={l.title} /> : null}
              </CampusCard>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-subtle">
        Loans run {policy.loanDays} days and can be renewed {policy.maxRenewals} times if nobody is waiting. Late returns cost an estimated ₹{policy.finePerDayInr}/day (up to ₹
        {policy.maxFineInr}), paid at the desk — CampusOS never takes payments.
      </p>
      {past.length ? (
        <details className="rounded-xl border border-[hsl(var(--border))] bg-surface">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-[13px] font-bold text-muted">Returned recently ({past.length})</summary>
          <ul className="divide-y divide-[hsl(var(--border))] px-3">
            {past.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="truncate text-default">{l.title}</span>
                <span className="shrink-0 text-subtle">
                  Returned {formatDate(l.returnedAt!)}
                  {l.fineInr ? ` · fine ₹${l.fineInr}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Reservations({ reservations, holdDays }: { reservations: Awaited<ReturnType<typeof myLibrary>>['reservations']; holdDays: number }) {
  if (!reservations.length) {
    return (
      <CampusCard className="py-4">
        <CampusEmptyState sprite="student" title="No reservations" description="When every copy of a book is out, reserve it from the catalogue and we’ll tell you when it’s your turn." />
      </CampusCard>
    );
  }
  const label = { WAITING: 'In the queue', READY: 'Ready to collect', FULFILLED: 'Collected', EXPIRED: 'Expired', CANCELLED: 'Cancelled' } as const;
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {reservations.map((r) => (
          <li key={r.id}>
            <CampusCard className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between', r.status === 'READY' && 'bg-mint')}>
              <div className="min-w-0">
                <p className="text-[14.5px] font-extrabold text-default">{r.title}</p>
                <p className="mt-0.5 text-[12.5px] font-bold text-muted">
                  {label[r.status]}
                  {r.status === 'WAITING' && r.position ? ` · #${r.position} in line` : ''}
                  {r.status === 'READY' && r.readyUntil ? ` · collect by ${formatDate(r.readyUntil)}${r.shelf ? ` · ${r.shelf}` : ''}` : ''}
                </p>
              </div>
              {r.status === 'WAITING' || r.status === 'READY' ? <CancelReservationButton reservationId={r.id} title={r.title} /> : null}
            </CampusCard>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-subtle">A returned copy is held for the next person for {holdDays} days, then offered to whoever is next.</p>
    </div>
  );
}

async function Resources({ user, tab, q }: { user: Awaited<ReturnType<typeof requireStudentContext>>; tab: 'pyqs' | 'notes' | 'saved'; q?: string }) {
  const rows = await listStudentResources(user, {
    q,
    kinds: tab === 'pyqs' ? ['QUESTION_BANK'] : tab === 'notes' ? ['NOTES', 'DOCUMENT', 'SLIDES'] : undefined,
    savedOnly: tab === 'saved',
  });
  if (!rows.length) {
    const copy = {
      pyqs: ['No previous-year papers yet', 'When your faculty share question banks or past papers, they appear here.'],
      notes: ['No notes yet', 'Notes, handouts and slides shared with you appear here.'],
      saved: ['Nothing saved yet', 'Tap Save on any note or paper to keep it here.'],
    }[tab];
    return (
      <CampusCard className="py-4">
        <CampusEmptyState sprite="student" title={q ? 'Nothing matches that search' : copy[0]!} description={q ? 'Try a subject code or a simpler word.' : copy[1]} />
      </CampusCard>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {rows.map((r) => {
        const href = r.externalUrl ?? r.fileUrl;
        const Icon = r.kind === 'QUESTION_BANK' ? ListChecks : r.kind === 'NOTES' ? BookOpen : BookMarked;
        return (
          <li key={r.id}>
            <CampusCard className="flex h-full flex-col gap-2 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-sky text-sky-ink">
                  <Icon size={18} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-extrabold leading-snug text-default">{r.title}</p>
                  <p className="text-[12px] text-subtle">
                    {[r.subjectCode ? `${r.subjectCode} · ${r.subjectName}` : null, humanize(r.kind), r.academicYear].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              {r.description ? <p className="text-[12.5px] text-muted">{truncate(r.description, 160)}</p> : null}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {href ? (
                  <a
                    href={href}
                    target={r.externalUrl ? '_blank' : undefined}
                    rel={r.externalUrl ? 'noreferrer noopener' : undefined}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-surface px-3 text-[12.5px] font-bold shadow-pop campus-press"
                  >
                    Open <ExternalLink size={13} aria-hidden />
                  </a>
                ) : null}
                <ResourceSaveToggle resourceId={r.id} saved={r.saved} title={r.title} />
              </div>
            </CampusCard>
          </li>
        );
      })}
    </ul>
  );
}
