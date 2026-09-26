import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { cn, formatDateTime } from '@/lib/utils';
import { listMembershipRequests, REJECTION_REASONS, REQUEST_STATUSES, type RequestStatus } from '@/services/membership';
import { VerificationActions } from './VerificationActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Verification · CampusOS' };

const TABS: { key: RequestStatus | 'OPEN'; label: string }[] = [
  { key: 'OPEN', label: 'Waiting' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Declined' },
  { key: 'WITHDRAWN', label: 'Withdrawn' },
  { key: 'EXPIRED', label: 'Expired' },
];

const SIGNAL_LABELS: Record<string, (v: unknown) => { text: string; tone: 'success' | 'warning' | 'neutral' | 'danger' } | null> = {
  emailDomainMatch: (v) => (v ? { text: 'College email domain', tone: 'success' } : { text: 'Personal email', tone: 'neutral' }),
  documentAttached: (v) => (v ? { text: 'ID attached', tone: 'success' } : { text: 'No ID attached', tone: 'warning' }),
  rollNumberAlreadyRegistered: (v) => (v ? { text: 'Roll number already in use', tone: 'danger' } : null),
  collegeAccountWithSameEmail: (v) => (v ? { text: `College account exists (${String(v).toLowerCase()})`, tone: 'danger' } : null),
};

/**
 * Students who signed up on their own and asked to join this college. The
 * checks shown are hints — the decision is the reviewer's.
 */
export default async function VerificationsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const user = await requirePermission('user:approve_registration');
  const params = await searchParams;
  const status = params.status === 'OPEN' || (REQUEST_STATUSES as readonly string[]).includes(params.status ?? '') ? (params.status as RequestStatus | 'OPEN') : 'OPEN';
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const data = await listMembershipRequests(user, { status, page });
  const open = (data.counts.PENDING ?? 0) + (data.counts.UNDER_REVIEW ?? 0);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <PageHeader
        title="Student verification"
        description="Students who created their own CampusOS account and asked to join your college. Approving moves their existing account into your college."
      />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter requests">
        {TABS.map((tab) => {
          const n = tab.key === 'OPEN' ? open : data.counts[tab.key] ?? 0;
          const active = tab.key === status;
          return (
            <Link
              key={tab.key}
              href={`/admin/verifications?status=${tab.key}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold',
                active ? 'border-brand bg-brand-subtle text-brand-text' : 'border-[hsl(var(--border))] text-muted hover:border-[hsl(var(--border-strong))]',
              )}
            >
              {tab.label} <span className="tabular text-subtle">{n}</span>
            </Link>
          );
        })}
      </nav>

      {data.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title={status === 'OPEN' ? 'Nothing waiting' : 'Nothing here'}
            description={status === 'OPEN' ? 'New join requests appear here, oldest first.' : 'Requests you decide are kept here for your records.'}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.rows.map((r) => {
            const signals = Object.entries(r.signals ?? {})
              .map(([k, v]) => SIGNAL_LABELS[k]?.(v) ?? null)
              .filter((x): x is NonNullable<typeof x> => !!x);
            return (
              <li key={r.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-default">
                        {r.firstName} {r.lastName}
                        {r.status === 'UNDER_REVIEW' ? <Badge tone="info" className="ml-2 align-middle">Under review</Badge> : null}
                      </p>
                      <p className="text-[12.5px] text-muted">{r.email}</p>
                      <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[130px_1fr]">
                        <dt className="text-muted">Programme</dt>
                        <dd className="text-default">
                          {r.programName ?? '—'} · Year {r.year}{r.sectionName ? ` · ${r.sectionName}` : ''}
                        </dd>
                        <dt className="text-muted">Department</dt>
                        <dd className="text-default">{r.departmentName ?? '—'}</dd>
                        <dt className="text-muted">Roll number</dt>
                        <dd className="font-mono text-default">{r.rollNumber}</dd>
                        <dt className="text-muted">Submitted</dt>
                        <dd className="text-default">{formatDateTime(r.createdAt)}</dd>
                        {r.decidedAt ? (
                          <>
                            <dt className="text-muted">Decided</dt>
                            <dd className="text-default">
                              {formatDateTime(r.decidedAt)}
                              {r.decisionReason ? ` · ${REJECTION_REASONS[r.decisionReason as keyof typeof REJECTION_REASONS] ?? r.decisionReason}` : ''}
                            </dd>
                          </>
                        ) : null}
                      </dl>
                      {signals.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Automated checks (hints only)">
                          {signals.map((sg) => (
                            <Badge key={sg.text} tone={sg.tone}>{sg.text}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {r.status === 'PENDING' || r.status === 'UNDER_REVIEW' ? (
                      <VerificationActions requestId={r.id} name={`${r.firstName} ${r.lastName}`} hasDocument={r.hasDocument} status={r.status} />
                    ) : (
                      <Badge tone={r.status === 'APPROVED' ? 'success' : 'neutral'}>{r.status.charAt(0) + r.status.slice(1).toLowerCase().replace('_', ' ')}</Badge>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-[13px]" aria-label="Pages">
          <span className="text-muted">Page {data.page} of {pages}</span>
          <span className="flex gap-2">
            {data.page > 1 ? <Link className="font-medium text-brand" href={`/admin/verifications?status=${status}&page=${data.page - 1}`}>Previous</Link> : null}
            {data.page < pages ? <Link className="font-medium text-brand" href={`/admin/verifications?status=${status}&page=${data.page + 1}`}>Next</Link> : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
