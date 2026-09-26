import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, NotFoundError } from '@/lib/api';
import { DEMO_ACCOUNTS, demoSignInEnabled, demoSlug, type DemoRole } from '@/lib/demo';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { recordAudit } from '@/services/audit';

/**
 * THE PUBLIC DEMO (CAMPUSOS-015)
 * ---------------------------------------------------------------------------
 * Visitors press "Try the demo" and are signed in to a fixed account in the
 * demo tenant — never anywhere else. Isolation is enforced by the tenant's
 * `is_demo` flag (see src/lib/db/schema/tenancy.ts), not by this file alone:
 * no outbound messages, no external AI, no uploads, no password or account
 * changes, hidden from real colleges, excluded from product analytics.
 */

export async function demoAccount(role: DemoRole) {
  const [row] = await db
    .select({ id: t.users.id, institutionId: t.users.institutionId, role: t.users.role, sessionEpoch: t.users.sessionEpoch, status: t.users.status })
    .from(t.users)
    .innerJoin(t.institutions, eq(t.institutions.id, t.users.institutionId))
    .where(and(eq(t.institutions.slug, demoSlug()), eq(t.institutions.isDemo, true), eq(t.institutions.isActive, true), eq(t.users.email, DEMO_ACCOUNTS[role])))
    .limit(1);
  return row && row.status === 'ACTIVE' ? row : null;
}

/** Resolves the account to sign a visitor into. Never a non-demo account. */
export async function beginDemo(role: DemoRole, meta: { ipAddress: string | null; userAgent: string | null }) {
  if (!demoSignInEnabled()) throw new NotFoundError('Demo');
  await enforceRateLimit(keyFor('demo:ip', meta.ipAddress), { limit: 30, windowSec: 3600 }, 'Too many demo sessions from here. Try again later.');
  const account = await demoAccount(role);
  if (!account) throw new AppError('The demo is being refreshed. Try again in a few minutes.', 503, 'DEMO_UNAVAILABLE');
  await recordAudit({ userId: account.id, institutionId: account.institutionId, role: account.role }, { action: 'USER_LOGIN', entityType: 'user', entityId: account.id, after: { demo: true }, ...meta });
  return account;
}

/**
 * Deletes a demo tenant and everything in it, so it can be rebuilt. Refuses
 * anything that is not flagged `is_demo`. Append-only history of a demo
 * tenant may be deleted (migration 0016); real colleges' history never can.
 */
export async function purgeDemoTenant(institutionId: string): Promise<void> {
  const [inst] = await db.select({ isDemo: t.institutions.isDemo }).from(t.institutions).where(eq(t.institutions.id, institutionId)).limit(1);
  if (!inst) return;
  if (!inst.isDemo) throw new Error('Refusing to purge a tenant that is not a demo tenant.');
  await db.transaction(async (tx) => {
    for (const table of ['audit_logs', 'grievance_events', 'consent_records']) {
      await tx.execute(sql`DELETE FROM ${sql.raw(table)} WHERE institution_id = ${institutionId}`);
    }
    await tx.delete(t.institutions).where(and(eq(t.institutions.id, institutionId), eq(t.institutions.isDemo, true)));
  });
}
