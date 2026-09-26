/**
 * Regenerates the static brand SVGs from src/components/brand/mark.ts.
 *
 *   npm run brand:assets
 *
 * Outputs (all vector, no embedded text or raster data):
 *   src/app/icon.svg                         favicon (simplified mark)
 *   public/branding/campusos-mark.svg        full mark, transparent
 *   public/branding/campusos-mark-small.svg  simplified mark, transparent
 *   public/branding/campusos-app-icon.svg    app icon, cream tile
 *   public/branding/campusos-app-icon-dark.svg  app icon, indigo tile
 *   public/branding/campusos-maskable.svg    PWA maskable icon (full bleed)
 *
 * The PNG app icons (apple-icon.png, icon-192/512.png) are rasterised from
 * the app-icon SVGs; see docs/BRAND.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { brandAssets } from '../../src/components/brand/assets';

const root = path.resolve(__dirname, '../..');
for (const [file, svg] of Object.entries(brandAssets())) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, svg);
  console.log(`wrote ${file}`);
}
