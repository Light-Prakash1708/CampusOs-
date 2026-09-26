'use client';

import * as React from 'react';
import { GraduationCap, Presentation, ShieldCheck } from 'lucide-react';
import { ErrorBox, useApi } from './useApi';

const ROLES = [
  { role: 'student', label: 'Student', icon: GraduationCap },
  { role: 'faculty', label: 'Faculty', icon: Presentation },
  { role: 'admin', label: 'Principal / admin', icon: ShieldCheck },
] as const;

/**
 * "Try the demo" — signs the visitor into a shared account in the isolated
 * demo college (fictional data, reset nightly, nothing leaves CampusOS).
 */
export function TryDemo() {
  const api = useApi<{ redirectTo: string }>();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function go(role: string) {
    setBusy(role);
    const data = await api.call('/api/auth/demo', { role });
    if (data) window.location.assign(data.redirectTo);
    else setBusy(null);
  }

  return (
    <section aria-labelledby="demo-h" className="mt-6 rounded-xl border border-[hsl(var(--border))] bg-surface p-4">
      <h2 id="demo-h" className="text-[14px] font-bold text-default">Try the demo</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">A fictional college with sample data. Nothing you do there reaches real people, and it resets every night.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        {ROLES.map(({ role, label, icon: Icon }) => (
          <button
            key={role}
            type="button"
            onClick={() => go(role)}
            disabled={!!busy}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[hsl(var(--border-strong))] bg-surface px-3 text-[13px] font-semibold text-default hover:bg-surface-sunken disabled:opacity-60"
          >
            <Icon size={15} aria-hidden /> {busy === role ? 'Opening…' : label}
          </button>
        ))}
      </div>
      <div className="mt-2"><ErrorBox error={api.error} /></div>
    </section>
  );
}
