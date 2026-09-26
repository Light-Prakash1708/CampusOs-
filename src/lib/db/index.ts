import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { poolConfig } from './config';

/**
 * Database client.
 *
 * A single pooled connection is reused across hot reloads in development to
 * avoid exhausting Postgres connections. In production each server instance
 * owns one pool.
 */

declare global {
  // eslint-disable-next-line no-var
  var __campusosPool: Pool | undefined;
}

const MISSING_DATABASE_URL =
  'DATABASE_URL is not set. Copy .env.example to .env and configure your PostgreSQL connection.';

/**
 * `next build` imports every route module to collect page data, and container
 * builds (Docker on Render) have no runtime secrets at that point. Only in
 * that phase is a missing DATABASE_URL tolerated: the pool is replaced by a
 * stand-in that fails with the same message the moment anything uses it, so
 * no query can silently run without a database. At runtime a missing value
 * still fails at import (and src/instrumentation.ts stops the server first).
 */
function unconfiguredPool(): Pool {
  return new Proxy(Object.create(Pool.prototype) as Pool, {
    get(_target, prop) {
      // Allow inspection (drizzle's client-type check, promise detection, logging).
      if (prop === 'constructor') return Pool;
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      throw new Error(MISSING_DATABASE_URL);
    },
  });
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (process.env.NEXT_PHASE === 'phase-production-build') return unconfiguredPool();
    throw new Error(MISSING_DATABASE_URL);
  }

  return new Pool(poolConfig(connectionString));
}

export const pool: Pool = global.__campusosPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  global.__campusosPool = pool;
}

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Database = typeof db;
export { schema };

/** Runs a set of statements inside a single transaction. */
export async function withTransaction<T>(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(fn);
}
