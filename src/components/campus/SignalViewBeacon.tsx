'use client';

import * as React from 'react';
import { sendProductEvent } from './TrackedLink';

/** Records, once per page view, which kinds of attention signal were shown. */
export function SignalViewBeacon({ kinds }: { kinds: string[] }) {
  const key = kinds.join(',');
  React.useEffect(() => {
    for (const kind of key.split(',').filter(Boolean)) sendProductEvent('attention_signal_viewed', { kind });
  }, [key]);
  return null;
}
