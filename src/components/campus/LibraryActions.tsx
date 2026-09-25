'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BookPlus, CalendarPlus, RotateCcw, X } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

/** One-button actions (reserve, renew, cancel) that refresh the page on success. */
function useAction<T>(onDone?: (r: T) => string | null) {
  const router = useRouter();
  const api = useApi<T>();
  const [msg, setMsg] = React.useState<string | null>(null);
  const run = async (url: string, method: 'POST' | 'PATCH' | 'DELETE' = 'POST', body: unknown = {}) => {
    setMsg(null);
    const res = await api.call(url, body, method);
    if (res) {
      setMsg(onDone ? onDone(res) : null);
      router.refresh();
    }
    return res;
  };
  return { ...api, run, msg };
}

export function ReserveButton({ bookId, title }: { bookId: string; title: string }) {
  const a = useAction<{ position: number }>((r) => `You’re #${r.position} in the queue.`);
  return (
    <div className="space-y-1">
      <Button variant="secondary" loading={a.loading} onClick={() => a.run(`/api/library/books/${bookId}/reserve`)} className="min-h-[44px]" aria-label={`Reserve ${title}`}>
        <BookPlus size={15} aria-hidden /> Reserve
      </Button>
      <p role="status" aria-live="polite" className="text-[12px] font-bold text-mint-ink">
        {a.msg}
      </p>
      <ErrorBox error={a.error} />
    </div>
  );
}

export function RenewButton({ loanId, title }: { loanId: string; title: string }) {
  const a = useAction<{ dueAt: string }>((r) => `Renewed — now due ${new Date(r.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`);
  return (
    <div className="space-y-1">
      <Button variant="secondary" loading={a.loading} onClick={() => a.run(`/api/library/loans/${loanId}/renew`)} className="min-h-[44px]" aria-label={`Renew ${title}`}>
        <CalendarPlus size={15} aria-hidden /> Renew
      </Button>
      <p role="status" aria-live="polite" className="text-[12px] font-bold text-mint-ink">
        {a.msg}
      </p>
      <ErrorBox error={a.error} />
    </div>
  );
}

export function CancelReservationButton({ reservationId, title }: { reservationId: string; title: string }) {
  const a = useAction<{ id: string }>();
  return (
    <div className="space-y-1">
      <Button variant="ghost" loading={a.loading} onClick={() => a.run(`/api/library/reservations/${reservationId}`, 'DELETE')} className="min-h-[44px]" aria-label={`Cancel reservation for ${title}`}>
        <X size={15} aria-hidden /> Cancel
      </Button>
      <ErrorBox error={a.error} />
    </div>
  );
}

/* --------------------------------- desk ----------------------------------- */

export function IssueForm({ books }: { books: { id: string; title: string; available: number }[] }) {
  const a = useAction<{ borrower: string; dueAt: string }>(
    (r) => `Issued to ${r.borrower}. Due ${new Date(r.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`,
  );
  const [bookId, setBookId] = React.useState('');
  const [borrower, setBorrower] = React.useState('');
  return (
    <form
      className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await a.run('/api/library/loans', 'POST', { bookId, borrower })) setBorrower('');
      }}
    >
      <Field label="Book" htmlFor="issue-book">
        <select
          id="issue-book"
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          required
          className="h-11 w-full rounded-lg border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-2.5 text-[13px] text-default"
        >
          <option value="">Choose a book…</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} — {b.available} on shelf
            </option>
          ))}
        </select>
      </Field>
      <Field label="Borrower (email or roll number)" htmlFor="issue-who" error={a.fieldError('borrower')}>
        <Input id="issue-who" value={borrower} onChange={(e) => setBorrower(e.target.value)} required maxLength={200} className="h-11" />
      </Field>
      <Button type="submit" variant="primary" loading={a.loading} disabled={!bookId || borrower.trim().length < 2} className="min-h-[44px]">
        Issue
      </Button>
      <div className="sm:col-span-3">
        <p role="status" aria-live="polite" className="text-[12.5px] font-bold text-mint-ink">
          {a.msg}
        </p>
        <ErrorBox error={a.error} />
      </div>
    </form>
  );
}

