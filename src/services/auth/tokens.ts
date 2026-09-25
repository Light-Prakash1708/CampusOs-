import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { authTokens } from '@/lib/db/schema';

/**
 * ONE-TIME TOKENS
 * ---------------------------------------------------------------------------
 * 32 random bytes, base64url. Only the SHA-256 hash is stored, so a database
 * read (backup, SQL injection elsewhere, a curious DBA) cannot be turned into a
 * working reset link. Consumption is a single conditional UPDATE, so two
 * simultaneous clicks cannot both succeed.
 *
 * Issuing a new token of a purpose revokes the user's earlier unconsumed ones
 * of the same purpose — only the most recent email works.
 */

export type TokenPurpose = 'PASSWORD_RESET' | 'EMAIL_VERIFY' | 'INVITE';

export const TOKEN_TTL_MINUTES: Record<TokenPurpose, number> = {
  PASSWORD_RESET: 30,
  EMAIL_VERIFY: 48 * 60,
  INVITE: 7 * 24 * 60,
};

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Rejects anything that is obviously not one of our tokens before touching the DB. */
export function looksLikeToken(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(raw);
}

export async function issueToken(params: {
  institutionId: string;
  userId: string;
  purpose: TokenPurpose;
  sentTo: string;
  createdById?: string | null;
  ttlMinutes?: number;
  now?: Date;
}): Promise<{ raw: string; expiresAt: Date }> {
  const now = params.now ?? new Date();
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + (params.ttlMinutes ?? TOKEN_TTL_MINUTES[params.purpose]) * 60_000);

  await db.transaction(async (tx) => {
    // Supersede earlier live tokens for the same purpose.
    await tx
      .update(authTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(authTokens.userId, params.userId),
          eq(authTokens.purpose, params.purpose),
          isNull(authTokens.consumedAt),
        ),
      );
    await tx.insert(authTokens).values({
      institutionId: params.institutionId,
      userId: params.userId,
      purpose: params.purpose,
      tokenHash: hashToken(raw),
      sentTo: params.sentTo.toLowerCase(),
      expiresAt,
      createdById: params.createdById ?? null,
      createdAt: now,
    });
  });

  return { raw, expiresAt };
}

export interface ConsumedToken {
  id: string;
  institutionId: string;
  userId: string;
  sentTo: string;
}

/**
 * Atomically marks a valid token consumed and returns it; null if the token is
 * unknown, expired, already used, or for a different purpose. Pass `tx` to make
 * consumption part of a larger transaction (so a failed password update does
 * not burn the token).
 */
export async function consumeToken(
  raw: string,
  purpose: TokenPurpose,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any = db,
  now: Date = new Date(),
): Promise<ConsumedToken | null> {
  if (!looksLikeToken(raw)) return null;
  const [row] = await tx
    .update(authTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(raw)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning({
      id: authTokens.id,
      institutionId: authTokens.institutionId,
      userId: authTokens.userId,
      sentTo: authTokens.sentTo,
    });
  return row ?? null;
}

/** Read-only check used to render the reset/invite page before the form is submitted. */
export async function peekToken(raw: string, purpose: TokenPurpose, now = new Date()) {
  if (!looksLikeToken(raw)) return null;
  const [row] = await db
    .select({ userId: authTokens.userId, institutionId: authTokens.institutionId, expiresAt: authTokens.expiresAt })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(raw)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Deletes tokens that expired more than a day ago. Called by the job runner. */
export async function sweepExpiredTokens(now = new Date()): Promise<number> {
  const res = await db.execute(
    sql`DELETE FROM auth_tokens WHERE expires_at < ${new Date(now.getTime() - 86_400_000)}`,
  );
  return res.rowCount ?? 0;
}
