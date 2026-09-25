import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { offlineProposal, __setAiProvider } from '@/services/ai/providers';
import { toolsForUser, executeTool } from '@/services/ai/tools';
import { decideAction, proposeAction } from '@/services/ai/actions';
import { askInConversation, deleteAllConversations, deleteConversation, getConversation, listConversations } from '@/services/ai/conversations';
import { createGoal } from '@/services/tracker';
import { createBook, issueLoan } from '@/services/library';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/* --------------------------------- pure ----------------------------------- */

describe('offline proposal parsing', () => {
  const all = new Set(['propose_task', 'propose_goal_checkin', 'propose_library_renewal']);
  it('turns requests to change something into proposals, and leaves questions alone', () => {
    expect(offlineProposal('Add a task to email the placement cell', all)).toEqual({ tool: 'propose_task', input: { title: 'Email the placement cell', dueDate: null } });
    const tmr = offlineProposal('remind me to submit the form tomorrow', all);
    expect(tmr?.input.title).toBe('Submit the form');
    expect(tmr?.input.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(offlineProposal('Renew my library book "Corporate Finance"', all)).toEqual({ tool: 'propose_library_renewal', input: { book: 'Corporate Finance' } });
    expect(offlineProposal('check in my reading habit', all)).toEqual({ tool: 'propose_goal_checkin', input: { goal: 'reading' } });
    expect(offlineProposal('What assignments are due this week?', all)).toBeNull();
    expect(offlineProposal('When is the event check-in desk open?', all)).toBeNull();
    // Not offered → not proposed.
    expect(offlineProposal('Add a task to call home', new Set())).toBeNull();
  });
});

/* ------------------------------ integration ------------------------------- */

let A: TestTenant;
let B: TestTenant;

beforeAll(async () => {
  __setAiProvider(null); // the offline provider: deterministic, no network
  A = await createTenant();
  B = await createTenant();
  for (const id of [A.id, B.id]) {
    await db
      .update(t.institutions)
      .set({ featureFlags: { ai_assistant_enabled: true, personal_tracker_enabled: true, library_enabled: true } })
      .where(eq(t.institutions.id, id));
  }
});

afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

const student = async (tenant: TestTenant = A) => ctxFor((await createUser(tenant)).id);

describe('confirm before change', () => {
  it('offers proposal tools only when the module is on for that person', async () => {
    const s = await student();
    const names = toolsForUser(s).map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['propose_task', 'propose_goal_checkin', 'propose_library_renewal']));
    const faculty = await ctxFor((await createUser(A, { role: 'FACULTY' })).id);
    expect(toolsForUser(faculty).map((x) => x.name)).not.toContain('propose_task');
    const off = { ...s, featureFlags: { ai_assistant_enabled: true } };
    expect(toolsForUser(off).map((x) => x.name)).not.toContain('propose_task');
    const r = await executeTool('propose_task', { title: 'x y' }, { user: off });
    expect(r.isError).toBe(true);
  });

  it('records a proposal, changes nothing until confirmed, runs once, and only for its owner', async () => {
    const s = await student();
    const before = await db.select().from(t.trackerTasks).where(eq(t.trackerTasks.userId, s.userId));
    expect(before).toHaveLength(0);
    const turn = await askInConversation(s, 'Add a task to email the placement cell');
    expect(turn.actions).toHaveLength(1);
    expect(turn.actions[0]).toMatchObject({ status: 'PROPOSED', summary: 'Add “Email the placement cell” to your to-do list' });
    expect(turn.answer.text).toMatch(/Nothing has changed yet/);
    expect(await db.select().from(t.trackerTasks).where(eq(t.trackerTasks.userId, s.userId))).toHaveLength(0);

    const other = await student();
    await expect(decideAction(other, turn.actions[0]!.id, 'confirm', meta())).rejects.toThrow(/not found/i);

    const [r1, r2] = await Promise.allSettled([decideAction(s, turn.actions[0]!.id, 'confirm', meta()), decideAction(s, turn.actions[0]!.id, 'confirm', meta())]);
    const results = [r1, r2];
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const tasks = await db.select().from(t.trackerTasks).where(eq(t.trackerTasks.userId, s.userId));
    expect(tasks.map((x) => x.title)).toEqual(['Email the placement cell']);
    const [audit] = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.entityId, turn.actions[0]!.id), eq(t.auditLogs.action, 'AI_ACTION_CONFIRMED')));
    expect(audit).toBeTruthy();
  });

  it('resolves names only against the person’s own records', async () => {
    const owner = await student();
    const intruder = await student();
    await createGoal(owner, { title: 'Morning reading', category: 'READING', cadence: 'DAILY', targetPerPeriod: 1 });
    const p1 = await proposeAction(intruder, 'goal_checkin', { goal: 'reading' }, null);
    expect(p1).toMatchObject({ ok: false, id: null });
    const p2 = await proposeAction(owner, 'goal_checkin', { goal: 'reading' }, null);
    expect(p2.ok).toBe(true);
    const done = await decideAction(owner, p2.id!, 'confirm', meta());
    expect(done.status).toBe('EXECUTED');
    expect(await db.select().from(t.trackerCheckins).where(eq(t.trackerCheckins.userId, owner.userId))).toHaveLength(1);
  });

  it('renews a library book through the same rules as the button, and records failures honestly', async () => {
    const desk = await ctxFor((await createUser(A, { role: 'ADMIN' })).id);
    const u = await createUser(A);
    const s = await ctxFor(u.id);
    const { id: bookId } = await createBook(desk, { title: 'Corporate Finance Essentials', totalCopies: 1 }, meta());
    await issueLoan(desk, { bookId, borrower: u.email }, meta());
    const p = await proposeAction(s, 'renew_library_loan', { book: 'corporate finance' }, null);
    expect(p.summary).toMatch(/Renew “Corporate Finance Essentials”/);
    // Someone reserves it before confirmation: renewing is no longer allowed.
    const waiting = await student();
    await import('@/services/library').then((m) => m.reserveBook(waiting, bookId));
    const res = await decideAction(s, p.id!, 'confirm', meta());
    expect(res.status).toBe('FAILED');
    expect(String(res.result?.error)).toMatch(/waiting/);
  });

  it('dismisses, and expires after a day', async () => {
    const s = await student();
    const a = await proposeAction(s, 'create_task', { title: 'Dismiss me' }, null);
    expect((await decideAction(s, a.id!, 'dismiss', meta())).status).toBe('REJECTED');
    await expect(decideAction(s, a.id!, 'confirm', meta())).rejects.toThrow(/already been handled/);
    const b = await proposeAction(s, 'create_task', { title: 'Old one' }, null);
    await db.update(t.aiActions).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(t.aiActions.id, b.id!));
    await expect(decideAction(s, b.id!, 'confirm', meta())).rejects.toThrow(/expired/);
    expect(await db.select().from(t.trackerTasks).where(eq(t.trackerTasks.userId, s.userId))).toHaveLength(0);
  });
});

