'use client';

import * as React from 'react';
import Link from 'next/link';

/**
 * A link that counts one "open" of a tool for the signed-in student, then
 * navigates. Counting happens on click (not render or prefetch), is fire-and-
 * forget with `keepalive` so it survives the navigation, and never blocks or
 * breaks the link if it fails.
 */
export function ToolOpenLink({
  tool,
  href,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  tool: string;
  href: string;
  className?: string;
  children: React.ReactNode;
  'aria-label'?: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      prefetch={false}
      onClick={() => {
        try {
          void fetch('/api/tools/usage', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tool }),
            keepalive: true,
          }).catch(() => undefined);
        } catch {
          /* counting is best-effort */
        }
      }}
    >
      {children}
    </Link>
  );
}
