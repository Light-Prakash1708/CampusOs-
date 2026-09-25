import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isEnabled } from '@/lib/features';
import { getEvent } from '@/services/events';
import { formatEventDates } from '@/components/campus/events';
import { requireStudentContext } from '../../../_lib/auth';
import { PassQr } from './PassQr';

export const metadata = { title: 'Event pass' };
export const dynamic = 'force-dynamic';

export default async function PassPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStudentContext();
  if (!isEnabled(user.featureFlags, 'events_enabled')) notFound();
  const { id } = await params;
  let detail;
  try {
    detail = await getEvent(user, id);
  } catch {
    notFound();
  }
  const reg = detail.registration;
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <Link href={`/student/events/${id}`} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted hover:text-default">
        <ArrowLeft size={15} aria-hidden /> Back to event
      </Link>
      <div className="overflow-hidden rounded-3xl campus-outline bg-surface-raised">
        <div className="border-b-[1.5px] border-dashed border-ink bg-lavender p-5">
          <p className="text-[11.5px] font-extrabold uppercase tracking-wider text-lavender-ink">Event pass</p>
          <h1 className="mt-1 font-display text-[22px] font-extrabold leading-tight text-default">{detail.event.title}</h1>
          <p className="mt-1 text-[13px] font-semibold text-muted">{formatEventDates(detail.event.startsAt, detail.event.endsAt)} · {detail.venue ?? detail.event.city ?? 'Online'}</p>
        </div>
        <div className="p-5 text-center">
          <p className="font-display text-[18px] font-extrabold text-default">{user.fullName}</p>
          {reg?.status === 'REGISTERED' ? (
            reg.checkedInAt ? (
              <p className="mt-4 rounded-xl bg-mint p-4 text-[14px] font-bold text-mint-ink" role="status">✓ You’re checked in. Enjoy the event!</p>
            ) : (
              <PassQr eventId={id} code={reg.code ?? ''} />
            )
          ) : (
            <p className="mt-4 text-[13.5px] text-muted">A pass appears here once your registration is confirmed.</p>
          )}
        </div>
      </div>
      <p className="text-center text-[12px] text-subtle">The QR refreshes itself and expires after 10 minutes, so screenshots can’t be passed around.</p>
    </div>
  );
}
