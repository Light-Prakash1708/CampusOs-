'use client';

import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Asks a signed-in user to review the current privacy notice (CAMPUSOS-006).
 * Deliberately non-blocking: notices, attendance and everything else keep
 * working whether or not it has been accepted yet.
 */
export function PrivacyNoticeBanner({ version }: { version: string }) {
  const [state, setState] = React.useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  if (state === 'done') return null;

  async function accept() {
    setState('saving');
    try {
      const res = await fetch('/api/privacy/notice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div role="region" aria-label="Privacy notice" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-surface px-4 py-3">
      <ShieldCheck size={18} className="shrink-0 text-brand" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-default">
        Please review how CampusOS handles your data.{' '}
        <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-brand underline-offset-2 hover:underline">
          Read the privacy notice
        </a>{' '}
        <span className="text-subtle">(version {version})</span>
        {state === 'error' ? <span className="ml-1 text-danger">Couldn’t save — try again.</span> : null}
      </p>
      <Button size="sm" variant="primary" onClick={accept} loading={state === 'saving'}>
        I’ve read it
      </Button>
    </div>
  );
}
