import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { checkRateLimit, keyFor } from '@/services/rate-limit';
import { metaFrom } from '@/lib/http';

/**
 * CSP violation reports (CAMPUSOS-021). Logged as a compact line — directive
 * and blocked origin only, never the page's query string or any user data —
 * so report-only mode can prove a policy safe before it is enforced.
 */
export async function POST(request: Request) {
  const meta = metaFrom(request);
  const limit = await checkRateLimit(keyFor('csp-report', meta.ipAddress), { limit: 60, windowSec: 600 }).catch(() => ({ allowed: true }));
  if ('allowed' in limit && !limit.allowed) return new NextResponse(null, { status: 204 });
  const text = await request.text().catch(() => '');
  try {
    const body = JSON.parse(text.slice(0, 20_000)) as { 'csp-report'?: Record<string, unknown> };
    const r = body['csp-report'] ?? {};
    const strip = (v: unknown) => (typeof v === 'string' ? v.split('?')[0]!.slice(0, 200) : null);
    logger.warn('csp.violation', {
      directive: strip(r['violated-directive'] ?? r['effective-directive']),
      blocked: strip(r['blocked-uri']),
      page: strip(r['document-uri'])?.replace(/^https?:\/\/[^/]+/, ''),
      source: strip(r['source-file']),
    });
  } catch {
    /* ignore malformed reports */
  }
  return new NextResponse(null, { status: 204 });
}
