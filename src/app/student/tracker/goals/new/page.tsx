import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isEnabled } from '@/lib/features';
import { CampusCard } from '@/components/campus';
import { requireStudentContext } from '../../../_lib/auth';
import { GoalForm } from '../../TrackerClient';

export const metadata = { title: 'New goal' };

export default async function NewGoalPage() {
  const user = await requireStudentContext();
  if (!isEnabled(user.featureFlags, 'personal_tracker_enabled')) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/student/tracker" className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-muted hover:text-default">
        <ArrowLeft size={15} aria-hidden /> Tracker
      </Link>
      <h1 className="font-display text-[26px] font-extrabold text-default">New goal</h1>
      <CampusCard className="p-4 sm:p-6">
        <GoalForm />
      </CampusCard>
    </div>
  );
}
