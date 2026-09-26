import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Rasterises the PNG app icons from the generated SVGs (Apple touch icon and
 * PWA manifest icons need PNG). Dev-only; needs Playwright's Chromium:
 *   node scripts/brand/rasterise-icons.mjs
 * Set PLAYWRIGHT_CHROMIUM to use a specific Chromium binary.
 */
const repo = fileURLToPath(new globalThis.URL('../../', import.meta.url));
const jobs = [
  ['public/branding/campusos-maskable.svg', 180, 'src/app/apple-icon.png'],
  ['public/branding/campusos-app-icon.svg', 192, 'public/branding/icon-192.png'],
  ['public/branding/campusos-app-icon.svg', 512, 'public/branding/icon-512.png'],
  ['public/branding/campusos-maskable.svg', 512, 'public/branding/icon-maskable-512.png'],
];
const b = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
for (const [src, size, out] of jobs) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(repo + src, 'utf8');
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: repo + out, omitBackground: true });
  await p.close();
  console.log(out);
}
await b.close();
