import * as React from 'react';

/**
 * Small pixel-art pieces drawn as SVG rects, in the same crisp style as the
 * CampusOS mark. Deterministic (no randomness at render), so server and client
 * output match.
 */

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

type Rect = [x: number, y: number, w: number, h: number, fill: string, opacity?: number];

function buildSkyline(width: number, height: number, seed: number): Rect[] {
  const r = rng(seed);
  const out: Rect[] = [];
  const far = '#2a2361';
  const near = '#0d0a24';
  const lit = ['#fbbf24', '#fde68a', '#fdf7e9'];

  // Far row: soft silhouettes.
  for (let x = 0; x < width; ) {
    const w = 10 + Math.floor(r() * 18);
    const h = 18 + Math.floor(r() * 26);
    out.push([x, height - 10 - h, w, h, far]);
    x += w + Math.floor(r() * 3);
  }

  // Near row with lit windows, a clock tower and a domed hall.
  const tower = Math.floor(width * 0.34);
  const dome = Math.floor(width * 0.7);
  for (let x = 0; x < width; ) {
    const w = 14 + Math.floor(r() * 22);
    const h = 12 + Math.floor(r() * 22);
    const top = height - 8 - h;
    out.push([x, top, w, h, near]);
    for (let wy = top + 3; wy < height - 12; wy += 5) {
      for (let wx = x + 3; wx < x + w - 3; wx += 5) {
        if (r() < 0.33) out.push([wx, wy, 2, 2, lit[Math.floor(r() * lit.length)]!, 0.55 + r() * 0.4]);
      }
    }
    x += w + 1 + Math.floor(r() * 4);
  }

  // Clock tower.
  out.push([tower, height - 58, 16, 50, near], [tower + 3, height - 64, 10, 6, near], [tower + 6, height - 70, 4, 6, near]);
  out.push([tower + 7, height - 76, 1, 6, near], [tower + 8, height - 76, 4, 3, '#a78bfa']);
  out.push([tower + 4, height - 52, 8, 8, '#fdf7e9', 0.9], [tower + 7, height - 50, 1, 3, near], [tower + 7, height - 48, 3, 1, near]);
  for (let wy = height - 38; wy < height - 12; wy += 6) out.push([tower + 4, wy, 2, 3, '#fbbf24', 0.8], [tower + 10, wy, 2, 3, '#fbbf24', 0.6]);

  // Domed hall.
  out.push([dome, height - 30, 34, 22, near], [dome + 8, height - 38, 18, 8, near], [dome + 11, height - 42, 12, 4, near], [dome + 15, height - 46, 4, 4, near]);
  for (let wx = dome + 4; wx < dome + 32; wx += 6) out.push([wx, height - 24, 3, 5, '#fbbf24', 0.75]);

  // Trees and lamps along the street.
  for (let x = 6; x < width; x += 26 + Math.floor(r() * 30)) {
    const s = 6 + Math.floor(r() * 4);
    out.push([x, height - 8 - s * 2, s * 2, s, '#14532d'], [x + 2, height - 8 - s * 2 - 3, s * 2 - 4, 3, '#15803d'], [x + s - 1, height - 8 - s, 2, s, '#3b2a1a']);
  }
  for (let x = 18; x < width; x += 64) out.push([x, height - 22, 1, 14, '#6b6394'], [x - 1, height - 24, 3, 2, '#fde68a']);

  // Ground.
  out.push([0, height - 8, width, 8, '#0b0920'], [0, height - 8, width, 1, '#3b3372']);
  return out;
}

export function PixelSkyline({
  className,
  width = 480,
  height = 96,
  seed = 7,
}: {
  className?: string;
  width?: number;
  height?: number;
  seed?: number;
}) {
  const rects = buildSkyline(width, height, seed);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
      focusable="false"
    >
      {rects.map(([x, y, w, h, fill, opacity], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={fill} opacity={opacity} />
      ))}
    </svg>
  );
}

/** Four-point pixel sparkle. */
export function Sparkle({ size = 14, color = '#fbbf24', className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 7 7" width={size} height={size} shapeRendering="crispEdges" className={className} aria-hidden focusable="false">
      <rect x="3" y="0" width="1" height="7" fill={color} />
      <rect x="0" y="3" width="7" height="1" fill={color} />
      <rect x="2" y="2" width="3" height="3" fill={color} />
    </svg>
  );
}

/** Hand-drawn curved arrow. */
export function DoodleArrow({ className, color = 'currentColor' }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 90 60" className={className} aria-hidden focusable="false" fill="none">
      <path d="M4 8 C 26 4, 52 12, 62 34 C 66 42, 68 46, 70 52" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M60 45 L71 54 L77 41" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