describe('conversations', () => {
  it('stores turns, uses stored history, and is private to its owner', async () => {
    const s = await student();
    const first = await askInConversation(s, 'What classes do I have tomorrow?');
    const second = await askInConversation(s, 'And what is due this week?', { conversationId: first.conversationId });
    expect(second.conversationId).toBe(first.conversationId);
    const conv = await getConversation(s, first.conversationId);
    expect(conv.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(conv.title).toBe('What classes do I have tomorrow?');
    expect((await listConversations(s)).map((c) => c.id)).toEqual([first.conversationId]);

    const other = await student();
    const outsider = await student(B);
    for (const x of [other, outsider]) {
      await expect(getConversation(x, first.conversationId)).rejects.toThrow(/not found/i);
      await expect(askInConversation(x, 'hello there', { conversationId: first.conversationId })).rejects.toThrow(/not found/i);
      await expect(deleteConversation(x, first.conversationId)).rejects.toThrow(/not found/i);
      expect(await listConversations(x)).toHaveLength(0);
    }
  });

  it('shows proposals with their current status when a conversation is reopened, and deletes cleanly', async () => {
    const s = await student();
    const turn = await askInConversation(s, 'Add a task to book the seminar hall');
    await decideAction(s, turn.actions[0]!.id, 'confirm', meta());
    const conv = await getConversation(s, turn.conversationId);
    expect(conv.messages[1]!.actions[0]).toMatchObject({ status: 'EXECUTED' });
    await askInConversation(s, 'What is due this week?');
    expect(await listConversations(s)).toHaveLength(2);
    expect((await deleteAllConversations(s)).deleted).toBe(2);
    expect(await db.select().from(t.aiMessages).where(eq(t.aiMessages.conversationId, turn.conversationId))).toHaveLength(0);
  });
});
