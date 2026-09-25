import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import journal from '../../../../drizzle/migrations/meta/_journal.json';

export const dynamic = 'force-dynamic';

/** Migrations this build expects (from the repository's migration journal). */
const EXPECTED_MIGRATIONS = (journal as { entries: unknown[] }).entries.length;

function release(): string | null {
  const sha = process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return sha ? sha.slice(0, 12) : null;
}

/**
 * Health probe for load balancers and deploy checks.
 *   200 healthy   database reachable, schema up to date
 *   503 unhealthy database unreachable, or migrations pending — so a new
 *                 release never takes traffic against an old schema
 * Never includes secrets, connection strings or personal data.
 */
export async function GET() {
  const startedAt = Date.now();
  const base = { release: release(), timestamp: new Date().toISOString() };
  try {
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - startedAt;
    let applied: number | null = null;
    try {
      const res = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
      applied = (res.rows[0] as { n: number } | undefined)?.n ?? 0;
    } catch {
      applied = 0; // history table missing: nothing has been migrated
    }
    const pending = Math.max(0, EXPECTED_MIGRATIONS - (applied ?? 0));
    const body = {
      status: pending ? 'migrations_pending' : 'healthy',
      database: 'connected',
      latencyMs,
      migrations: { applied, expected: EXPECTED_MIGRATIONS, pending },
      aiProvider: process.env.AI_PROVIDER ?? 'local',
      ...base,
    };
    if (pending) {
      logger.warn('health.migrations_pending', { applied, expected: EXPECTED_MIGRATIONS });
      return NextResponse.json(
        { ok: false, data: body, error: { code: 'MIGRATIONS_PENDING', message: `${pending} database migration(s) not applied.`, hint: 'Run npm run db:migrate.' } },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }
    return NextResponse.json({ ok: true, data: body }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    logger.error('health.database_unreachable', { error });
    return NextResponse.json(
      {
        ok: false,
        data: { status: 'unhealthy', database: 'unreachable', ...base },
        error: {
          code: 'DATABASE_UNREACHABLE',
          message: 'The application cannot reach its database.',
          hint: 'Check DATABASE_URL and that PostgreSQL is running.',
        },
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
