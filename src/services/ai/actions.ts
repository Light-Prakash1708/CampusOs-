import 'server-only';
import { and, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { ConflictError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { recordAudit } from '@/services/audit';
import { checkInGoal, createTask } from '@/services/tracker';
import { renewLoan } from '@/services/library';

/**
 * AI ACTIONS — confirm before anything changes
 * ---------------------------------------------------------------------------
 * The assistant never changes a record. When someone asks it to do something
 * ("add a task to …", "check in my reading habit", "renew my library book"),
 * a proposal tool records an `ai_actions` row in PROPOSED state:
 *
 *   · the operation and its payload are resolved and VALIDATED on the server,
 *     against the caller's own records (the model can't name someone else's);
 *   · the person sees a card with exactly what will happen, and Confirm/Dismiss;
 *   · Confirm re-validates, then runs the SAME service a button would (so every
 *     rule, rate limit and audit entry applies), and records the result.
 *
 * Proposals expire after 24 hours and can be confirmed once. Only the person
 * who asked can confirm or dismiss.
 */

type Meta = { ipAddress: string | null; userAgent: string | null };
const EXPIRY_MS = 24 * 3600_000;

export type ActionOperation = 'create_task' | 'goal_checkin' | 'renew_library_loan';

interface Resolved {
  ok: boolean;
  payload: Record<string, unknown>;
  summary: string;
  notes?: string;
}

interface ActionDef {
  /** Is this action offered to this person at all? */
  available(ctx: AuthContext): boolean;
  /** Turn the model's loose input into a concrete payload for THIS person, or explain why not. */
  resolve(ctx: AuthContext, input: Record<string, unknown>): Promise<Resolved>;
  execute(ctx: AuthContext, payload: Record<string, unknown>, meta: Meta): Promise<Record<string, unknown>>;
}

const clean = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/<\/?untrusted[^>]*>/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const likeEscape = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

const ACTIONS: Record<ActionOperation, ActionDef> = {
  create_task: {
    available: (ctx) => ctx.portal === 'student' && isEnabled(ctx.featureFlags, 'personal_tracker_enabled'),
    async resolve(_ctx, input) {
      const title = clean(input.title, 120);
      const dueDate = isoDate(input.dueDate);
      if (title.length < 2) return { ok: false, payload: {}, summary: 'Add a task', notes: 'The task needs a title.' };
      return { ok: true, payload: { title, dueDate }, summary: `Add “${title}” to your to-do list${dueDate ? `, due ${dueDate}` : ''}` };
    },
    async execute(ctx, p) {
      const r = await createTask(ctx, { title: String(p.title), dueDate: (p.dueDate as string | null) ?? null });
      return { taskId: r.id, href: '/student/tracker#tasks' };
    },
  },
  goal_checkin: {
    available: (ctx) => ctx.portal === 'student' && isEnabled(ctx.featureFlags, 'personal_tracker_enabled'),
    async resolve(ctx, input) {
      const name = clean(input.goal, 120);
      const goals = await db
        .select({ id: t.trackerGoals.id, title: t.trackerGoals.title })
        .from(t.trackerGoals)
        .where(and(eq(t.trackerGoals.userId, ctx.userId), eq(t.trackerGoals.status, 'ACTIVE'), sql`${t.trackerGoals.cadence} <> 'ONCE'`, name ? ilike(t.trackerGoals.title, likeEscape(name)) : sql`true`))
        .limit(3);
      if (goals.length !== 1) {
        return {
          ok: false,
          payload: {},
          summary: 'Check in to a habit',
          notes: goals.length === 0 ? 'No active habit matches that name.' : `Several habits match: ${goals.map((g) => g.title).join(', ')}. Say which one.`,
        };
      }
      return { ok: true, payload: { goalId: goals[0]!.id }, summary: `Check in today for “${goals[0]!.title}”` };
    },
    async execute(ctx, p) {
      const r = await checkInGoal(ctx, String(p.goalId), { day: 'today' });
      return { count: r.count, xp: r.xp, href: `/student/tracker/${String(p.goalId)}` };
    },
  },
  renew_library_loan: {
    available: (ctx) => isEnabled(ctx.featureFlags, 'library_enabled') && ctx.permissions.has('library:borrow'),
    async resolve(ctx, input) {
      const name = clean(input.book, 200);
      const loans = await db
        .select({ id: t.libraryLoans.id, title: t.libraryBooks.title })
        .from(t.libraryLoans)
        .innerJoin(t.libraryBooks, eq(t.libraryBooks.id, t.libraryLoans.bookId))
        .where(and(eq(t.libraryLoans.userId, ctx.userId), isNull(t.libraryLoans.returnedAt), name ? ilike(t.libraryBooks.title, likeEscape(name)) : sql`true`))
        .limit(3);
      if (loans.length !== 1) {
        return {
          ok: false,
          payload: {},
          summary: 'Renew a library book',
          notes: loans.length === 0 ? 'You have no borrowed book by that name.' : `You have several: ${loans.map((l) => l.title).join(', ')}. Say which one.`,
        };
      }
      return { ok: true, payload: { loanId: loans[0]!.id }, summary: `Renew “${loans[0]!.title}” for another 14 days` };
    },
    async execute(ctx, p, meta) {
      const r = await renewLoan(ctx, String(p.loanId), meta);
      return { dueAt: r.dueAt.toISOString(), href: '/student/library?tab=loans' };
    },
  },
};

export function actionAvailable(ctx: AuthContext, op: ActionOperation): boolean {
  return ACTIONS[op].available(ctx);
}

/** Record a proposal. Nothing changes until the person confirms. */
export async function proposeAction(ctx: AuthContext, op: ActionOperation, input: Record<string, unknown>, conversationId: string | null) {
  const def = ACTIONS[op];
  if (!def.available(ctx)) return { id: null, ok: false, summary: 'Not available', notes: 'That isn’t switched on for you.' };
  const r = await def.resolve(ctx, input);
  if (!r.ok) return { id: null, ok: false, summary: r.summary, notes: r.notes ?? null };
  const [row] = await db
    .insert(t.aiActions)
    .values({
      institutionId: ctx.institutionId,
      requestedById: ctx.userId,
      feature: 'STUDENT_ASSISTANT',
      operation: op,
      payload: { ...r.payload, conversationId },
      predictedImpact: { summary: r.summary },
      validationPassed: true,
      validationNotes: r.notes ?? null,
    })
    .returning({ id: t.aiActions.id });
  return { id: row!.id, ok: true, summary: r.summary, notes: null };
}

export interface ActionView {
  id: string;
  operation: string;
  summary: string;
  status: string;
  createdAt: Date;
  result: Record<string, unknown> | null;
}

function view(a: typeof t.aiActions.$inferSelect): ActionView {
  const expired = a.status === 'PROPOSED' && Date.now() - a.createdAt.getTime() > EXPIRY_MS;
  return {
    id: a.id,
    operation: a.operation,
    summary: String((a.predictedImpact as { summary?: string } | null)?.summary ?? a.operation),
    status: expired ? 'EXPIRED' : a.status,
    createdAt: a.createdAt,
    result: a.executionResult ?? null,
  };
}

export async function listActions(ctx: AuthContext, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select()
    .from(t.aiActions)
    .where(and(inArray(t.aiActions.id, ids), eq(t.aiActions.requestedById, ctx.userId)))
    .orderBy(desc(t.aiActions.createdAt));
  return rows.map(view);
}

export async function decideAction(ctx: AuthContext, actionId: string, decision: 'confirm' | 'dismiss', meta: Meta): Promise<ActionView> {
  // Claim the proposal atomically so a double-click can't run it twice.
  const [a] = await db
    .select()
    .from(t.aiActions)
    .where(and(eq(t.aiActions.id, actionId), eq(t.aiActions.requestedById, ctx.userId), eq(t.aiActions.institutionId, ctx.institutionId)))
    .limit(1);
  if (!a) throw new NotFoundError('Suggested action');
  if (a.status !== 'PROPOSED') throw new ConflictError('This suggestion has already been handled.');
  if (Date.now() - a.createdAt.getTime() > EXPIRY_MS) {
    await db.update(t.aiActions).set({ status: 'EXPIRED' }).where(eq(t.aiActions.id, a.id));
    throw new ConflictError('This suggestion has expired. Ask again if you still want it.');
  }
  const next = decision === 'confirm' ? 'APPROVED' : 'REJECTED';
  const claimed = await db
    .update(t.aiActions)
    .set({ status: next })
    .where(and(eq(t.aiActions.id, a.id), eq(t.aiActions.status, 'PROPOSED')))
    .returning({ id: t.aiActions.id });
  if (!claimed.length) throw new ConflictError('This suggestion has already been handled.');

  if (decision === 'dismiss') {
    await recordAudit(ctx, { action: 'AI_ACTION_REJECTED', entityType: 'ai_action', entityId: a.id, after: { operation: a.operation }, ...meta });
    const [row] = await db.select().from(t.aiActions).where(eq(t.aiActions.id, a.id));
    return view(row!);
  }

  const def = ACTIONS[a.operation as ActionOperation];
  let status: 'EXECUTED' | 'FAILED' = 'FAILED';
  let result: Record<string, unknown>;
  try {
    if (!def || !def.available(ctx)) throw new ConflictError('That action isn’t available any more.');
    result = await def.execute(ctx, a.payload, meta);
    status = 'EXECUTED';
  } catch (error) {
    result = { error: error instanceof Error ? error.message : 'It could not be completed.' };
  }
  const [row] = await db
    .update(t.aiActions)
    .set({ status, executedAt: new Date(), executionResult: result })
    .where(eq(t.aiActions.id, a.id))
    .returning();
  await recordAudit(ctx, { action: 'AI_ACTION_CONFIRMED', entityType: 'ai_action', entityId: a.id, after: { operation: a.operation, status }, ...meta });
  return view(row!);
}
