import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { appUrl } from '@/lib/env';
import { formatDate } from '@/lib/utils';
import { PixelBadge, PixelRobot } from '@/components/campus';
import { getMyCertificate } from '@/services/events';
import { requireStudentContext } from '../../_lib/auth';
import { PrintButton } from './PrintButton';

export const metadata = { title: 'Certificate' };
export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { PARTICIPATION: 'Certificate of Participation', WINNER: 'Certificate of Excellence — Winner', RUNNER_UP: 'Certificate of Merit — Runner-up', VOLUNTEER: 'Certificate of Appreciation — Volunteer', ORGANISER: 'Certificate of Appreciation — Organiser' };

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStudentContext();
  const { id } = await params;
  let c;
  try {
    c = await getMyCertificate(user, id);
  } catch {
    notFound();
  }
  const verifyUrl = appUrl(`/verify/${c.code}`);
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href="/student/certificates" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted hover:text-default"><ArrowLeft size={15} aria-hidden /> Wallet</Link>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-3xl rounded-2xl border-[3px] border-double border-ink bg-surface-raised p-8 text-center shadow-pop-lg sm:p-12">
        <div className="flex justify-center gap-3"><PixelBadge icon="star" color="indigo" size={44} /><PixelBadge icon="flag" color="gold" size={44} /></div>
        <p className="mt-4 text-[12px] font-extrabold uppercase tracking-[0.2em] text-subtle">{c.institutionName}</p>
        <h1 className="mt-2 font-display text-[28px] font-extrabold text-default sm:text-[34px]">{KIND[c.kind] ?? 'Certificate'}</h1>
        <p className="mt-6 text-[14px] text-muted">This certifies that</p>
        <p className="mt-1 font-display text-[30px] font-extrabold text-brand">{c.recipientName}</p>
        <p className="mt-3 text-[14px] text-muted">took part in</p>
        <p className="mt-1 font-display text-[20px] font-extrabold text-default">{c.eventTitle}</p>
        <p className="mt-1 text-[13.5px] text-muted">organised by {c.organizerName ?? c.institutionName} · {formatDate(c.eventStart)}</p>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-[hsl(var(--border))] pt-4 text-left">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Verification ID</p>
            <p className="font-mono text-[15px] font-bold text-default">{c.code}</p>
            <p className="text-[11.5px] text-subtle">Verify at {verifyUrl}</p>
          </div>
          <div className="flex items-center gap-2 text-[11.5px] text-subtle"><PixelRobot size={28} /> Issued via CampusOS · {formatDate(c.issuedAt)}</div>
        </div>
      </article>
    </div>
  );
}
