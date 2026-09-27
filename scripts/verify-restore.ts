/**
 * READ-ONLY restore check (CAMPUSOS-004).
 *
 *   DATABASE_URL=<restored database> npm run db:verify
 *
 * Point it at a database restored from backup (never needed against
 * production, though it is safe there: it only runs SELECTs). It confirms:
 *   - every migration this build expects is applied;
 *   - the core tables exist and hold rows;
 *   - the newest audit entry, so you can see how recent the restore point is.
 * Exits 1 if migrations are missing or a core table is absent.
 *
 * Prints counts only — never names, emails or other personal data.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { poolConfig } from '../src/lib/db/config';

const CORE_TABLES = [
  'institutions',
  'users',
  'announcements',
  'announcement_recipients',
  'attendance_records',
  'grievances',
  'consent_records',
  'audit_logs',
  'invoices',
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const pool = new Pool({ ...poolConfig(url), max: 1 });
  let failed = false;
  try {
    const journal = JSON.parse(readFileSync(path.join(process.cwd(), 'drizzle/migrations/meta/_journal.json'), 'utf8')) as { entries: unknown[] };
    const expected = journal.entries.length;
    const applied = await pool
      .query<{ n: number }>('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')
      .then((r) => r.rows[0]!.n)
      .catch(() => 0);
    const migrationsOk = applied >= expected;
    if (!migrationsOk) failed = true;
    console.log(`migrations   ${applied}/${expected} ${migrationsOk ? 'OK' : 'MISSING — run npm run db:migrate against this copy'}`);

    for (const table of CORE_TABLES) {
      const exists = await pool.query<{ ok: boolean }>('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${table}`]);
      if (!exists.rows[0]!.ok) {
        failed = true;
        console.log(`${table.padEnd(22)} MISSING`);
        continue;
      }
      // Table names come from the constant list above, never from input.
      const { rows } = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}"`);
      console.log(`${table.padEnd(22)} ${rows[0]!.n} rows`);
    }

    const latest = await pool.query<{ at: Date | null }>('SELECT max(created_at) AS at FROM audit_logs');
    console.log(`newest audit entry   ${latest.rows[0]!.at?.toISOString() ?? 'none'}`);
  } finally {
    await pool.end();
  }
  console.log(failed ? '\nRESTORE CHECK FAILED' : '\nRestore check passed.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('verify-restore failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
