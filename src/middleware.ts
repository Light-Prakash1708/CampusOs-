import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { isCrossSiteMutation } from '@/lib/http';

/**
 * EDGE MIDDLEWARE — first line of defence only.
 *
 * This runs on the Edge runtime and therefore CANNOT reach PostgreSQL. It does
 * a cheap JWT signature + expiry check so that unauthenticated traffic never
 * reaches a server component, and it stamps a request id for correlation.
 *
 * It is deliberately NOT the authorization boundary: session revocation, role
 * checks and tenant scoping are re-verified against the database inside
 * `getCurrentUser()` on every request. A valid-but-revoked token gets past
 * middleware and is rejected immediately afterwards.
 */

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/privacy',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/invite',
  '/forbidden',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  // Authenticates itself (CRON_SECRET or admin session); the scheduler has no cookie.
  '/api/jobs/run',
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-icon.png',
  '/api/client-errors',
  '/api/csp-report',
];

const PUBLIC_PREFIXES = ['/_next', '/favicon', '/icons', '/images', '/illustrations', '/branding/', '/verify/', '/api/auth/', '/api/public/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Nonce-based script CSP (CAMPUSOS-021). Next.js reads the nonce from the
 * request's CSP header and applies it to its own scripts; the root layout
 * applies it to the theme bootstrap. Violations are reported to
 * /api/csp-report. Enforced unless CSP_ENFORCE=false (report-only). The static
 * baseline in next.config.mjs stays as a second layer.
 */
function scriptPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV !== 'production';
  return [
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'report-uri /api/csp-report',
  ].join('; ');
}

function withCsp(response: NextResponse, policy: string): NextResponse {
  // Enforced by default (verified report-free across the portals); CSP_ENFORCE=false
  // falls back to report-only if a deployment ever needs an escape hatch.
  response.headers.set(process.env.CSP_ENFORCE === 'false' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', policy);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();
  const nonce = btoa(crypto.randomUUID()).replace(/=+$/, '');
  const policy = scriptPolicy(nonce);

  const forward = new Headers(request.headers);
  forward.set('x-request-id', requestId);
  forward.set('x-nonce', nonce);
  // Next.js takes the nonce for its own <script> tags from this header.
  forward.set('content-security-policy', policy);

  // CSRF defence in depth (cookies are already SameSite=Lax): a browser
  // mutation must come from our own origin. See src/lib/http.ts.
  if (
    pathname.startsWith('/api/') &&
    isCrossSiteMutation(
      request.method,
      request.headers.get('origin'),
      request.headers.get('host'),
      process.env.APP_URL || process.env.RENDER_EXTERNAL_URL,
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'CROSS_SITE_REQUEST',
          message: 'This request came from another website and was blocked.',
          hint: 'Open CampusOS directly and try again.',
        },
      },
      { status: 403 },
    );
  }

  if (isPublic(pathname)) {
    return withCsp(NextResponse.next({ request: { headers: forward } }), policy);
  }

  const token = request.cookies.get('campusos_session')?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Fail closed: a missing secret must never mean "let everyone through".
    console.error('[campusos] AUTH_SECRET is not configured; refusing all requests.');
    return redirectToLogin(request);
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'campusos' });
  } catch {
    const response = redirectToLogin(request);
    response.cookies.delete('campusos_session');
    return response;
  }

  return withCsp(NextResponse.next({ request: { headers: forward } }), policy);
}

function redirectToLogin(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Your session has ended.',
          hint: 'Sign in again to continue.',
        },
      },
      { status: 401 },
    );
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons|images|illustrations|branding).*)'],
};
