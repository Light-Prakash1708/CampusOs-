import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/api';
import { readFileFor } from '@/services/storage';

export const runtime = 'nodejs';

/** Authorised read: streams (local storage) or redirects to a 5-minute signed URL. */
export const GET = withAuth(null, async (_request, { user, params }) => {
  const id = z.string().uuid().parse(params.id);
  const result = await readFileFor(user, id);
  if (result.kind === 'redirect') {
    return NextResponse.redirect(result.url, { status: 302, headers: { 'cache-control': 'no-store' } });
  }
  const inline = result.mimeType.startsWith('image/') || result.mimeType === 'application/pdf';
  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      'content-type': result.mimeType,
      'content-length': String(result.bytes.length),
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(result.name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      // Stored files are data, never active content.
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
