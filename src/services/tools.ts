import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { resolveTool, TOOLS, toolsFor, type ResolvedTool } from '@/lib/tools';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';

/**
 * TOOLS SERVICE — the hub's data and per-student usage counters.
 * Usage is the student's own: read and written only for ctx.userId, never
 * exposed to anyone else, exported with their data, removed on deletion.
 */

type Ctx = Pick<AuthContext, 'userId' | 'institutionId' | 'featureFlags' | 'permissions'>;

export async function getToolUsage(ctx: Pick<AuthContext, 'userId' | 'institutionId'>): Promise<Record<string, number>> {
  const rows = await db
    .select({ key: t.toolUsage.toolKey, n: t.toolUsage.openCount })
    .from(t.toolUsage)
    .where(and(eq(t.toolUsage.userId, ctx.userId), eq(t.toolUsage.institutionId, ctx.institutionId)));
  return Object.fromEntries(rows.map((r) => [r.key, r.n]));
}

export async function listToolsFor(ctx: Ctx): Promise<ResolvedTool[]> {
  return toolsFor(ctx, await getToolUsage(ctx));
}

/**
 * Count one open of a tool. Only AVAILABLE tools count — a planned or
 * college-disabled tool cannot be "opened", so it cannot be ranked up.
 */
export async function recordToolOpen(ctx: Ctx, key: string): Promise<{ key: string; openCount: number }> {
  const def = TOOLS.find((tool) => tool.key === key);
  if (!def) throw new AppError('Unknown tool.', 404, 'NOT_FOUND');
  const resolved = resolveTool(def, ctx);
  if (!resolved || resolved.status !== 'AVAILABLE') {
    throw new AppError('This tool is not available to you.', 409, 'TOOL_UNAVAILABLE');
  }
  await enforceRateLimit(keyFor('tool:open', ctx.userId), { limit: 300, windowSec: 3600 }, 'Too many requests.');
  const [row] = await db
    .insert(t.toolUsage)
    .values({ institutionId: ctx.institutionId, userId: ctx.userId, toolKey: key })
    .onConflictDoUpdate({
      target: [t.toolUsage.userId, t.toolUsage.toolKey],
      set: { openCount: sql`${t.toolUsage.openCount} + 1`, lastOpenedAt: new Date() },
    })
    .returning({ openCount: t.toolUsage.openCount });
  return { key, openCount: row!.openCount };
}
