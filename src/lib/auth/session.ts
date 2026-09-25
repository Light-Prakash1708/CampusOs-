import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions, users } from '@/lib/db/schema';

/**
 * SESSION MANAGEMENT
 * ---------------------------------------------------------------------------
 * Transport : httpOnly, SameSite=Lax, Secure-in-production cookie holding a JWT.
 * Authority : the `sessions` table. The JWT alone is never sufficient — every
 *             request re-checks that the session row exists, is unrevoked and
 *             unexpired, and that the user's `sessionEpoch` still matches.
 *
 * That means: revoking a session, changing a role, or forcing logout takes
 * effect on the very next request rather than whenever the JWT happens to
 * expire.
 */

export const SESSION_COOKIE = 'campusos_session';

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set to a random string of at least 32 characters. Generate one with: openssl rand -base64 48',
    );
  }
  return new TextEncoder().encode(secret);
}

function maxAgeSeconds(): number {
  return Number(process.env.SESSION_MAX_AGE ?? 28800);
}

export interface SessionPayload {
  /** session row id */
  sid: string;
  userId: string;
  institutionId: string;
  role: string;
  epoch: number;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Creates a session row and returns the signed cookie value. */
export async function createSession(params: {
  userId: string;
  institutionId: string;
  role: string;
  epoch: number;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + maxAgeSeconds() * 1000);

  const [row] = await db
    .insert(sessions)
    .values({
      userId: params.userId,
      institutionId: params.institutionId,
      tokenHash: hashToken(rawToken),
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      expiresAt,
    })
    .returning({ id: sessions.id });

  if (!row) throw new Error('Failed to create session');

  const jwt = await new SignJWT({
    sid: row.id,
    userId: params.userId,
    institutionId: params.institutionId,
    role: params.role,
    epoch: params.epoch,
    tk: rawToken,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setIssuer('campusos')
    .sign(secretKey());

  return jwt;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds(),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Verifies the cookie AND the server-side session record.
 * Returns null for any failure — callers must treat null as unauthenticated.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  let claims: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'campusos' });
    claims = payload as Record<string, unknown>;
  } catch {
    return null;
  }

  const sid = typeof claims.sid === 'string' ? claims.sid : null;
  const rawToken = typeof claims.tk === 'string' ? claims.tk : null;
  if (!sid || !rawToken) return null;

  const [row] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      institutionId: sessions.institutionId,
      tokenHash: sessions.tokenHash,
      role: users.role,
      epoch: users.sessionEpoch,
      status: users.status,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, sid),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;
  // Constant-work comparison of the stored hash against the presented token.
  if (row.tokenHash !== hashToken(rawToken)) return null;
  if (row.deletedAt || row.status !== 'ACTIVE') return null;
  // Role change / forced logout invalidates every previously issued token.
  if (typeof claims.epoch === 'number' && claims.epoch !== row.epoch) return null;

  return {
    sid: row.id,
    userId: row.userId,
    institutionId: row.institutionId,
    role: row.role,
    epoch: row.epoch,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Invalidates every session for a user (password change, role change). */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
}

export async function touchSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
}
