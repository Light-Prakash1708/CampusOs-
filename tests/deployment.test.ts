import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { pool } from '@/lib/db';
import { hardenDataApi, SERVER_POLICY } from '../scripts/lib/data-api-hardening';
import { GET as health } from '@/app/api/health/route';

afterAll(() => pool.end());

describe('Supabase Data API hardening', () => {
  it('is a no-op on plain PostgreSQL', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query(`SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated')`);
      if (exists.rowCount === 0) expect(await hardenDataApi(client)).toEqual({ applied: false, tables: 0 });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('locks anon/authenticated out of every table but keeps app roles working', async () => {
    const client = await pool.connect();
    const suffix = Math.random().toString(36).slice(2, 8);
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL lock_timeout = '10s'`);
      const existing = await client.query<{ rolname: string }>(`SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')`);
      for (const r of ['anon', 'authenticated']) {
        if (!existing.rows.some((x) => x.rolname === r)) await client.query(`CREATE ROLE ${r} NOLOGIN`);
      }
      // Simulate Supabase's defaults: the Data API roles can read public tables.
      await client.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated`);
      await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated`);
      await client.query(`CREATE ROLE app_${suffix} NOLOGIN`);
      await client.query(`GRANT USAGE ON SCHEMA public TO app_${suffix}`);
      await client.query(`GRANT SELECT ON institutions TO app_${suffix}`);

      const res = await hardenDataApi(client);
      expect(res.applied).toBe(true);
      expect(res.tables).toBeGreaterThan(50);

      const unprotected = await client.query(`
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity`);
      expect(unprotected.rows).toEqual([]);

      // Privileges revoked…
      await client.query('SAVEPOINT s1');
      await client.query('SET LOCAL ROLE anon');
      await expect(client.query('SELECT count(*) FROM institutions')).rejects.toThrow(/permission denied/);
      await client.query('ROLLBACK TO SAVEPOINT s1');

      // …and even if someone re-grants, row-level security returns nothing.
      await client.query('GRANT SELECT ON institutions TO authenticated');
      await client.query('SET LOCAL ROLE authenticated');
      expect((await client.query('SELECT count(*)::int AS n FROM institutions')).rows[0].n).toBe(0);
      await client.query('RESET ROLE');

      // A least-privilege application role still sees data.
      await client.query(`SET LOCAL ROLE app_${suffix}`);
      expect((await client.query('SELECT count(*)::int AS n FROM institutions')).rows[0].n).toBeGreaterThan(0);
      await client.query('RESET ROLE');

      // Idempotent.
      expect((await hardenDataApi(client)).applied).toBe(true);
      const policies = await client.query(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND tablename='institutions' AND policyname=$1`, [SERVER_POLICY]);
      expect(policies.rows[0].n).toBe(1);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('health endpoint', () => {
  it('reports a healthy, fully migrated database without secrets', async () => {
    const res = await health();
    const body = await res.json();
    const journal = JSON.parse(readFileSync('drizzle/migrations/meta/_journal.json', 'utf8')) as { entries: unknown[] };
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ status: 'healthy', database: 'connected', migrations: { expected: journal.entries.length, pending: 0 } });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toContain(process.env.AUTH_SECRET ?? '__none__');
  });
});
