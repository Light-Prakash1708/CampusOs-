import { notFound } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { LIBRARY_POLICY } from '@/lib/library';
import { cn, formatDate } from '@/lib/utils';
import { CampusCard, CampusSectionHeader, CampusStat, CampusTabs } from '@/components/campus';
import { AddBookForm, CopiesEditor, IssueForm, ReturnButton } from '@/components/campus/LibraryActions';
import { libraryDesk, searchBooks } from '@/services/library';

export const metadata = { title: 'Library desk' };
export const dynamic = 'force-dynamic';

export default async function LibraryDeskPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requirePermission('library:manage');
  if (!isEnabled(user.featureFlags, 'library_enabled')) notFound();
  const sp = await searchParams;
  const tab = sp.tab === 'catalogue' ? 'catalogue' : 'desk';
  const q = sp.q?.trim().slice(0, 120) || undefined;
  const [desk, books] = await Promise.all([libraryDesk(user), searchBooks(user, { q, includeInactive: true, limit: 200 })]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[26px] font-extrabold text-default sm:text-[30px]">Library desk</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Issue and return books, manage the catalogue. Loans run {LIBRARY_POLICY.loanDays} days; estimated fines ₹{LIBRARY_POLICY.finePerDayInr}/day, capped at ₹{LIBRARY_POLICY.maxFineInr}.
        </p>
      </header>

      <section aria-label="Library at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <CampusStat label="Titles" value={desk.stats.titles} tone="lavender" />
        <CampusStat label="Copies" value={desk.stats.copies} tone="sky" />
        <CampusStat label="On loan" value={desk.stats.onLoan} tone="mint" />
        <CampusStat label="Overdue" value={desk.stats.overdue} tone="coral" />
        <CampusStat label="Reservations" value={desk.stats.reservations} tone="sun" />
      </section>

      <CampusTabs
        label="Library sections"
        active={tab}
        tabs={[
          { key: 'desk', label: 'Desk', href: '/admin/library' },
          { key: 'catalogue', label: 'Catalogue', href: '/admin/library?tab=catalogue', count: desk.stats.titles },
        ]}
      />

      {tab === 'desk' ? (
        <>
          <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="issue-h">
            <CampusSectionHeader id="issue-h" title="Issue a book" />
            <div className="mt-3">
              <IssueForm books={books.filter((b) => b.isActive).map((b) => ({ id: b.id, title: b.title, available: b.available }))} />
            </div>
          </CampusCard>

          <CampusCard as="section" className="overflow-hidden" aria-labelledby="loans-h">
            <div className="p-4 sm:p-5">
              <CampusSectionHeader id="loans-h" title={`On loan · ${desk.loans.length}`} />
            </div>
            {desk.loans.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-subtle">Nothing is out right now.</p>
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))] border-t border-[hsl(var(--border))]">
                {desk.loans.map((l) => (
                  <li key={l.id} className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5', l.overdue && 'bg-coral/40')}>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-extrabold text-default">{l.title}</p>
                      <p className="text-[12px] text-muted">
                        {l.borrower} · {l.borrowerRef}
                      </p>
                      <p className={cn('flex items-center gap-1 text-[12px] font-bold', l.overdue ? 'text-coral-ink' : 'text-subtle')}>
                        {l.overdue ? <AlertTriangle size={12} aria-hidden /> : null}
                        {l.overdue ? `Overdue since ${formatDate(l.dueAt)} · ₹${l.fineInr}` : `Due ${formatDate(l.dueAt)}`}
                      </p>
                    </div>
                    <ReturnButton loanId={l.id} title={l.title} fineInr={l.fineInr} />
                  </li>
                ))}
              </ul>
            )}
          </CampusCard>
        </>
      ) : (
        <>
          <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="add-h">
            <CampusSectionHeader id="add-h" title="Add a book" />
            <div className="mt-3">
              <AddBookForm />
            </div>
          </CampusCard>
          <CampusCard as="section" className="overflow-hidden" aria-labelledby="cat-h">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <CampusSectionHeader id="cat-h" title="Catalogue" />
              <form action="/admin/library" method="get" role="search" className="flex gap-2">
                <input type="hidden" name="tab" value="catalogue" />
                <label>
                  <span className="sr-only">Search the catalogue</span>
                  <input name="q" defaultValue={q} placeholder="Title, author, ISBN" className="h-11 w-56 rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-3 text-[13px]" />
                </label>
                <button type="submit" className="min-h-[44px] rounded-xl border-[1.5px] border-ink bg-surface px-3 text-[13px] font-bold shadow-pop">
                  Search
                </button>
              </form>
            </div>
            {books.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-subtle">{q ? 'No books match.' : 'No books yet — add the first one above.'}</p>
            ) : (
              <div className="overflow-x-auto border-t border-[hsl(var(--border))]">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="bg-surface-sunken text-[12px] text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-bold">Title</th>
                      <th scope="col" className="px-4 py-2 font-bold">Shelf</th>
                      <th scope="col" className="px-4 py-2 font-bold">On loan</th>
                      <th scope="col" className="px-4 py-2 font-bold">Waiting</th>
                      <th scope="col" className="px-4 py-2 font-bold">Copies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))]">
                    {books.map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-2">
                          <span className="font-bold text-default">{b.title}</span>
                          <span className="block text-[12px] text-subtle">{[b.authors, b.isbn ? `ISBN ${b.isbn}` : null].filter(Boolean).join(' · ')}</span>
                        </td>
                        <td className="px-4 py-2 text-muted">{b.shelf ?? '—'}</td>
                        <td className="tabular px-4 py-2">{b.onLoan}</td>
                        <td className="tabular px-4 py-2">{b.waiting}</td>
                        <td className="px-4 py-2">
                          <CopiesEditor bookId={b.id} copies={b.totalCopies} title={b.title} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CampusCard>
        </>
      )}
    </div>
  );
}
