import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, institutions } from '@/lib/db/schema';
import { verifyPassword, dummyPasswordWork } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { portalForRole } from '@/lib/auth/permissions';
import { recordAudit } from '@/services/audit';
import { fail } from '@/lib/api';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
  /** Optional when a deployment hosts several institutions on one domain. */
  institutionSlug: z.string().trim().optional(),
});

/** Progressive lockout after repeated failures. */
const MAX_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Please check your email and password.',
            details: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        { status: 422 },
      );
    }

    const { email, password, institutionSlug } = parsed.data;

    const rows = await db
      .select({
        id: users.id,
        institutionId: users.institutionId,
        email: users.email,
        passwordHash: users.passwordHash,
        role: users.role,
        status: users.status,
        sessionEpoch: users.sessionEpoch,
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
        mustChangePassword: users.mustChangePassword,
        institutionSlug: institutions.slug,
        institutionActive: institutions.isActive,
      })
      .from(users)
      .innerJoin(institutions, eq(institutions.id, users.institutionId))
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(5);

    const candidate = institutionSlug
      ? rows.find((r) => r.institutionSlug === institutionSlug)
      : rows[0];

    // Uniform failure response + comparable timing: never reveal whether an
    // account exists.
    if (!candidate || !candidate.passwordHash) {
      await dummyPasswordWork();
      return invalidCredentials();
    }

    if (candidate.lockedUntil && candidate.lockedUntil > new Date()) {
      const minutes = Math.ceil((candidate.lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: `Too many failed attempts. This account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`,
            hint: 'Wait for the lock to expire, or ask an administrator to reset your password.',
          },
        },
        { status: 423 },
      );
    }

    const valid = await verifyPassword(password, candidate.passwordHash);

    if (!valid) {
      const attempts = candidate.failedLoginAttempts + 1;
      const shouldLock = attempts >= MAX_ATTEMPTS;
      await db
        .update(users)
        .set({
          failedLoginAttempts: attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
        })
        .where(eq(users.id, candidate.id));

      await recordAudit(
        { userId: candidate.id, institutionId: candidate.institutionId, role: candidate.role },
        {
          action: 'USER_LOGIN_FAILED',
          entityType: 'user',
          entityId: candidate.id,
          reason: shouldLock ? 'Account locked after repeated failures' : 'Invalid password',
          ipAddress: clientIp(request),
          userAgent: request.headers.get('user-agent'),
        },
      );

      return invalidCredentials();
    }

    if (candidate.status !== 'ACTIVE') {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'ACCOUNT_INACTIVE',
            message: 'This account is not active.',
            hint: 'Contact your institution administrator.',
          },
        },
        { status: 403 },
      );
    }

    if (!candidate.institutionActive) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'INSTITUTION_INACTIVE',
            message: 'This institution’s CampusOS access is currently inactive.',
            hint: 'Contact your administrator.',
          },
        },
        { status: 403 },
      );
    }

    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, candidate.id));

    const token = await createSession({
      userId: candidate.id,
      institutionId: candidate.institutionId,
      role: candidate.role,
      epoch: candidate.sessionEpoch,
      userAgent: request.headers.get('user-agent'),
      ipAddress: clientIp(request),
    });
    await setSessionCookie(token);

    await recordAudit(
      { userId: candidate.id, institutionId: candidate.institutionId, role: candidate.role },
      {
        action: 'USER_LOGIN',
        entityType: 'user',
        entityId: candidate.id,
        ipAddress: clientIp(request),
        userAgent: request.headers.get('user-agent'),
      },
    );

    return NextResponse.json({
      ok: true,
      data: {
        redirectTo: `/${portalForRole(candidate.role)}`,
        mustChangePassword: candidate.mustChangePassword,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

function invalidCredentials() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'That email and password combination is not correct.',
        hint: 'Check your details, or use “Forgot password” to reset.',
      },
    },
    { status: 401 },
  );
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return (forwarded.split(',')[0] ?? '').trim() || null;
  return request.headers.get('x-real-ip');
}
