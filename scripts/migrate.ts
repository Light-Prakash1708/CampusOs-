/**
 * CampusOS migration runner.
 *
 *   npm run db:migrate
 *
 * Applies the versioned SQL migrations in drizzle/migrations in order, inside a
 * transaction, recording each in drizzle.__drizzle_migrations.
 *
 * BASELINING: v1 databases were created with `drizzle-kit push` and have no
 * migration history. Re-running 0000_baseline against them would fail on
 * "relation already exists". So, when the migration table is empty but the v1
 * schema is present, this runner records 0000 and 0001 as already applied and
 * then applies everything after them. 0001 (hard constraints) is idempotent, so
 * it is re-executed anyway to guarantee the guarantees are in place.
 *
 * It never drops anything. Safe to run on every deploy.
 */
import 'dotenv/config';
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { poolConfig } from '../src/lib/db/config';
import { hardenDataApi } from './lib/data-api-hardening';

const MIGRATIONS_FOLDER = path.resolve(__dirname, '../drizzle/migrations');
const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE = '__drizzle_migrations';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  const pool = new Pool({ ...poolConfig(url), max: 1 });
  try {
    await baselineIfNeeded(pool);
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
    );
    console.log(`[migrate] up to date — ${rows[0].n} migrations recorded.`);
    const hardening = await hardenDataApi(pool);
    if (hardening.applied) console.log(`[migrate] Data API locked down for anon/authenticated on ${hardening.tables} tables (RLS + revoke).`);
  } finally {
    await pool.end();
  }
}

async function baselineIfNeeded(pool: Pool) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);

  const { rows: applied } = await pool.query(
    `SELECT count(*)::int AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
  );
  if (applied[0].n > 0) return;

  const { rows: v1 } = await pool.query(
    `SELECT to_regclass('public.institutions') IS NOT NULL AS present`,
  );
  if (!v1[0].present) return; // empty database: run everything from 0000

  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const baseline = migrations.slice(0, 2); // 0000_baseline, 0001_hard_constraints
  console.log('[migrate] existing v1 schema detected without history — baselining 0000/0001');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const m of baseline) {
      await client.query(
        `INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (hash, created_at) VALUES ($1, $2)`,
        [m.hash, m.folderMillis],
      );
    }
    // Re-assert the (idempotent) integrity guarantees in case the v1 database
    // was pushed but `db:constraints` was never run.
    for (const statement of baseline[1]!.sql) {
      if (statement.trim()) await client.query(statement);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main().catch((error) => {
  console.error('[migrate] failed:', error);
  process.exit(1);
});
