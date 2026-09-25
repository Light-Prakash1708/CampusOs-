import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { DATA_CATEGORIES } from './catalogue';

/**
 * Seeds an institution's retention policies from the catalogue. Idempotent and
 * never overwrites a policy the institution has edited. No `server-only`
 * marker so the seed script can call it.
 */
export async function ensureRetentionPolicies(institutionId: string): Promise<void> {
  await db
    .insert(t.dataRetentionPolicies)
    .values(
      DATA_CATEGORIES.map((c) => ({
        institutionId,
        category: c.key,
        purpose: c.usedFor.join('; '),
        owner: c.owner,
        retentionDays: c.retentionDays,
        visibility: c.visibleTo.join('; '),
        deletionPolicy: c.deletionPolicy,
        exportPolicy: c.exportPolicy,
      })),
    )
    .onConflictDoNothing();
}
