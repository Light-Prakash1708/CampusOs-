import { NextResponse } from 'next/server';
import type { FileReadResult } from '@/services/storage';

/**
 * Serves a stored file as private, inert data: a short-lived redirect for
 * S3-compatible storage, or the bytes with no caching and a sandboxing CSP.
 * Same headers as /api/files.
 */
export function privateFileResponse(result: FileReadResult): NextResponse {
  if (result.kind === 'redirect') {
    return NextResponse.redirect(result.url, { status: 302, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  }
  const inline = result.mimeType.startsWith('image/') || result.mimeType === 'application/pdf';
  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      'content-type': result.mimeType,
      'content-length': String(result.bytes.length),
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(result.name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
