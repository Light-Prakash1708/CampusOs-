/**
 * CAMPUSOS BRAND MARK
 * ---------------------------------------------------------------------------
 * The campus building — clock tower with a flag, two wings, trees, the sun
 * and a cloud — drawn as pixel data, in the same format as the sprites in
 * components/campus/pixel.tsx (one string per row, one character per pixel,
 * '.' = transparent).
 *
 *   full   32 × 24, for 26px and up (nav, sign-in, app icons)
 *   small  16 × 15, simplified for 16–24px (favicon, dense UI)
 *
 * This file is the single source for the React mark (CampusLogo) and the
 * static SVGs in public/branding and src/app/icon.svg
 * (`npm run brand:assets` regenerates them; a test keeps them in sync).
 * Colours are the CampusOS brand palette and do not follow tenant branding.
 */

export const BRAND_COLORS = {
  indigo: '#1E1B4B',
  lavender: '#A78BFA',
  green: '#22C55E',
  blue: '#60A5FA',
  yellow: '#FBBF24',
  coral: '#FB7185',
  cream: '#FDF7E9',
  dark: '#0F172A',
} as const;

const MARK_PALETTE: Record<string, string> = {
  K: BRAND_COLORS.indigo, // outline
  D: '#312E81', // tower windows
  C: BRAND_COLORS.coral, // building
  c: '#E0556E', // roof shade
  W: '#FFFBF0', // clock face, lit windows, cloud
  y: '#FDE68A', // window glow
  Y: BRAND_COLORS.yellow, // sun, sparkle
  B: BRAND_COLORS.blue, // cloud shadow
  P: BRAND_COLORS.lavender, // flag, sparkle
  p: '#7C3AED', // flag fold
  G: BRAND_COLORS.green, // trees, lawn
  g: '#15803D', // tree and lawn shade
  L: '#86EFAC', // leaf highlight
  T: '#92400E', // trunks
};

export const MARK_GRIDS = {
  full: [
    '...............KPPP.............',
    '...............KPPp.............',
    '.........Y.....KP...............',
    '........YYY....K.............P..',
    '.........Y.....KK.....YY....PPP.',
    '..............KccK.YYYYYYYY..P..',
    '.............KccccKYYYYYYYYY....',
    '....WWW.....KKKKKKKKYYYYYYYYY...',
    '..WWWWWWW...KCCCCCCKYYYYYYYWWW..',
    '.WWWWWWWW...KCCWWCCKYYYYYWWWWWWW',
    '..BBBBBBB...KCWKWWCKYYYYYWWWWWWW',
    '............KCWKKWCKYYYYYBBBBBBB',
    '.GGG........KCCWWCCKYYYYYYYYGGG.',
    'GGGGG.......KCCCCCCKYYYYYYYGGGGG',
    'GLGggKKKKKKKKCDCCDCKKKKKKKKGLGgg',
    'GGGggcccccccKCDCCDCKcccccccGGGgg',
    'GGGggCCCCCCCKCCCCCCKCCCCCCCGGGgg',
    'GGGggCWWCWWCKCCDDCCKCWWCWWCGGGgg',
    '.GggKCyWCyWCKCCKKCCKCyWCyWCKGgg.',
    '..T.KCCCCCCCKCCKKCCKCCCCCCCK.T..',
    '..T.KCCCCCCCKCCKKCCKCCCCCCCK.T..',
    '..T.KKKKKKKKKKKKKKKKKKKKKKKK.T..',
    'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
    '..gggggggggggggggggggggggggggg..',
  ],
  small: [
    '.......KPP......',
    '.......KPP......',
    '.......K..YYY...',
    '......KKKKYYYY..',
    '.....KCCCCKYYYY.',
    '.....KCWWCKYYYY.',
    '.....KCWKCKYYYY.',
    '.KKKKKCCCCKKKKK.',
    '.KCCCKCCCCKCCCK.',
    'GGWCWKCKKCKWCWGG',
    'GgCCCKCKKCKCCCGg',
    'GgCCCKCKKCKCCCGg',
    '.KKKKKKKKKKKKKK.',
    'GGGGGGGGGGGGGGGG',
    '.gggggggggggggg.',
  ],
} as const;

export type MarkDetail = keyof typeof MARK_GRIDS;

export interface MarkRect {
  x: number;
  y: number;
  w: number;
  fill: string;
}

/** Horizontal runs of one colour → one rect each (keeps the SVG small). */
export function markRects(detail: MarkDetail): MarkRect[] {
  const out: MarkRect[] = [];
  MARK_GRIDS[detail].forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      if (key === '.') {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === key) end++;
      const fill = MARK_PALETTE[key];
      if (!fill) throw new Error(`Unknown mark colour "${key}"`);
      out.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  return out;
}

export function markSize(detail: MarkDetail): { width: number; height: number } {
  const rows = MARK_GRIDS[detail];
  return { width: rows[0].length, height: rows.length };
}

/** The smallest rendered height (px) at which the full mark stays legible. */
export const FULL_MARK_MIN_PX = 26;

export function detailFor(heightPx: number): MarkDetail {
  return heightPx < FULL_MARK_MIN_PX ? 'small' : 'full';
}

function rectsSvg(detail: MarkDetail, dx = 0, dy = 0): string {
  return markRects(detail)
    .map((r) => `<rect x="${r.x + dx}" y="${r.y + dy}" width="${r.w}" height="1" fill="${r.fill}"/>`)
    .join('');
}

/**
 * Static SVG documents for favicons, app icons and the PWA manifest.
 * `tile` draws the rounded app-icon background; `maskable` fills the whole
 * square and keeps the mark inside the 80% safe zone.
 */
export function markSvgDocument(
  detail: MarkDetail,
  opts: { tile?: 'light' | 'dark'; maskable?: boolean } = {},
): string {
  const { width, height } = markSize(detail);
  const title = '<title>CampusOS</title>';
  if (!opts.tile) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" role="img" aria-label="CampusOS">${title}${rectsSvg(detail)}</svg>\n`;
  }
  // Square canvas with padding around the mark.
  const pad = opts.maskable ? 9 : 4;
  const side = width + pad * 2;
  const dy = Math.floor((side - height) / 2);
  const bg = opts.tile === 'dark' ? BRAND_COLORS.indigo : BRAND_COLORS.cream;
  const back = opts.maskable
    ? `<rect width="${side}" height="${side}" fill="${bg}"/>`
    : `<rect width="${side}" height="${side}" rx="${side * 0.22}" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" role="img" aria-label="CampusOS">${title}${back}<g shape-rendering="crispEdges">${rectsSvg(detail, pad, dy)}</g></svg>\n`;
}
