import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

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
  '/forgot-password',
  '/forbidden',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  '/manifest.webmanifest',
];

const PUBLIC_PREFIXES = ['/_next', '/favicon', '/icons', '/images', '/api/auth/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();

  const forward = new Headers(request.headers);
  forward.set('x-request-id', requestId);

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|images).*)'],
};
