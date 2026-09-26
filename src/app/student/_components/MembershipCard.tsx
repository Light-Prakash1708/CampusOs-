import Link from 'next/link';
import { BadgeCheck, Building2, Clock, AlertCircle } from 'lucide-react';
import type { AuthContext } from '@/lib/auth/context';
import { Badge, Button, Card, CardBody } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { getMyMembership } from '@/services/membership';

/** Where this student stands with a college: personal, pending, needs attention, or verified. */
export async function MembershipCard({ user }: { user: AuthContext }) {
  const m = await getMyMembership(user);
  const req = m.request;

  if (m.kind !== 'PERSONAL') {
    return (
      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-center gap-3">
          {m.verified ? <BadgeCheck size={20} className="text-success" aria-hidden /> : <Building2 size={20} className="text-brand" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-default">
              {m.verified ? 'Verified student' : 'Student'} at {m.institutionName}
            </p>
            <p className="text-[12.5px] text-muted">
              {m.verified && req?.decidedAt ? `Verified by your college on ${formatDate(req.decidedAt)}.` : 'Your account is managed by your college.'}
            </p>
          </div>
          {m.verified ? <Badge tone="success">Verified ✓</Badge> : null}
        </CardBody>
      </Card>
    );
  }

  const open = req && (req.status === 'PENDING' || req.status === 'UNDER_REVIEW');
  const attention = req && req.status === 'REJECTED';
  return (
    <Card className="mb-5">
      <CardBody className="flex flex-wrap items-center gap-3">
        {open ? (
          <Clock size={20} className="text-warning" aria-hidden />
        ) : attention ? (
          <AlertCircle size={20} className="text-danger" aria-hidden />
        ) : (
          <Building2 size={20} className="text-brand" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-default">
            {open
              ? `Verification pending at ${req!.institutionName}`
              : attention
                ? 'Your college verification needs attention'
                : 'CampusOS student · Personal account'}
          </p>
          <p className="text-[12.5px] text-muted">
            {open
              ? `Sent ${formatDate(req!.createdAt)}${req!.status === 'UNDER_REVIEW' ? ' · being reviewed' : ''}. Your college decides; there’s no fixed review time.`
              : attention
                ? req!.reasonText
                : 'Connect your college to see your timetable, attendance and notices.'}
          </p>
        </div>
        <Button asChild variant={open ? 'secondary' : 'primary'} size="sm">
          <Link href="/student/join">{open ? 'View status' : attention ? 'Fix and resend' : 'Join your college'}</Link>
        </Button>
      </CardBody>
    </Card>
  );
}
