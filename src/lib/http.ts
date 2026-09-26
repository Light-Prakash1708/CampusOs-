/**
 * Request metadata helpers shared by route handlers and services.
 *
 * Client IP: `x-forwarded-for` is a list the CLIENT can pre-fill; each proxy
 * APPENDS the address it received the request from. So only the entries added
 * by our own proxies can be trusted, counted from the RIGHT. TRUSTED_PROXY_HOPS
 * (default 1: Render / Railway / a single nginx) says how many proxies sit in
 * front of the app — use 2 behind Cloudflare → Render. TRUST_PROXY=false
 * ignores the header entirely (a bare Node server).
 */
export function clientIp(headers: Headers): string | null {
  const trust = (process.env.TRUST_PROXY ?? 'true') !== 'false';
  if (!trust) return null;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);
    const list = forwarded.split(',').map((x) => x.trim()).filter(Boolean);
    return list.length ? (list[Math.max(0, list.length - hops)] ?? null) : null;
  }
  const real = headers.get('x-real-ip');
  return real ? real.trim() : null;
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
