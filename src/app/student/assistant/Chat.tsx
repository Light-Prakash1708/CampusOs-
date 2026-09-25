'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CornerDownLeft, History, Info, MessageSquarePlus, Sparkles, Trash2, Wand2, Wrench, X } from 'lucide-react';
import { AiLabel, Alert, Badge, Button, Card, CardBody, ErrorState, Textarea } from '@/components/ui';
import { CampusDrawer } from '@/components/campus/overlays';
import { cn } from '@/lib/utils';

interface Citation {
  type: string;
  label: string;
  href?: string;
}

export interface ActionCard {
  id: string;
  operation: string;
  summary: string;
  status: string;
  result: Record<string, unknown> | null;
}

export interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations: Citation[];
  toolsUsed: string[];
  grounded: boolean;
  actions: ActionCard[];
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

const TOOL_LABEL: Record<string, string> = {
  get_schedule: 'timetable',
  get_attendance: 'attendance',
  get_assignments: 'assignments',
  get_recent_changes: 'recent changes',
  get_skill_profile: 'skills',
  search_resources: 'resources',
  get_announcements: 'notices',
  get_room_availability: 'rooms',
  propose_task: 'to-do (proposal)',
  propose_goal_checkin: 'habit (proposal)',
  propose_library_renewal: 'library (proposal)',
};

