import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { base32Decode, base32Encode, currentStep, decryptSecret, encryptSecret, hotp, readChallenge, signChallenge, verifyTotp } from '@/lib/auth/totp';
import { mfaSetupBlocking } from '@/lib/auth/mfa-policy';
import { confirmEnrollment, disableMfa, mfaStatus, resetMfaFor, startEnrollment, verifySecondFactor } from '@/services/auth/mfa';
import { isPlatformOperator } from '@/services/institutions';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/** CAMPUSOS-018: TOTP two-step sign-in, recovery codes, enforcement. */

let A: TestTenant;
let B: TestTenant;

beforeAll(async () => {
  A = await createTenant();
  B = await createTenant();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

describe('TOTP primitives', () => {
  it('match the RFC 6238 test vector and round-trip base32', () => {
    // RFC 6238 SHA-1 seed "12345678901234567890", T=59s → step 1 → 94287082 (8 digits) → 287082 (6 digits).
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(hotp(secret, 1)).toBe('287082');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    const now = Date.now();
    expect(verifyTotp(secret, hotp(secret, currentStep(now)), now)).toBe(currentStep(now));
    expect(verifyTotp(secret, '000000', now) === null || hotp(secret, currentStep(now)) === '000000').toBe(true);
  });

  it('encrypts secrets at rest and signs short-lived challenges', () => {
    const blob = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(blob).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(blob)).toBe('JBSWY3DPEHPK3PXP');
    const c = signChallenge({ uid: 'u', iid: 'i', epoch: 1 });
    expect(readChallenge(c)).toEqual({ uid: 'u', iid: 'i', epoch: 1 });
    expect(readChallenge(`${c}x`)).toBeNull();
    expect(readChallenge(signChallenge({ uid: 'u', iid: 'i', epoch: 1 }, -1))).toBeNull();
  });
});

async function enrol(userId: string) {
  const ctx = await ctxFor(userId);
  const { secret } = await startEnrollment(ctx);
  const { recoveryCodes } = await confirmEnrollment(ctx, hotp(secret, currentStep()), meta());
  return { ctx, secret, recoveryCodes };
}

describe('enrolment and verification', () => {
  it('turns on with a correct code, and a code or recovery code works only once', async () => {
    const u = await createUser(A, { role: 'ADMIN' });
    const ctx = await ctxFor(u.id);
    const { secret } = await startEnrollment(ctx);
    await expect(confirmEnrollment(ctx, '12345', meta())).rejects.toMatchObject({ code: 'BAD_CODE' });
    const step = currentStep();
    const { recoveryCodes } = await confirmEnrollment(ctx, hotp(secret, step), meta());
    expect(recoveryCodes).toHaveLength(10);
    const [row] = await db.select().from(t.userMfa).where(eq(t.userMfa.userId, u.id));
    expect(row!.secretEnc).not.toContain(secret);
    expect(JSON.stringify(row!.recoveryCodes)).not.toContain(recoveryCodes[0]!);

    // The code used to enrol can't be replayed; the next step works once.
    expect(await verifySecondFactor(u.id, { code: hotp(secret, step) })).toBeNull();
    expect(await verifySecondFactor(u.id, { code: hotp(secret, step + 1) })).toBe('totp');
    expect(await verifySecondFactor(u.id, { code: hotp(secret, step + 1) })).toBeNull();

    expect(await verifySecondFactor(u.id, { recoveryCode: recoveryCodes[0]!.toUpperCase() })).toBe('recovery');
    expect(await verifySecondFactor(u.id, { recoveryCode: recoveryCodes[0]! })).toBeNull();
    expect((await mfaStatus(await ctxFor(u.id))).recoveryRemaining).toBe(9);
  });

  it('refuses demo accounts', async () => {
    const demo = await createTenant();
    await db.update(t.institutions).set({ isDemo: true }).where(eq(t.institutions.id, demo.id));
    const u = await ctxFor((await createUser(demo, { role: 'SUPER_ADMIN' })).id);
    await expect(startEnrollment(u)).rejects.toMatchObject({ code: 'DEMO_READ_ONLY' });
    await dropTenant(demo.id).catch(() => undefined);
  });
});

describe('enforcement', () => {
  it('blocks required roles until set up, and gates platform operators', async () => {
    vi.stubEnv('MFA_ENFORCE', 'true');
    const sa = await createUser(A, { role: 'SUPER_ADMIN' });
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', sa.email);
    const before = await ctxFor(sa.id);
    expect(mfaSetupBlocking(before)).toBe(true);
    expect(isPlatformOperator(before)).toBe(false);
    const { ctx } = await enrol(sa.id);
    const after = await ctxFor(sa.id);
    expect(after.mfaEnabled).toBe(true);
    expect(mfaSetupBlocking(after)).toBe(false);
    expect(isPlatformOperator(after)).toBe(true);
    // Required roles can't switch it off.
    await expect(disableMfa(ctx, { code: '000000' }, meta())).rejects.toMatchObject({ status: 403 });
    // Students are never blocked by the default policy.
    const student = await ctxFor((await createUser(A, { role: 'STUDENT' })).id);
    expect(mfaSetupBlocking(student)).toBe(false);
  });

  it('lets an administrator reset someone in their own college (not themselves, not elsewhere)', async () => {
    const admin = await ctxFor((await createUser(A, { role: 'SUPER_ADMIN' })).id);
    const target = await createUser(A, { role: 'ADMIN' });
    await enrol(target.id);
    await expect(resetMfaFor(admin, admin.userId, meta())).rejects.toMatchObject({ code: 'SELF_ACTION' });
    const foreign = await ctxFor((await createUser(B, { role: 'SUPER_ADMIN' })).id);
    await expect(resetMfaFor(foreign, target.id, meta())).rejects.toMatchObject({ status: 404 });
    await resetMfaFor(admin, target.id, meta());
    expect((await ctxFor(target.id)).mfaEnabled).toBe(false);
    const [u] = await db.select({ epoch: t.users.sessionEpoch }).from(t.users).where(eq(t.users.id, target.id));
    expect(u!.epoch).toBeGreaterThan(target.sessionEpoch);
  });
});
