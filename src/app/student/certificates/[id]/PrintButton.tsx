'use client';
import { Printer } from 'lucide-react';
export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-surface px-3 text-[13px] font-bold text-default shadow-pop">
      <Printer size={15} aria-hidden /> Print / Save as PDF
    </button>
  );
}
