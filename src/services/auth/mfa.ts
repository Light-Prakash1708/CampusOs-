import 'server-only';
import { and, eq, isNotNull, lt, or, isNull, sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ForbiddenError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { mfaEnforced, mfaRequiredFor } from '@/lib/auth/mfa-policy';
import {
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  verifyTotp,
} from '@/lib/auth/totp';
import { recordAudit } from '@/services/audit';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';

/**
 * TWO-STEP SIGN-IN (CAMPUSOS-018)
 * ---------------------------------------------------------------------------
 * TOTP from any authenticator app, plus ten single-use recovery codes.
 * Mandatory for roles in MFA_REQUIRED_ROLES (default SUPER_ADMIN) wherever
 * MFA is enforced (production by default). Every change is audited.
 */

type Meta = { ipAddress: string | null; userAgent: string | null };

async function row(userId: string) {
  const [r] = await db.select().from(t.userMfa).where(eq(t.userMfa.userId, userId)).limit(1);
  return r ?? null;
}

export async function hasMfa(userId: string): Promise<boolean> {
  const r = await row(userId);
  return !!r?.enabledAt;
}

export async function mfaStatus(ctx: AuthContext) {
  const r = await row(ctx.userId);
  return {
    enabled: !!r?.enabledAt,
    enabledAt: r?.enabledAt ?? null,
    recoveryRemaining: r?.enabledAt ? r.recoveryCodes.filter((c) => !c.usedAt).length : 0,
    required: mfaRequiredFor(ctx.role),
    enforced: mfaEnforced(),
  };
}

/** Starts (or restarts) enrolment. The secret is shown once, until confirmed. */
export async function startEnrollment(ctx: AuthContext) {
  if (ctx.isDemo) throw new AppError('Demo accounts are shared, so they can’t use two-step sign-in.', 403, 'DEMO_READ_ONLY');
  const existing = await row(ctx.userId);
  if (existing?.enabledAt) throw new AppError('Two-step sign-in is already on.', 409, 'MFA_ALREADY_ON');
  await enforceRateLimit(keyFor('mfa:enrol', ctx.userId), { limit: 10, windowSec: 3600 }, 'Try again later.');
  const secret = newTotpSecret();
  await db
    .insert(t.userMfa)
    .values({ institutionId: ctx.institutionId, userId: ctx.userId, secretEnc: encryptSecret(secret) })
    .onConflictDoUpdate({ target: t.userMfa.userId, set: { secretEnc: encryptSecret(secret), enabledAt: null, lastUsedStep: null, recoveryCodes: [], updatedAt: new Date() } });
  const uri = otpauthUri(secret, ctx.email);
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { secret, uri, qrSvg };
}

/** Confirms enrolment with a first code; returns recovery codes (shown once). */
export async function confirmEnrollment(ctx: AuthContext, code: string, meta: Meta) {
  await enforceRateLimit(keyFor('mfa:verify', ctx.userId), { limit: 10, windowSec: 900 }, 'Too many attempts. Wait a few minutes.');
  const r = await row(ctx.userId);
  if (!r) throw new AppError('Start setting up two-step sign-in first.', 409, 'MFA_NOT_STARTED');
  if (r.enabledAt) throw new AppError('Two-step sign-in is already on.', 409, 'MFA_ALREADY_ON');
  const step = verifyTotp(decryptSecret(r.secretEnc), code);
  if (step === null) throw new AppError('That code isn’t right. Check the time on your phone and try the newest code.', 422, 'BAD_CODE');
  const codes = newRecoveryCodes();
  await db
    .update(t.userMfa)
    .set({ enabledAt: new Date(), lastUsedStep: step, recoveryCodes: codes.map((c) => ({ hash: hashRecoveryCode(c), usedAt: null })), updatedAt: new Date() })
    .where(eq(t.userMfa.id, r.id));
  await recordAudit(ctx, { action: 'MFA_ENROLLED', entityType: 'user', entityId: ctx.userId, ...meta });
  return { recoveryCodes: codes };
}

/**
 * Checks a second factor for this user: a TOTP code (each step usable once)
 * or an unused recovery code. Returns how it was satisfied, or null.
 */
export async function verifySecondFactor(userId: string, input: { code?: string | null; recoveryCode?: string | null }): Promise<'totp' | 'recovery' | null> {
  const r = await row(userId);
  if (!r?.enabledAt) return null;
  if (input.code) {
    const step = verifyTotp(decryptSecret(r.secretEnc), input.code);
    if (step === null) return null;
    // Replay protection: the update only succeeds for a newer step.
    const updated = await db
      .update(t.userMfa)
      .set({ lastUsedStep: step, updatedAt: new Date() })
      .where(and(eq(t.userMfa.id, r.id), or(isNull(t.userMfa.lastUsedStep), lt(t.userMfa.lastUsedStep, step))))
      .returning({ id: t.userMfa.id });
    return updated.length ? 'totp' : null;
  }
  if (input.recoveryCode) {
    const hash = hashRecoveryCode(input.recoveryCode);
    const idx = r.recoveryCodes.findIndex((c) => c.hash === hash && !c.usedAt);
    if (idx < 0) return null;
    const next = r.recoveryCodes.map((c, i) => (i === idx ? { ...c, usedAt: new Date().toISOString() } : c));
    // Optimistic: only if the stored codes are unchanged since we read them.
    const updated = await db
      .update(t.userMfa)
      .set({ recoveryCodes: next, updatedAt: new Date() })
      .where(and(eq(t.userMfa.id, r.id), sql`${t.userMfa.recoveryCodes} = ${JSON.stringify(r.recoveryCodes)}::jsonb`))
      .returning({ id: t.userMfa.id });
    if (!updated.length) return null;
    await recordAudit({ userId, institutionId: r.institutionId, role: 'USER' as never }, { action: 'MFA_RECOVERY_USED', entityType: 'user', entityId: userId, after: { remaining: next.filter((c) => !c.usedAt).length } });
    return 'recovery';
  }
  return null;
}

/** Turns MFA off for yourself — needs a current code, and is refused for required roles. */
export async function disableMfa(ctx: AuthContext, input: { code?: string | null; recoveryCode?: string | null }, meta: Meta) {
  if (mfaEnforced() && mfaRequiredFor(ctx.role)) throw new ForbiddenError('Your role must keep two-step sign-in on.');
  await enforceRateLimit(keyFor('mfa:verify', ctx.userId), { limit: 10, windowSec: 900 }, 'Too many attempts. Wait a few minutes.');
  if (!(await verifySecondFactor(ctx.userId, input))) throw new AppError('That code isn’t right.', 422, 'BAD_CODE');
  await db.delete(t.userMfa).where(eq(t.userMfa.userId, ctx.userId));
  await recordAudit(ctx, { action: 'MFA_DISABLED', entityType: 'user', entityId: ctx.userId, ...meta });
}

/** New recovery codes (old ones stop working). Needs a current code. */
export async function regenerateRecoveryCodes(ctx: AuthContext, code: string, meta: Meta) {
  await enforceRateLimit(keyFor('mfa:verify', ctx.userId), { limit: 10, windowSec: 900 }, 'Too many attempts. Wait a few minutes.');
  if ((await verifySecondFactor(ctx.userId, { code })) !== 'totp') throw new AppError('That code isn’t right.', 422, 'BAD_CODE');
  const codes = newRecoveryCodes();
  await db.update(t.userMfa).set({ recoveryCodes: codes.map((c) => ({ hash: hashRecoveryCode(c), usedAt: null })), updatedAt: new Date() }).where(eq(t.userMfa.userId, ctx.userId));
  await recordAudit(ctx, { action: 'MFA_ENROLLED', entityType: 'user', entityId: ctx.userId, after: { recoveryCodesRegenerated: true }, ...meta });
  return { recoveryCodes: codes };
}

/**
 * An administrator resets someone's MFA after they lost their phone and codes.
 * Same college, `institution:manage`, never yourself; their sessions end.
 */
export async function resetMfaFor(ctx: AuthContext, userId: string, meta: Meta) {
  if (!ctx.permissions.has('institution:manage')) throw new ForbiddenError();
  if (userId === ctx.userId) throw new AppError('Ask another administrator to reset your two-step sign-in.', 403, 'SELF_ACTION');
  const [target] = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(and(eq(t.users.id, userId), eq(t.users.institutionId, ctx.institutionId)))
    .limit(1);
  if (!target) throw new NotFoundError('Person');
  const removed = await db.delete(t.userMfa).where(and(eq(t.userMfa.userId, userId), isNotNull(t.userMfa.enabledAt))).returning({ id: t.userMfa.id });
  if (!removed.length) throw new AppError('That person does not use two-step sign-in.', 409, 'MFA_NOT_ON');
  await db.update(t.users).set({ sessionEpoch: sql`${t.users.sessionEpoch} + 1` }).where(eq(t.users.id, userId));
  await recordAudit(ctx, { action: 'MFA_RESET', entityType: 'user', entityId: userId, ...meta });
}
