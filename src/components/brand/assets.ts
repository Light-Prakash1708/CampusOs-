import { markSvgDocument } from './mark';

/** Every generated static brand file, by repository path. */
export function brandAssets(): Record<string, string> {
  return {
    'src/app/icon.svg': markSvgDocument('small'),
    'public/branding/campusos-mark.svg': markSvgDocument('full'),
    'public/branding/campusos-mark-small.svg': markSvgDocument('small'),
    'public/branding/campusos-app-icon.svg': markSvgDocument('full', { tile: 'light' }),
    'public/branding/campusos-app-icon-dark.svg': markSvgDocument('full', { tile: 'dark' }),
    'public/branding/campusos-maskable.svg': markSvgDocument('full', { tile: 'light', maskable: true }),
  };
}
