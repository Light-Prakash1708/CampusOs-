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

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and configure your PostgreSQL connection.',
    );
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
