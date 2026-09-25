import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ForbiddenError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { FEATURE_FLAGS, isBuilt, isFeatureFlag, type FeatureFlag } from '@/lib/features';
import { recordAudit } from '@/services/audit';

/**
 * Tenant settings writes. Only `institution:manage` (super administrators) may
 * switch modules or change who can register; both are audited with before and
 * after values.
 */

export async function updateFeatureFlags(
  ctx: AuthContext,
  changes: Partial<Record<FeatureFlag, boolean>>,
  meta: { ipAddress: string | null; userAgent: string | null },
) {
  if (!ctx.permissions.has('institution:manage')) throw new ForbiddenError();
  const [inst] = await db.select({ flags: t.institutions.featureFlags }).from(t.institutions).where(eq(t.institutions.id, ctx.institutionId));
  if (!inst) throw new NotFoundError('Institution');
  const before = (inst.flags ?? {}) as Record<string, boolean>;
  const clean = Object.fromEntries(Object.entries(changes).filter(([k, v]) => isFeatureFlag(k) && typeof v === 'boolean'));
  const unbuilt = Object.entries(clean).filter(([k, v]) => v === true && !isBuilt(k as FeatureFlag)).map(([k]) => k);
  if (unbuilt.length) {
    throw new AppError(
      `${unbuilt.map((k) => FEATURE_FLAGS[k as FeatureFlag].label).join(', ')}: not built yet, so it cannot be switched on.`,
      422,
      'MODULE_NOT_BUILT',
      { flags: unbuilt },
    );
  }
  const after = { ...before, ...clean };
  await db.update(t.institutions).set({ featureFlags: after }).where(eq(t.institutions.id, ctx.institutionId));
  await recordAudit(ctx, {
    action: 'FEATURE_FLAGS_UPDATED',
    entityType: 'institution',
    entityId: ctx.institutionId,
    before: Object.fromEntries(Object.keys(clean).map((k) => [k, before[k] ?? null])),
    after: clean,
    ...meta,
  });
  return after;
}

export async function updateRegistrationPolicy(
  ctx: AuthContext,
  policy: { mode: 'DISABLED' | 'EMAIL_DOMAIN' | 'ADMIN_APPROVAL'; allowedDomains?: string[]; isListed?: boolean },
  meta: { ipAddress: string | null; userAgent: string | null },
) {
  if (!ctx.permissions.has('institution:manage')) throw new ForbiddenError();
  const [inst] = await db
    .select({ policy: t.institutions.registrationPolicy, isListed: t.institutions.isListed })
    .from(t.institutions)
    .where(eq(t.institutions.id, ctx.institutionId));
  if (!inst) throw new NotFoundError('Institution');
  const next = {
    mode: policy.mode,
    allowedDomains: (policy.allowedDomains ?? []).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
  };
  await db
    .update(t.institutions)
    .set({ registrationPolicy: next, ...(policy.isListed !== undefined ? { isListed: policy.isListed } : {}) })
    .where(eq(t.institutions.id, ctx.institutionId));
  await recordAudit(ctx, {
    action: 'REGISTRATION_POLICY_UPDATED',
    entityType: 'institution',
    entityId: ctx.institutionId,
    before: { ...inst.policy, isListed: inst.isListed },
    after: { ...next, isListed: policy.isListed ?? inst.isListed },
    ...meta,
  });
  return next;
}
