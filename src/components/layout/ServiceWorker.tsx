'use client';

import * as React from 'react';

/** Registers the conservative service worker (static files + offline page only). */
export function ServiceWorker() {
  React.useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
