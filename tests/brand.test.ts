import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { MARK_GRIDS, markRects, markSize, detailFor } from '@/components/brand/mark';
import { brandAssets } from '@/components/brand/assets';

describe('brand mark', () => {
  it('grids are rectangular and use only palette colours', () => {
    for (const detail of ['full', 'small'] as const) {
      const rows = MARK_GRIDS[detail];
      expect(new Set(rows.map((r) => r.length)).size).toBe(1);
      expect(() => markRects(detail)).not.toThrow();
    }
    expect(markSize('full')).toEqual({ width: 32, height: 24 });
    expect(markSize('small')).toEqual({ width: 16, height: 15 });
  });

  it('switches to the simplified mark below 26px', () => {
    expect(detailFor(16)).toBe('small');
    expect(detailFor(24)).toBe('small');
    expect(detailFor(26)).toBe('full');
    expect(detailFor(48)).toBe('full');
  });

  it('committed SVG assets match the generator (npm run brand:assets)', () => {
    for (const [file, svg] of Object.entries(brandAssets())) {
      expect(readFileSync(file, 'utf8'), file).toBe(svg);
    }
  });

  it('assets are pure vector: no text, raster data or external references', () => {
    for (const svg of Object.values(brandAssets())) {
      expect(svg).not.toMatch(/<text|<image|data:|base64|href=/);
      expect(svg.match(/https?:\/\/[^"]+/g) ?? []).toEqual(['http://www.w3.org/2000/svg']);
    }
  });

  it('manifest and Apple icons exist', () => {
    for (const f of ['public/branding/icon-192.png', 'public/branding/icon-512.png', 'public/branding/icon-maskable-512.png', 'src/app/apple-icon.png']) {
      expect(existsSync(f), f).toBe(true);
    }
  });
});
