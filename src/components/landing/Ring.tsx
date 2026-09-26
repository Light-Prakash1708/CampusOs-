import * as React from 'react';
import { cn } from '@/lib/utils';
import s from './landing.module.css';

/**
 * Demo progress ring for the landing page. Inside a <Reveal> it draws itself
 * once; elsewhere it renders at its final value.
 */
export function LandingRing({
  value,
  size = 72,
  stroke = 8,
  color = '#22c55e',
  track = '#e7e0f7',
  animate = true,
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  animate?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const offset = len * (1 - value / 100);
  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden focusable="false">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          className={animate ? s.ring : s.ringStatic}
          style={{ '--len': len, '--offset': offset } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
