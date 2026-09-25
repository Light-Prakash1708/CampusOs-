import * as React from 'react';

/**
 * CAMPUSOS PIXEL SPRITES
 * ---------------------------------------------------------------------------
 * The small characters that give CampusOS its identity: the student avatar,
 * the AI mascot, streak flames and achievement badges. Drawn as data (a grid
 * of palette keys) and rendered to crisp SVG, so they scale to any size,
 * weigh nothing, work offline and respect the theme.
 *
 * Grids: one string per row, one character per pixel, '.' = transparent.
 * Rows of a sprite must all have the same length (a unit test checks).
 */

type Palette = Record<string, string>;

interface SpriteDef {
  rows: string[];
  palette: Palette;
}

const INK = '#1F1B3D';

const AVATAR_PALETTES = {
  // Hair, skin, skin-shade, shirt, shirt-shade — varied so a class isn't all one face.
  indigo: { H: '#2A1B12', s: '#E9B48C', S: '#C98A62', B: '#3E6FD0', b: '#2C54A8' },
  mint: { H: '#1E1410', s: '#D9A07A', S: '#B67F59', B: '#2F9E74', b: '#237A59' },
  coral: { H: '#3B2416', s: '#F0C19C', S: '#D29B72', B: '#E0634F', b: '#B74B3A' },
  sun: { H: '#130F0D', s: '#C98E66', S: '#A8714D', B: '#E3A21A', b: '#B27E0F' },
  lavender: { H: '#4A2E1C', s: '#EDBB95', S: '#CC946C', B: '#7B6CE0', b: '#5B4DC0' },
} as const;
export type AvatarTone = keyof typeof AVATAR_PALETTES;

const SPRITES: Record<string, SpriteDef> = {
  // 16 × 16 student bust: messy hair, backpack straps.
  student: {
    rows: [
      '.....kkkkkk.....',
      '...kkHHHHHHkk...',
      '..kHHHHHHHHHHk..',
      '.kHHHHHHHHHHHHk.',
      '.kHHHHHHHHHHHHk.',
      '.kHHsHHHHHHsHHk.',
      '.kHssssssssssHk.',
      '.kHssksssskssHk.',
      '.kssssssssssssk.',
      '..ksssSSSSsssk..',
      '...kssssssssk...',
      '....kkSSSSkk....',
      '..kkBBkBBkBBkk..',
      '.kBBBkBBBBkBBBk.',
      '.kBbBkBBBBkBbBk.',
      '.kkkkkkkkkkkkkk.',
    ],
    palette: { k: INK, ...AVATAR_PALETTES.indigo },
  },
  // 16 × 19 CampusOS AI mascot.
  robot: {
    rows: [
      '.......kk.......',
      '......kYYk......',
      '.......kk.......',
      '...kkkkkkkkkk...',
      '..kLLLLLLLLLLk..',
      '.kLPPPPPPPPPPLk.',
      'kkPkkkkkkkkkkPkk',
      'kPPkVVVVVVVVkPPk',
      'kPPkVEEVVEEVkPPk',
      'kPPkVVVVVVVVkPPk',
      'kkPkVVEEEEVVkPkk',
      '.kPkkkkkkkkkkPk.',
      '..kPPPPPPPPPPk..',
      '...kkkkkkkkkk...',
      '..kkCCCCCCCCkk..',
      '.kPkCCCYYCCCkPk.',
      '.kPkCCCCCCCCkPk.',
      '..kkCCCCCCCCkk..',
      '...kOOk..kOOk...',
    ],
    palette: {
      k: INK, Y: '#FFC93C', L: '#9D97F2', P: '#6259D6', V: '#15122B', E: '#58B6FF', C: '#F4E7CD', O: '#8A4B2A',
    },
  },
  // 10 × 12 streak flame.
  flame: {
    rows: [
      '....o.....',
      '....oo....',
      '...ooo.o..',
      '..oooooo..',
      '.ooOooooo.',
      '.oOOOoooo.',
      'ooOYYOOooo',
      'oOYYYYOOoo',
      'oOYWWYYOo.',
      'oOYWWYYOo.',
      '.oOYYYOo..',
      '..oooooo..',
    ],
    palette: { o: '#E8502D', O: '#FF8A2A', Y: '#FFC93C', W: '#FFF4C2' },
  },
};

/** 14 × 14 octagonal badge base; `F` = fill, `L` = highlight. */
const BADGE_BASE = [
  '....kkkkkk....',
  '...kFFFFFFk...',
  '..kFLLLLLLFk..',
  '.kFLFFFFFFLFk.',
  'kFLFFFFFFFFLFk',
  'kFLFFFFFFFFLFk',
  'kFLFFFFFFFFLFk',
  'kFLFFFFFFFFLFk',
  'kFLFFFFFFFFLFk',
  'kFLFFFFFFFFLFk',
  '.kFLFFFFFFLFk.',
  '..kFLLLLLLFk..',
  '...kFFFFFFk...',
  '....kkkkkk....',
];

