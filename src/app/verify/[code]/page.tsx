import { BadgeCheck, XCircle } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { AuthShell } from '@/components/auth/AuthShell';
import { verifyCertificate } from '@/services/events';

export const metadata = { title: 'Verify certificate · CampusOS', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Public, unauthenticated verification. Shows the minimum needed to verify. */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = await verifyCertificate(decodeURIComponent(code));
  const valid = c && !c.revokedAt;
  return (
    <AuthShell title="Certificate verification" subtitle={`Verification ID ${decodeURIComponent(code).toUpperCase()}`}>
      {valid ? (
        <div className="rounded-2xl border-[1.5px] border-ink bg-mint p-5 shadow-pop" role="status">
          <p className="flex items-center gap-2 font-display text-[18px] font-extrabold text-mint-ink"><BadgeCheck size={20} aria-hidden /> Valid certificate</p>
          <dl className="mt-3 space-y-1.5 text-[14px] text-default">
            <div><dt className="inline font-bold">Awarded to: </dt><dd className="inline">{c.recipientName}</dd></div>
            <div><dt className="inline font-bold">Event: </dt><dd className="inline">{c.eventTitle}</dd></div>
            <div><dt className="inline font-bold">Organiser: </dt><dd className="inline">{c.organizerName ?? c.institutionName}</dd></div>
            <div><dt className="inline font-bold">Institution: </dt><dd className="inline">{c.institutionName}</dd></div>
            <div><dt className="inline font-bold">Event date: </dt><dd className="inline">{formatDate(c.eventDate)}</dd></div>
            <div><dt className="inline font-bold">Issued: </dt><dd className="inline">{formatDate(c.issuedAt)}</dd></div>
          </dl>
        </div>
      ) : (
        <div className="rounded-2xl border-[1.5px] border-ink bg-coral p-5 shadow-pop" role="alert">
          <p className="flex items-center gap-2 font-display text-[18px] font-extrabold text-coral-ink"><XCircle size={20} aria-hidden /> {c?.revokedAt ? 'This certificate was revoked' : 'No certificate matches this ID'}</p>
          <p className="mt-2 text-[13.5px] text-default">Check the ID for typos (it looks like ABCDE-FGH23). If it still fails, contact the organiser.</p>
        </div>
      )}
    </AuthShell>
  );
}
