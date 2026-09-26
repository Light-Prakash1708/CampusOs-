import Link from 'next/link';
import { AlertTriangle, Info } from 'lucide-react';
import { CampusCard, CampusSectionHeader } from '@/components/campus';
import { cn } from '@/lib/utils';
import type { AttentionSignal } from '@/services/attention-signals';
import { SignalViewBeacon } from './SignalViewBeacon';

/**
 * "Needs your attention" — transparent signals for the student themselves.
 * Each shows what happened, why it matters, where the data came from and
 * what to do. No score, no label, no prediction.
 */
export function AttentionCard({ signals }: { signals: AttentionSignal[] }) {
  if (signals.length === 0) return null;
  return (
    <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="attention-h">
      <CampusSectionHeader id="attention-h" title="Needs your attention" />
      <SignalViewBeacon kinds={[...new Set(signals.map((s) => s.kind))]} />
      <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {signals.slice(0, 4).map((s, i) => (
          <li
            key={`${s.kind}-${i}`}
            className={cn(
              'flex h-full flex-col gap-1.5 rounded-xl border-[1.5px] p-3',
              s.severity === 'critical' ? 'border-coral-ink bg-coral/40' : 'border-[hsl(var(--border-strong))] bg-surface',
            )}
          >
            <p className="flex items-start gap-2 text-[13.5px] font-extrabold leading-snug text-default">
              {s.severity === 'critical' ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-coral-ink" aria-hidden /> : <Info size={15} className="mt-0.5 shrink-0 text-subtle" aria-hidden />}
              <span>{s.what}</span>
            </p>
            <p className="text-[12.5px] leading-snug text-muted">{s.why}</p>
            <p className="text-[11.5px] text-subtle">Source: {s.source}</p>
            <Link href={s.action.href} className="mt-auto inline-flex min-h-[40px] items-center text-[13px] font-bold text-brand hover:underline">
              {s.action.label} →
            </Link>
          </li>
        ))}
      </ul>
    </CampusCard>
  );
}
