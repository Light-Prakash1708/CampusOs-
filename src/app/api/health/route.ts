import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/** Liveness + database reachability probe for deployment health checks. */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      ok: true,
      data: {
        status: 'healthy',
        database: 'connected',
        latencyMs: Date.now() - startedAt,
        aiProvider: process.env.AI_PROVIDER ?? 'local',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[campusos:health] database unreachable', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'DATABASE_UNREACHABLE',
          message: 'The application cannot reach its database.',
          hint: 'Check DATABASE_URL and that PostgreSQL is running.',
        },
      },
      { status: 503 },
    );
  }
}
