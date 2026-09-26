'use client';

import * as React from 'react';

/** Fire-and-forget product event from the browser. Never blocks navigation. */
export function sendProductEvent(event: 'opportunity_opened' | 'attention_signal_viewed', props?: Record<string, string | number | boolean>) {
  try {
    void fetch('/api/product-events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, props }),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => undefined);
  } catch {
    /* analytics must never break the page */
  }
}

/** An external link that records `opportunity_opened` when followed. */
export function TrackedLink({ event, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { event: 'opportunity_opened' }) {
  return (
    <a {...rest} onClick={(e) => { sendProductEvent(event); rest.onClick?.(e); }}>
      {children}
    </a>
  );
}
