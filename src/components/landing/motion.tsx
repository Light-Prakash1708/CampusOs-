'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import s from './landing.module.css';

/**
 * Fades its content in once when it scrolls into view. Without JavaScript the
 * content is simply visible (see the `scripting` media query in the CSS).
 */
export function Reveal({
  children,
  delay = 0,
  className,
  id,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  id?: string;
  as?: 'div' | 'li' | 'section' | 'article';
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return React.createElement(
    Tag,
    {
      ref,
      id,
      className: cn(s.reveal, className),
      'data-shown': shown ? '' : undefined,
      style: { '--delay': `${delay}ms` } as React.CSSProperties,
    },
    children,
  );
}

/**
 * Sets --px/--py (−1…1) from the pointer so children with depth classes drift
 * a few pixels. Only for fine pointers and when motion is welcome.
 */
export function Parallax({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;
    if (reduce || !fine) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 2 - 1;
        const y = ((e.clientY - r.top) / r.height) * 2 - 1;
        el.style.setProperty('--px', Math.max(-1, Math.min(1, x)).toFixed(3));
        el.style.setProperty('--py', Math.max(-1, Math.min(1, y)).toFixed(3));
      });
    };
    const onLeave = () => {
      el.style.setProperty('--px', '0');
      el.style.setProperty('--py', '0');
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
