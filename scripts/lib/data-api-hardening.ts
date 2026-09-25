import type { Pool, PoolClient } from 'pg';

/**
 * DATA API HARDENING (Supabase)
 * ---------------------------------------------------------------------------
 * Supabase exposes the `public` schema through its auto-generated Data API
 * (PostgREST) to the `anon` and `authenticated` roles — reachable with the
 * public anon key. CampusOS never uses that API: every read and write goes
 * through the server, which enforces sessions, RBAC and tenancy. So on a
 * database where those roles exist, we make the Data API see nothing:
 *
 *   1. revoke every privilege on public tables, sequences and functions from
 *      anon/authenticated, now and for objects created later;
 *   2. enable row-level security on every public table, with one policy that
 *      admits any role EXCEPT anon/authenticated — so the app keeps working
 *      whether it connects as the owner or as a least-privilege app role.
 *
 * Idempotent; runs after every migration (scripts/migrate.ts), so tables added
 * by future migrations are covered automatically. On plain PostgreSQL (local,
 * Render) the roles don't exist and this is a no-op.
 */
export const DATA_API_ROLES = ['anon', 'authenticated'] as const;
export const SERVER_POLICY = 'campusos_server_only';

export async function hardenDataApi(db: Pool | PoolClient): Promise<{ applied: boolean; tables: number }> {
  const { rows: roles } = await db.query<{ rolname: string }>(
    `SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])`,
    [DATA_API_ROLES as unknown as string[]],
  );
  if (roles.length === 0) return { applied: false, tables: 0 };
  const names = roles.map((r) => `"${r.rolname}"`).join(', ');

  await db.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${names}`);
  await db.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${names}`);
  await db.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${names}`);
  await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${names}`);
  await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${names}`);
  await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM ${names}`);

  const { rows: tables } = await db.query<{ tablename: string; rls: boolean; has_policy: boolean }>(`
    SELECT c.relname AS tablename, c.relrowsecurity AS rls,
           EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = '${SERVER_POLICY}') AS has_policy
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`);

  const excluded = DATA_API_ROLES.map((r) => `'${r}'`).join(', ');
  for (const t of tables) {
    const table = `public."${t.tablename.replace(/"/g, '""')}"`;
    if (!t.has_policy) {
      await db.query(
        `CREATE POLICY ${SERVER_POLICY} ON ${table} FOR ALL TO PUBLIC
           USING (current_user NOT IN (${excluded}))
           WITH CHECK (current_user NOT IN (${excluded}))`,
      );
    }
    if (!t.rls) await db.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  }
  return { applied: true, tables: tables.length };
}
