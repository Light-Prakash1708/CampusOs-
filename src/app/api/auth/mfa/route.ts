import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { startSession } from '@/lib/auth/session';
import { portalForRole } from '@/lib/auth/permissions';
import { readChallenge } from '@/lib/auth/totp';
import { verifySecondFactor } from '@/services/auth/mfa';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { recordAudit } from '@/services/audit';

const Body = z.object({
  challenge: z.string().min(10).max(2000),
  code: z.string().trim().max(12).optional(),
  recoveryCode: z.string().trim().max(24).optional(),
});

/** Second step of sign-in: a TOTP or recovery code for the signed challenge. */
export const POST = publicRoute(async (request) => {
  const input = await parseBody(request, Body);
  const meta = metaFrom(request);
  const c = readChallenge(input.challenge);
  if (!c) throw new AppError('This sign-in has expired. Enter your password again.', 401, 'CHALLENGE_EXPIRED');
  await enforceRateLimit(keyFor('mfa:login', c.uid), { limit: 10, windowSec: 900 }, 'Too many codes tried. Wait a few minutes and sign in again.');
  const [user] = await db
    .select({ id: t.users.id, institutionId: t.users.institutionId, role: t.users.role, sessionEpoch: t.users.sessionEpoch, status: t.users.status })
    .from(t.users)
    .where(and(eq(t.users.id, c.uid), eq(t.users.institutionId, c.iid)))
    .limit(1);
  if (!user || user.status !== 'ACTIVE' || user.sessionEpoch !== c.epoch) {
    throw new AppError('This sign-in has expired. Enter your password again.', 401, 'CHALLENGE_EXPIRED');
  }
  const how = await verifySecondFactor(user.id, { code: input.code, recoveryCode: input.recoveryCode });
  if (!how) {
    await recordAudit({ userId: user.id, institutionId: user.institutionId, role: user.role }, { action: 'USER_LOGIN_FAILED', entityType: 'user', entityId: user.id, after: { secondFactor: true }, ...meta });
    throw new AppError('That code isn’t right.', 401, 'BAD_CODE', undefined, 'Use the newest code from your authenticator app, or one of your recovery codes.');
  }
  await startSession(user, meta);
  return ok({ redirectTo: `/${portalForRole(user.role)}`, method: how });
});
