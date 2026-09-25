import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { startSession } from '@/lib/auth/session';
import { authenticate } from '@/services/auth/accounts';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(200),
  /** Optional when a deployment hosts several institutions on one domain. */
  institutionSlug: z.string().trim().max(80).optional(),
});

export const POST = publicRoute(async (request) => {
  const body = await request.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check your email and password.',
          details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      },
      { status: 422 },
    );
  }

  const meta = metaFrom(request);
  const result = await authenticate({ ...parsed.data, meta });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: { code: result.code, message: result.message, hint: result.hint } },
      { status: result.status },
    );
  }

  await startSession(result.user, meta);
  return NextResponse.json({
    ok: true,
    data: { redirectTo: result.redirectTo, mustChangePassword: result.mustChangePassword },
  });
});