export function ReturnButton({ loanId, title, fineInr }: { loanId: string; title: string; fineInr: number }) {
  const a = useAction<{ fineInr: number }>((r) => (r.fineInr > 0 ? `Returned. Collect ₹${r.fineInr}.` : 'Returned.'));
  const [waive, setWaive] = React.useState(false);
  const [reason, setReason] = React.useState('');
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          loading={a.loading}
          disabled={waive && reason.trim().length < 5}
          onClick={() => a.run(`/api/library/loans/${loanId}/return`, 'POST', waive ? { waiveFine: true, waiveReason: reason } : {})}
          className="min-h-[44px]"
          aria-label={`Return ${title}`}
        >
          <RotateCcw size={15} aria-hidden /> Return
        </Button>
        {fineInr > 0 ? (
          <label className="flex min-h-[44px] items-center gap-2 text-[12.5px] font-semibold text-muted">
            <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} className="h-4 w-4" /> Waive ₹{fineInr}
          </label>
        ) : null}
      </div>
      {waive ? (
        <label className="block">
          <span className="sr-only">Reason for waiving</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (kept in the audit log)" maxLength={300} className="h-10" />
        </label>
      ) : null}
      <p role="status" aria-live="polite" className="text-[12px] font-bold text-mint-ink">
        {a.msg}
      </p>
      <ErrorBox error={a.error} />
    </div>
  );
}

export function AddBookForm() {
  const a = useAction<{ id: string }>(() => 'Added to the catalogue.');
  const empty = { title: '', authors: '', isbn: '', publisher: '', publishedYear: '', shelf: '', totalCopies: '1' };
  const [f, setF] = React.useState(empty);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const created = await a.run('/api/library/books', 'POST', {
          title: f.title,
          authors: f.authors || null,
          isbn: f.isbn || null,
          publisher: f.publisher || null,
          publishedYear: f.publishedYear ? Number(f.publishedYear) : null,
          shelf: f.shelf || null,
          totalCopies: Number(f.totalCopies || 0),
        });
        if (created) setF(empty);
      }}
    >
      <Field label="Title" htmlFor="bk-title" required error={a.fieldError('title')} className="sm:col-span-2">
        <Input id="bk-title" value={f.title} onChange={set('title')} required maxLength={300} />
      </Field>
      <Field label="Author(s)" htmlFor="bk-auth">
        <Input id="bk-auth" value={f.authors} onChange={set('authors')} maxLength={300} />
      </Field>
      <Field label="ISBN" htmlFor="bk-isbn" hint="10 or 13 digits" error={a.fieldError('isbn')}>
        <Input id="bk-isbn" value={f.isbn} onChange={set('isbn')} maxLength={20} inputMode="numeric" />
      </Field>
      <Field label="Publisher" htmlFor="bk-pub">
        <Input id="bk-pub" value={f.publisher} onChange={set('publisher')} maxLength={200} />
      </Field>
      <Field label="Year" htmlFor="bk-year">
        <Input id="bk-year" type="number" value={f.publishedYear} onChange={set('publishedYear')} min={1450} max={2200} />
      </Field>
      <Field label="Shelf" htmlFor="bk-shelf" hint="e.g. Central Library · Rack C-4">
        <Input id="bk-shelf" value={f.shelf} onChange={set('shelf')} maxLength={120} />
      </Field>
      <Field label="Copies" htmlFor="bk-copies" required>
        <Input id="bk-copies" type="number" value={f.totalCopies} onChange={set('totalCopies')} min={0} max={10000} required />
      </Field>
      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <p role="status" aria-live="polite" className="text-[12.5px] font-bold text-mint-ink">
          {a.msg}
        </p>
        <Button type="submit" variant="primary" loading={a.loading} className="min-h-[44px]">
          Add book
        </Button>
      </div>
      <div className="sm:col-span-2">
        <ErrorBox error={a.error} />
      </div>
    </form>
  );
}

export function CopiesEditor({ bookId, copies, title }: { bookId: string; copies: number; title: string }) {
  const a = useAction<{ id: string }>(() => 'Saved.');
  const [n, setN] = React.useState(String(copies));
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void a.run(`/api/library/books/${bookId}`, 'PATCH', { totalCopies: Number(n) });
      }}
    >
      <label>
        <span className="sr-only">Copies of {title}</span>
        <Input type="number" min={0} max={10000} value={n} onChange={(e) => setN(e.target.value)} className="h-11 w-20" />
      </label>
      <Button
        type="submit"
        variant="ghost"
        loading={a.loading}
        disabled={Number(n) === copies}
        className="min-h-[44px]"
      >
        Save
      </Button>
      {a.error ? <span className="text-[12px] font-bold text-coral-ink">{a.error.message}</span> : null}
    </form>
  );
}