/** 14 × 14 icon overlays for badges ('.' keeps the base pixel). */
const BADGE_ICONS: Record<string, string[]> = {
  star: [
    '..............', '..............', '..............', '......yy......',
    '.....yyyy.....', '...yyyyyyyy...', '....yyyyyy....', '.....yyyy.....',
    '....yy..yy....', '..............', '..............', '..............',
    '..............', '..............',
  ],
  book: [
    '..............', '..............', '..............', '..............',
    '...wwww.wwww..', '...wkkw.wkkw..', '...wwww.wwww..', '...wkkw.wkkw..',
    '...wwwwkwwww..', '....wwwkwww...', '..............', '..............',
    '..............', '..............',
  ],
  crown: [
    '..............', '..............', '..............', '..............',
    '...y..yy..y...', '...yy.yy.yy...', '...yyyyyyyy...', '...yyyyyyyy...',
    '...yykyykyy...', '...yyyyyyyy...', '..............', '..............',
    '..............', '..............',
  ],
  flame: [
    '..............', '..............', '..............', '......o.......',
    '......oo......', '.....oooo.....', '....ooyyoo....', '....oyyyyo....',
    '....oywwyo....', '.....oyyo.....', '..............', '..............',
    '..............', '..............',
  ],
  check: [
    '..............', '..............', '..............', '..............',
    '..........w...', '.........ww...', '...w....ww....', '...ww..ww.....',
    '....wwww......', '.....ww.......', '..............', '..............',
    '..............', '..............',
  ],
  flag: [
    '..............', '..............', '..............', '....kyyyy.....',
    '....kyyyyyy...', '....kyyyy.....', '....k.........', '....k.........',
    '....k.........', '...kkk........', '..............', '..............',
    '..............', '..............',
  ],
};

export const BADGE_COLORS = {
  indigo: { F: '#5B52DB', L: '#8E87F0' },
  green: { F: '#2E9E5B', L: '#5CCB86' },
  gold: { F: '#F0A91C', L: '#FFD166' },
  coral: { F: '#E0563F', L: '#FF8B74' },
  sky: { F: '#2F7FD6', L: '#6FB2F5' },
} as const;
export type BadgeColor = keyof typeof BADGE_COLORS;
export type BadgeIcon = keyof typeof BADGE_ICONS;

function toRects(rows: string[], palette: Palette) {
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x]!;
      if (key === '.' || !palette[key]) {
        x++;
        continue;
      }
      let w = 1;
      while (row[x + w] === key) w++;
      rects.push({ x, y, w, fill: palette[key]! });
      x += w;
    }
  });
  return rects;
}

function Svg({
  rows,
  palette,
  size,
  label,
  className,
}: {
  rows: string[];
  palette: Palette;
  size: number;
  label?: string;
  className?: string;
}) {
  const w = rows[0]!.length;
  const h = rows.length;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={(size * w) / Math.max(w, h)}
      height={(size * h) / Math.max(w, h)}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      {toRects(rows, palette).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

/** Pixel student avatar. `tone` varies hair/skin/shirt; pick it from a stable hash of the user id. */
export function PixelAvatar({ tone = 'indigo', size = 40, label, className }: { tone?: AvatarTone; size?: number; label?: string; className?: string }) {
  const def = SPRITES.student!;
  return <Svg rows={def.rows} palette={{ k: INK, ...AVATAR_PALETTES[tone] }} size={size} label={label} className={className} />;
}

export function avatarToneFor(id: string): AvatarTone {
  const tones = Object.keys(AVATAR_PALETTES) as AvatarTone[];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return tones[h % tones.length]!;
}

/** The CampusOS AI mascot. */
export function PixelRobot({ size = 48, label, className }: { size?: number; label?: string; className?: string }) {
  const def = SPRITES.robot!;
  return <Svg rows={def.rows} palette={def.palette} size={size} label={label} className={className} />;
}

export function PixelFlame({ size = 24, label, className, dim = false }: { size?: number; label?: string; className?: string; dim?: boolean }) {
  const def = SPRITES.flame!;
  const palette = dim ? { o: '#CFC6B4', O: '#DDD5C4', Y: '#EAE3D5', W: '#F5F0E6' } : def.palette;
  return <Svg rows={def.rows} palette={palette} size={size} label={label} className={className} />;
}

/** Achievement badge: octagon in a colour with a pixel icon. `locked` renders greyscale. */
export function PixelBadge({
  icon,
  color = 'indigo',
  size = 40,
  locked = false,
  label,
  className,
}: {
  icon: BadgeIcon;
  color?: BadgeColor;
  size?: number;
  locked?: boolean;
  label?: string;
  className?: string;
}) {
  const overlay = BADGE_ICONS[icon]!;
  const rows = BADGE_BASE.map((row, y) =>
    row
      .split('')
      .map((c, x) => (overlay[y]![x] !== '.' ? overlay[y]![x] : c))
      .join(''),
  );
  const base = locked ? { F: '#B9B2A4', L: '#D6D0C4' } : BADGE_COLORS[color];
  const palette: Palette = {
    k: INK,
    ...base,
    y: locked ? '#EDE8DE' : '#FFD84A',
    w: '#FFFFFF',
    o: locked ? '#EDE8DE' : '#FF7A2F',
  };
  return <Svg rows={rows} palette={palette} size={size} label={label} className={className} />;
}

/** Exposed for the sprite integrity test. */
export const __SPRITE_DATA = { SPRITES, BADGE_BASE, BADGE_ICONS };
