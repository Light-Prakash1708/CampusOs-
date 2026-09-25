/**
 * Drops and rebuilds the development database schema from migrations.
 *
 *   npm run db:reset      (then seeds)
 *
 * Refuses to run in production, and refuses any DATABASE_URL that does not
 * look like a local database unless ALLOW_REMOTE_RESET=true is set explicitly.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { Pool } from 'pg';
import { poolConfig } from '../src/lib/db/config';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:reset refuses to run with NODE_ENV=production.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const local = /@(localhost|127\.0\.0\.1|\[::1\]|postgres)(:|\/)/.test(url);
  if (!local && process.env.ALLOW_REMOTE_RESET !== 'true') {
    throw new Error(
      'db:reset only runs against a local database. Set ALLOW_REMOTE_RESET=true if you really mean to wipe a remote one.',
    );
  }

  const pool = new Pool({ ...poolConfig(url), max: 1 });
  try {
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
  } finally {
    await pool.end();
  }
  console.log('[reset] schema dropped — applying migrations');
  execSync('npx tsx scripts/migrate.ts', { stdio: 'inherit' });
}

main().catch((error) => {
  console.error('[reset] failed:', error);
  process.exit(1);
});
