import Link from 'next/link';
import { ArrowRight, Building2, Clock } from 'lucide-react';
import type { AuthContext } from '@/lib/auth/context';
import { getMyMembership } from '@/services/membership';

/** Personal accounts only: a nudge to connect a college (or the status of the request). */
export async function JoinCollegeBanner({ user }: { user: AuthContext }) {
  const m = await getMyMembership(user);
  if (m.kind !== 'PERSONAL') return null;
  const open = m.request && (m.request.status === 'PENDING' || m.request.status === 'UNDER_REVIEW');
  const attention = m.request?.status === 'REJECTED';
  return (
    <Link
      href="/student/join"
      className="flex items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-lavender px-4 py-3 shadow-pop transition-transform hover:-translate-y-0.5"
    >
      {open ? <Clock size={20} className="shrink-0 text-lavender-ink" aria-hidden /> : <Building2 size={20} className="shrink-0 text-lavender-ink" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-default">
          {open ? `Verification pending at ${m.request!.institutionName}` : attention ? 'Your college verification needs attention' : 'Connect your college'}
        </span>
        <span className="block text-[12.5px] text-muted">
          {open ? 'Your college is reviewing your request.' : 'Get your timetable, attendance and notices here once your college verifies you.'}
        </span>
      </span>
      <ArrowRight size={18} className="shrink-0 text-default" aria-hidden />
    </Link>
  );
}
