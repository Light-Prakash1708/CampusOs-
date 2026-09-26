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
  '/api/client-errors',
];

const PUBLIC_PREFIXES = ['/_next', '/favicon', '/icons', '/images', '/illustrations', '/verify/', '/api/auth/', '/api/public/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();

  const forward = new Headers(request.headers);
  forward.set('x-request-id', requestId);

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
    return NextResponse.next({ request: { headers: forward } });
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

  return NextResponse.next({ request: { headers: forward } });
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|icons|images|illustrations).*)'],
};
