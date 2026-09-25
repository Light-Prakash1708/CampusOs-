import Link from 'next/link';
import { Award, ShieldCheck } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { CampusCard, CampusEmptyState, PixelBadge } from '@/components/campus';
import { listMyCertificates } from '@/services/events';
import { requireStudentContext } from '../_lib/auth';

export const metadata = { title: 'Certificate Wallet' };
export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { PARTICIPATION: 'Participation', WINNER: 'Winner', RUNNER_UP: 'Runner-up', VOLUNTEER: 'Volunteer', ORGANISER: 'Organiser' };

export default async function CertificatesPage() {
  const user = await requireStudentContext();
  const certs = await listMyCertificates(user);
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[28px] font-extrabold text-default">Certificate Wallet</h1>
        <p className="mt-1 text-[14px] text-muted">Every certificate here can be checked by anyone with its verification ID — no screenshots needed.</p>
      </header>
      {certs.length === 0 ? (
        <CampusCard className="py-4">
          <CampusEmptyState sprite="student" title="No certificates yet" description="Attend an event that offers one — it lands here after the organiser issues it." action={<Link href="/student/events?certificate=1" className="inline-flex min-h-[40px] items-center rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[13px] font-extrabold text-white shadow-pop">Find events with certificates</Link>} />
        </CampusCard>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {certs.map((c) => (
            <li key={c.id}>
              <Link href={`/student/certificates/${c.id}`} className="flex gap-3 rounded-2xl campus-outline campus-press bg-surface-raised p-4">
                <PixelBadge icon={c.kind === 'WINNER' ? 'crown' : 'star'} color={c.kind === 'WINNER' ? 'gold' : 'indigo'} size={48} />
                <div className="min-w-0">
                  <p className="line-clamp-2 font-display text-[15px] font-extrabold text-default">{c.eventTitle}</p>
                  <p className="text-[12.5px] font-semibold text-muted">{c.organizerName ?? c.institutionName}</p>
                  <p className="text-[12px] text-subtle">{KIND[c.kind] ?? c.kind} · {formatDate(c.eventDate)}</p>
                  <p className="mt-1 inline-flex items-center gap-1 font-mono text-[11.5px] text-subtle"><ShieldCheck size={12} aria-hidden /> {c.code}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-1.5 text-[12px] text-subtle"><Award size={13} aria-hidden /> Certificates are issued by organisers only to attendees who checked in.</p>
    </div>
  );
}
