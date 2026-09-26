/** PWA manifest, served dynamically so tenant branding can be applied later. */
export function GET() {
  return Response.json({
    name: 'CampusOS',
    short_name: 'CampusOS',
    description: 'Your Campus. All in One.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FDF7E9',
    theme_color: '#1E1B4B',
    orientation: 'portrait-primary',
    icons: [
      { src: '/branding/campusos-app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/branding/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/branding/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/branding/campusos-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/branding/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
}
