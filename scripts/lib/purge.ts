import { sql, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as s from '../../src/lib/db/schema';

/**
 * Removes one tenant and everything it owns. DEVELOPMENT / TEST ONLY.
 *
 * `audit_logs`, `grievance_events` and `consent_records` are append-only:
 * triggers reject UPDATE and DELETE so institutional history cannot be
 * rewritten. Purging a demo tenant legitimately needs to delete them, so the
 * triggers are disabled for exactly this operation, inside its transaction.
 * This (and scripts/reset.ts) are the only places that do so, and both refuse
 * to run when NODE_ENV=production.
 */
const APPEND_ONLY = [
  ['audit_logs', 'audit_logs_no_update'],
  ['grievance_events', 'grievance_events_no_update'],
  ['consent_records', 'consent_records_no_update'],
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function purgeTenant(db: NodePgDatabase<any>, institutionId: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to purge a tenant while NODE_ENV=production.');
  }
  // One transaction: Postgres DDL is transactional, so the disabled triggers
  // are never visible to other sessions, and the lock DISABLE TRIGGER takes
  // (always in APPEND_ONLY order) serializes concurrent purges. Disabling them
  // with separate autocommitted statements was a global change — a parallel
  // purge could re-enable them between another purge's disable and delete.
  await db.transaction(async (tx) => {
    for (const [table, trigger] of APPEND_ONLY) {
      await tx.execute(sql.raw(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`));
    }
    for (const [table] of APPEND_ONLY) {
      await tx.execute(sql`DELETE FROM ${sql.raw(table)} WHERE institution_id = ${institutionId}`);
    }
    await tx.delete(s.institutions).where(eq(s.institutions.id, institutionId));
    for (const [table, trigger] of APPEND_ONLY) {
      await tx.execute(sql.raw(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`));
    }
  });
}

/**
 * Removes a DEMO tenant (institutions.is_demo = true). Safe in production:
 * the append-only guard permits deleting demo rows only (migration 0016), so
 * no trigger is disabled and a real college can never be touched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function purgeDemoTenant(db: NodePgDatabase<any>, institutionId: string): Promise<void> {
  const [inst] = await db.select({ isDemo: s.institutions.isDemo }).from(s.institutions).where(eq(s.institutions.id, institutionId)).limit(1);
  if (!inst) return;
  if (!inst.isDemo) throw new Error('Refusing to purge a tenant that is not flagged as a demo.');
  await db.transaction(async (tx) => {
    for (const [table] of APPEND_ONLY) {
      await tx.execute(sql`DELETE FROM ${sql.raw(table)} WHERE institution_id = ${institutionId}`);
    }
    await tx.delete(s.institutions).where(eq(s.institutions.id, institutionId));
  });
}
