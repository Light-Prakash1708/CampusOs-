import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  // The tsconfig `paths` alias is declared explicitly here too, so module
  // resolution behaves identically under webpack and under tsc.
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },

  // "Readdressal" was a misspelling of "Redressal". Old links (bookmarks,
  // notification action URLs stored before the rename) keep working. 308
  // preserves the method, so an old POST to the messages API still lands.
  async redirects() {
    return ['student', 'faculty', 'admin', 'api/student'].map((portal) => ({
      source: `/${portal}/readdressal/:path*`,
      destination: `/${portal}/redressal/:path*`,
      permanent: true,
    })).concat(['student', 'faculty', 'admin'].map((portal) => ({
      source: `/${portal}/readdressal`,
      destination: `/${portal}/redressal`,
      permanent: true,
    }))).concat([
      // Familiar name for the Attendance Planner.
      { source: '/tools/bunk-calculator', destination: '/tools/attendance-planner', permanent: true },
    ]);
  },

  async headers() {
    const security = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // camera=(self): the organiser check-in desk scans QR passes with the camera.
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      // A baseline CSP that cannot break Next.js hydration: it forbids framing,
      // plugins, <base> hijacking and off-site form posts. A nonce-based
      // script-src is tracked for Phase 9.
      {
        key: 'Content-Security-Policy',
        value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
      },
    ];
    if (process.env.NODE_ENV === 'production') {
      security.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' });
    }
    return [
      { source: '/:path*', headers: security },
      // Auth and account pages must never be cached by shared caches.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default nextConfig;
