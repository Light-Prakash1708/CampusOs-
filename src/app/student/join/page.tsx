import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { storageAvailable } from '@/services/storage';
import { getMyMembership } from '@/services/membership';
import { requireStudentContext } from '../_lib/auth';
import { MembershipCard } from '../_components/MembershipCard';
import { JoinCollegeFlow, RequestStatusPanel } from './JoinCollegeFlow';

export const metadata = { title: 'Join your college' };
export const dynamic = 'force-dynamic';

/**
 * A personal CampusOS student asks their college to take them in. Their
 * account (and everything in it) moves only when the college approves.
 */
export default async function JoinCollegePage() {
  const user = await requireStudentContext();
  const m = await getMyMembership(user);
  const open = m.request && (m.request.status === 'PENDING' || m.request.status === 'UNDER_REVIEW');

  return (
    <>
      <PageHeader title="Join your college" description="Connect your CampusOS account to your college. Your college reviews every request." />
      <MembershipCard user={user} />
      {m.kind !== 'PERSONAL' ? (
        <p className="text-[13.5px] text-muted">
          Your account already belongs to {m.institutionName}. <Link href="/student" className="font-medium text-brand">Go home</Link>
        </p>
      ) : open ? (
        <RequestStatusPanel
          request={{
            id: m.request!.id,
            status: m.request!.status,
            institutionName: m.request!.institutionName,
            programName: m.request!.programName,
            year: m.request!.year,
            sectionName: m.request!.sectionName,
            rollNumberMasked: m.request!.rollNumberMasked,
            hasDocument: m.request!.hasDocument,
            createdAt: m.request!.createdAt.toISOString(),
          }}
        />
      ) : (
        <JoinCollegeFlow storage={storageAvailable()} />
      )}
    </>
  );
}