export function Chat({
  initialQuestion,
  suggestions,
  actionSuggestions,
  studentName,
  conversations,
  initialConversation,
  usingLanguageModel,
}: {
  initialQuestion: string;
  suggestions: string[];
  actionSuggestions: string[];
  studentName: string;
  conversations: ConversationSummary[];
  initialConversation: { id: string; turns: Turn[] } | null;
  usingLanguageModel: boolean;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = React.useState<string | null>(initialConversation?.id ?? null);
  const [turns, setTurns] = React.useState<Turn[]>(initialConversation?.turns ?? []);
  const [input, setInput] = React.useState(initialQuestion);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (initialQuestion) inputRef.current?.focus();
  }, [initialQuestion]);
  React.useEffect(() => {
    if (turns.length > 0) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    setError(null);
    setInput('');
    const userTurn: Turn = { id: `u-${Date.now()}`, role: 'user', text: trimmed, citations: [], toolsUsed: [], grounded: false, actions: [] };
    setTurns((c) => [...c, userTurn]);
    setPending(true);
    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed, conversationId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setError({
          message: payload?.error?.message ?? `The assistant did not answer (HTTP ${response.status}).`,
          hint: payload?.error?.hint ?? 'Your question was not answered. Everything else in CampusOS still works.',
        });
        setInput(trimmed); // keep what they typed
        setTurns((c) => c.filter((x) => x.id !== userTurn.id));
        return;
      }
      const d = payload.data;
      const isNew = !conversationId;
      setConversationId(d.conversationId);
      setTurns((c) => [
        ...c,
        { id: `a-${Date.now()}`, role: 'assistant', text: d.text ?? '', citations: d.citations ?? [], toolsUsed: d.toolsUsed ?? [], grounded: d.grounded === true, actions: d.actions ?? [] },
      ]);
      if (isNew) {
        // Put the new conversation in the address bar and the history list.
        window.history.replaceState(null, '', `/student/assistant?c=${d.conversationId}`);
        router.refresh();
      }
    } catch {
      setError({ message: 'Could not reach the assistant.', hint: 'Check your connection and try again. Nothing was recorded.' });
      setInput(trimmed);
      setTurns((c) => c.filter((x) => x.id !== userTurn.id));
    } finally {
      setPending(false);
    }
  }

  function updateAction(updated: ActionCard) {
    setTurns((c) => c.map((t) => ({ ...t, actions: t.actions.map((a) => (a.id === updated.id ? updated : a)) })));
  }

  function newChat() {
    setConversationId(null);
    setTurns([]);
    setError(null);
    setHistoryOpen(false);
    window.history.replaceState(null, '', '/student/assistant');
    inputRef.current?.focus();
  }

  const history = (
    <HistoryList
      conversations={conversations}
      activeId={conversationId}
      onNew={newChat}
      onDeleted={(id) => {
        if (id === conversationId || id === '*') newChat();
        router.refresh();
      }}
    />
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden lg:block" aria-label="Your conversations">
        <div className="sticky top-20">{history}</div>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <Button variant="secondary" onClick={() => setHistoryOpen(true)} className="min-h-[44px]">
            <History size={15} aria-hidden /> History
          </Button>
          <Button variant="ghost" onClick={newChat} className="min-h-[44px]">
            <MessageSquarePlus size={15} aria-hidden /> New chat
          </Button>
        </div>
        <CampusDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Your conversations" side="left">
          {history}
        </CampusDrawer>

        {!usingLanguageModel ? (
          <Alert tone="warning" icon={Info} title="The offline assistant is running">
            No language model is configured for your college, so answers come from a rule-based assistant that reads your records directly. It is accurate about what it can look up, but it
            can’t reason or write freely. Answers are still cited.
          </Alert>
        ) : null}

        {turns.length === 0 ? (
          <Card>
            <CardBody className="py-7 text-center">
              <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-subtle">
                <Sparkles size={20} className="text-brand" aria-hidden />
              </span>
              <p className="text-sm font-medium text-default">Ask about your own records</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted">
                {studentName}, the assistant reads your timetable, attendance, assignments and the notices addressed to you, and cites them. It can also prepare a few changes for you — nothing
                happens until you confirm.
              </p>
              <div className="mt-5 grid gap-2 text-left sm:mx-auto sm:max-w-lg">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="min-h-[44px] rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-[13px] text-default hover:bg-surface-sunken">
                    {s}
                  </button>
                ))}
                {actionSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-[hsl(var(--border-strong))] px-3 py-2 text-[13px] text-default hover:bg-surface-sunken"
                  >
                    <Wand2 size={14} className="shrink-0 text-brand" aria-hidden /> {s}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4" aria-live="polite">
            {turns.map((turn) =>
              turn.role === 'user' ? (
                <div key={turn.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 text-[13.5px] leading-relaxed text-white">{turn.text}</p>
                </div>
              ) : (
                <Card key={turn.id}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <AiLabel state="generated" />
                      {turn.grounded ? (
                        <Badge tone="success" dot>
                          grounded in your records
                        </Badge>
                      ) : (
                        <Badge tone="warning" dot>
                          no records were read
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2.5 text-[13.5px] leading-relaxed text-default">
                      {turn.text
                        .split(/\n{2,}/)
                        .filter(Boolean)
                        .map((p, i) => (
                          <p key={i} className="whitespace-pre-line">
                            {p}
                          </p>
                        ))}
                    </div>
                    {turn.actions.map((a) => (
                      <ActionConfirm key={a.id} action={a} onChange={updateAction} />
                    ))}
                    {turn.citations.length ? (
                      <div>
                        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Sources</p>
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {turn.citations.map((c, i) => (
                            <li key={`${c.label}-${i}`}>
                              {c.href ? (
                                <Link href={c.href} className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[12px] text-brand hover:bg-surface-sunken">
                                  <span className="text-subtle">{c.type}</span>
                                  {c.label}
                                </Link>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[12px] text-muted">
                                  <span className="text-subtle">{c.type}</span>
                                  {c.label}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {turn.toolsUsed.length ? (
                      <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
                        <Wrench size={11} aria-hidden />
                        Looked up: {turn.toolsUsed.map((x) => TOOL_LABEL[x] ?? x.replace(/_/g, ' ')).join(', ')}
                      </p>
                    ) : null}
                  </CardBody>
                </Card>
              ),
            )}
            {pending ? (
              <Card>
                <CardBody className="flex items-center gap-2.5 py-4">
                  <span className="flex gap-1" aria-hidden>
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand" />
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand [animation-delay:0.2s]" />
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand [animation-delay:0.4s]" />
                  </span>
                  <span className="text-[13px] text-muted">Reading your records…</span>
                </CardBody>
              </Card>
            ) : null}
            <div ref={endRef} />
          </div>
        )}

        {error ? <ErrorState title="The assistant could not answer" message={error.message} hint={error.hint} /> : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="sticky bottom-16 lg:bottom-0"
        >
          <Card className={cn('shadow-sm', pending && 'opacity-90')}>
            <CardBody className="p-3">
              <label htmlFor="ask-input" className="sr-only">
                Your question
              </label>
              <Textarea
                id="ask-input"
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                placeholder="Ask about your timetable, attendance, assignments or notices…"
                maxLength={2000}
                disabled={pending}
                className="border-0 px-1 py-1 focus:ring-0"
              />
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="hidden text-[11.5px] text-subtle sm:block">
                  <CornerDownLeft size={11} className="mr-1 inline" aria-hidden />
                  Enter to send · Shift+Enter for a new line
                </p>
                <Button type="submit" variant="primary" loading={pending} disabled={input.trim().length === 0} className="ml-auto min-h-[44px]">
                  Ask
                </Button>
              </div>
            </CardBody>
          </Card>
        </form>
      </div>
    </div>
  );
}

/* --------------------------- confirm before change -------------------------- */

function ActionConfirm({ action, onChange }: { action: ActionCard; onChange: (a: ActionCard) => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | 'confirm' | 'dismiss'>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function decide(decision: 'confirm' | 'dismiss') {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/ai/actions/${action.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) });
      const json = await res.json().catch(() => null);
      if (!json?.ok) setError(json?.error?.message ?? 'That didn’t work.');
      else {
        onChange(json.data);
        router.refresh();
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  const href = typeof action.result?.href === 'string' ? action.result.href : null;
  const failed = action.status === 'FAILED' ? String(action.result?.error ?? 'It could not be completed.') : null;

  return (
    <div
      className={cn(
        'rounded-xl border-[1.5px] p-3',
        action.status === 'PROPOSED' ? 'border-ink bg-sun shadow-pop' : action.status === 'EXECUTED' ? 'border-ink bg-mint' : 'border-[hsl(var(--border))] bg-surface-sunken',
      )}
      role="group"
      aria-label="Suggested change"
    >
      <p className="text-[11.5px] font-extrabold uppercase tracking-wide text-muted">
        {action.status === 'PROPOSED' ? 'Needs your OK' : action.status === 'EXECUTED' ? 'Done' : action.status === 'REJECTED' ? 'Dismissed' : action.status === 'EXPIRED' ? 'Expired' : 'Didn’t work'}
      </p>
      <p className="mt-0.5 text-[13.5px] font-bold text-default">{action.summary}</p>
      {failed ? <p className="mt-1 text-[12.5px] text-coral-ink">{failed}</p> : null}
      {action.status === 'PROPOSED' ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => decide('confirm')} loading={busy === 'confirm'} disabled={!!busy} className="min-h-[44px]">
            <Check size={15} aria-hidden /> Confirm
          </Button>
          <Button variant="ghost" onClick={() => decide('dismiss')} loading={busy === 'dismiss'} disabled={!!busy} className="min-h-[44px]">
            <X size={15} aria-hidden /> Dismiss
          </Button>
        </div>
      ) : href && action.status === 'EXECUTED' ? (
        <Link href={href} className="mt-1 inline-flex min-h-[36px] items-center text-[12.5px] font-bold text-brand hover:underline">
          Open it
        </Link>
      ) : null}
      {error ? <p className="mt-1 text-[12.5px] font-bold text-coral-ink">{error}</p> : null}
    </div>
  );
}

/* --------------------------------- history --------------------------------- */

function HistoryList({ conversations, activeId, onNew, onDeleted }: { conversations: ConversationSummary[]; activeId: string | null; onNew: () => void; onDeleted: (id: string) => void }) {
  const [confirmAll, setConfirmAll] = React.useState(false);
  async function remove(id: string | '*') {
    const res = await fetch(id === '*' ? '/api/ai/conversations' : `/api/ai/conversations/${id}`, { method: 'DELETE' });
    if (res.ok) onDeleted(id);
    setConfirmAll(false);
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={onNew} className="min-h-[44px] w-full justify-start">
        <MessageSquarePlus size={15} aria-hidden /> New chat
      </Button>
      {conversations.length === 0 ? (
        <p className="px-1 text-[12.5px] text-subtle">Your conversations appear here. Only you can see them.</p>
      ) : (
        <ul className="space-y-1">
          {conversations.map((c) => (
            <li key={c.id} className={cn('group flex items-center rounded-lg', c.id === activeId ? 'bg-lavender' : 'hover:bg-surface-sunken')}>
              <Link
                href={`/student/assistant?c=${c.id}`}
                className="min-h-[44px] min-w-0 flex-1 truncate px-2.5 py-3 text-[13px] font-semibold text-default"
                aria-current={c.id === activeId ? 'page' : undefined}
              >
                {c.title ?? 'Conversation'}
              </Link>
              <button type="button" onClick={() => remove(c.id)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-subtle hover:text-default" aria-label={`Delete “${c.title ?? 'conversation'}”`}>
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {conversations.length ? (
        confirmAll ? (
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Button variant="danger" size="sm" onClick={() => remove('*')}>
              Delete all history
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmAll(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmAll(true)} className="min-h-[44px] px-1 text-[12px] font-bold text-subtle hover:text-default">
            Delete all history…
          </button>
        )
      ) : null}
    </div>
  );
}
