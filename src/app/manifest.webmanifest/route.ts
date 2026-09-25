/** PWA manifest, served dynamically so tenant branding can be applied later. */
export function GET() {
  return Response.json({
    name: 'CampusOS',
    short_name: 'CampusOS',
    description: 'The academic operating system for your institution.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4F46E5',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  });
}
