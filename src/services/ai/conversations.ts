import 'server-only';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { askAssistant, type AssistantAnswer } from './assistant';
import { listActions, type ActionView } from './actions';
import type { AiFeature, AiMessage, Citation } from './types';

/**
 * ASSISTANT CONVERSATIONS
 * ---------------------------------------------------------------------------
 * Chat history is kept per person (ai_conversations / ai_messages) so they can
 * come back to it. Only its owner can list, open or delete a conversation;
 * earlier turns are loaded from the database — a client can't inject a fake
 * "assistant said" history. History is in the data export, and the owner can
 * delete one conversation or all of them at any time.
 */

const HISTORY_TURNS = 6;

async function ownConversation(ctx: AuthContext, id: string) {
  const [c] = await db
    .select()
    .from(t.aiConversations)
    .where(and(eq(t.aiConversations.id, id), eq(t.aiConversations.userId, ctx.userId), eq(t.aiConversations.institutionId, ctx.institutionId)))
    .limit(1);
  if (!c) throw new NotFoundError('Conversation');
  return c;
}

function titleFrom(question: string): string {
  const q = question.replace(/\s+/g, ' ').trim();
  return q.length > 60 ? `${q.slice(0, 57).trimEnd()}…` : q;
}

export interface ChatTurn {
  conversationId: string;
  answer: AssistantAnswer;
  actions: ActionView[];
}

export async function askInConversation(ctx: AuthContext, question: string, opts: { conversationId?: string | null; feature?: AiFeature } = {}): Promise<ChatTurn> {
  const conversation = opts.conversationId
    ? await ownConversation(ctx, opts.conversationId)
    : (
        await db
          .insert(t.aiConversations)
          .values({ institutionId: ctx.institutionId, userId: ctx.userId, title: titleFrom(question), feature: opts.feature ?? 'CAMPUS_ASSISTANT' })
          .returning()
      )[0]!;

  const previous = await db
    .select({ role: t.aiMessages.role, content: t.aiMessages.content })
    .from(t.aiMessages)
    .where(eq(t.aiMessages.conversationId, conversation.id))
    .orderBy(desc(t.aiMessages.createdAt))
    .limit(HISTORY_TURNS);
  const history: AiMessage[] = previous
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const answer = await askAssistant(ctx, question, { feature: opts.feature, history, conversationId: conversation.id });

  await db.insert(t.aiMessages).values([
    { institutionId: ctx.institutionId, conversationId: conversation.id, role: 'user', content: question },
    {
      institutionId: ctx.institutionId,
      conversationId: conversation.id,
      role: 'assistant',
      content: answer.text,
      citations: answer.citations as unknown as Record<string, unknown>[],
      toolCalls: [{ tools: answer.toolsUsed, actions: answer.actionIds, grounded: answer.grounded, provider: answer.provider }],
      generationId: answer.generationId,
    },
  ]);
  await db.update(t.aiConversations).set({ updatedAt: new Date() }).where(eq(t.aiConversations.id, conversation.id));
  return { conversationId: conversation.id, answer, actions: await listActions(ctx, answer.actionIds) };
}

export async function listConversations(ctx: AuthContext, limit = 30) {
  return db
    .select({ id: t.aiConversations.id, title: t.aiConversations.title, updatedAt: t.aiConversations.updatedAt })
    .from(t.aiConversations)
    .where(and(eq(t.aiConversations.userId, ctx.userId), eq(t.aiConversations.institutionId, ctx.institutionId)))
    .orderBy(desc(t.aiConversations.updatedAt))
    .limit(Math.min(limit, 100));
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  toolsUsed: string[];
  grounded: boolean;
  actions: ActionView[];
  createdAt: Date;
}

export async function getConversation(ctx: AuthContext, id: string) {
  const c = await ownConversation(ctx, id);
  const rows = await db.select().from(t.aiMessages).where(eq(t.aiMessages.conversationId, c.id)).orderBy(asc(t.aiMessages.createdAt), sql`${t.aiMessages.role} = 'assistant'`).limit(200);
  const allActionIds = rows.flatMap((m) => ((m.toolCalls ?? [])[0] as { actions?: string[] } | undefined)?.actions ?? []);
  const actions = await listActions(ctx, allActionIds);
  const byId = new Map(actions.map((a) => [a.id, a]));
  const messages: StoredMessage[] = rows.map((m) => {
    const meta = ((m.toolCalls ?? [])[0] ?? {}) as { tools?: string[]; actions?: string[]; grounded?: boolean };
    return {
      id: m.id,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
      citations: (m.citations ?? []) as unknown as Citation[],
      toolsUsed: meta.tools ?? [],
      grounded: !!meta.grounded,
      actions: (meta.actions ?? []).map((a) => byId.get(a)).filter((a): a is ActionView => !!a),
      createdAt: m.createdAt,
    };
  });
  return { id: c.id, title: c.title, updatedAt: c.updatedAt, messages };
}

export async function deleteConversation(ctx: AuthContext, id: string) {
  const c = await ownConversation(ctx, id);
  await db.delete(t.aiConversations).where(eq(t.aiConversations.id, c.id)); // messages cascade
  return { deleted: true };
}

export async function deleteAllConversations(ctx: AuthContext) {
  const rows = await db
    .delete(t.aiConversations)
    .where(and(eq(t.aiConversations.userId, ctx.userId), eq(t.aiConversations.institutionId, ctx.institutionId)))
    .returning({ id: t.aiConversations.id });
  return { deleted: rows.length };
}
