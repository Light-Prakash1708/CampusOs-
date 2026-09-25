import { AppError } from '@/lib/api';

/**
 * Request metadata helpers shared by route handlers and services.
 *
 * Client IP: `x-forwarded-for` is attacker-controlled unless a trusted proxy
 * overwrites it. Render, Vercel, Railway and nginx set it; a bare Node server
 * does not. TRUST_PROXY (default true, because every supported host sits
 * behind a proxy) controls whether it is honoured. The LEFT-most entry is the
 * client as seen by the first proxy.
 */
export function clientIp(headers: Headers): string | null {
  const trust = (process.env.TRUST_PROXY ?? 'true') !== 'false';
  if (trust) {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) return (forwarded.split(',')[0] ?? '').trim() || null;
    const real = headers.get('x-real-ip');
    if (real) return real.trim();
  }
  return null;
}

export function userAgent(headers: Headers): string | null {
  const ua = headers.get('user-agent');
  return ua ? ua.slice(0, 400) : null;
}

export function requestId(headers: Headers): string | null {
  return headers.get('x-request-id');
}

/**
 * CSRF defence for cookie-authenticated mutations.
 *
 * Session cookies are SameSite=Lax, which already stops cross-site POSTs from
 * carrying them in modern browsers. As defence in depth, a state-changing
 * request that presents an Origin (all browsers do for POST/PUT/PATCH/DELETE)
 * must present OUR origin. Requests with no Origin header are non-browser
 * clients (cron, curl, mobile apps) and carry no ambient browser credentials.
 */
export function isCrossSiteMutation(
  method: string,
  origin: string | null,
  host: string | null,
  appUrl: string | undefined,
): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return false;
  if (!origin) return false;
  if (origin === 'null') return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const allowed = new Set<string>();
  if (host) allowed.add(host);
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).host);
    } catch {
      /* ignore malformed APP_URL here; env validation reports it */
    }
  }
  return !allowed.has(originHost);
}

/** IP + user agent for audit records and rate limiting. */
export function metaFrom(request: Request): { ipAddress: string | null; userAgent: string | null } {
  return { ipAddress: clientIp(request.headers), userAgent: userAgent(request.headers) };
}

/** A route's `[id]` segment as a UUID, or a 404 naming what wasn't found. */
export function idParam(value: string | undefined, what = 'That item'): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError(`${what} was not found.`, 404, 'NOT_FOUND');
  return value;
}
