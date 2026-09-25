'use client';

import * as React from 'react';
import { AlertTriangle, ArrowUp, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Alert, Badge, Button, Card, CardBody, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Citation { type: string; label: string; href?: string }
interface Turn {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  grounded?: boolean;
  toolsUsed?: string[];
  error?: boolean;
}

/**
 * Assistant chat.
 *
 * Two things are always visible: which institutional records the answer came
 * from, and whether the answer was grounded in a lookup at all. An answer with
 * no citations is shown as such rather than presented with false confidence.
 */
export function AssistantChat({
  initialQuestion,
  usingLanguageModel,
  suggestions,
}: {
  initialQuestion: string;
  usingLanguageModel: boolean;
  suggestions: string[];
}) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState(initialQuestion);
  const [loading, setLoading] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  const sentInitial = React.useRef(false);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, loading]);

  const ask = React.useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || loading) return;

      setTurns((prev) => [...prev, { role: 'user', content: trimmed }]);
      setInput('');
      setLoading(true);

      try {
        const history = turns.slice(-6).map((turn) => ({
          role: turn.role,
          content: turn.content,
        }));
        const res = await fetch('/api/ai/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: trimmed, history }),
        });
        const json = await res.json();

        if (!json.ok) {
          setTurns((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}`,
              error: true,
            },
          ]);
          return;
        }

        setTurns((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: json.data.text,
            citations: json.data.citations,
            grounded: json.data.grounded,
            toolsUsed: json.data.toolsUsed,
          },
        ]);
      } catch {
        setTurns((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Could not reach the server. Check your connection and try again.',
            error: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, turns],
  );

  React.useEffect(() => {
    if (initialQuestion && !sentInitial.current) {
      sentInitial.current = true;
      void ask(initialQuestion);
    }
  }, [initialQuestion, ask]);

  return (
    <div className="mx-auto max-w-3xl">
      {!usingLanguageModel ? (
        <Alert tone="info" className="mb-4" icon={Sparkles} title="Offline assistant">
          No language-model API key is configured, so this assistant matches your question to a
          fixed set of database lookups and reports what it finds. It will not speculate — if it
          cannot match your question it says so.
        </Alert>
      ) : null}

      <div className="space-y-4">
        {turns.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[13.5px] text-muted">
                Ask about anything in your institution&apos;s records.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-surface-sunken hover:text-default"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {turns.map((turn, i) => (
          <div
            key={i}
            className={cn('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-xl px-4 py-3',
                turn.role === 'user'
                  ? 'bg-brand text-white'
                  : turn.error
                    ? 'border border-[hsl(var(--danger-border))] bg-danger-subtle'
                    : 'border border-[hsl(var(--border))] bg-surface-raised',
              )}
            >
              <p
                className={cn(
                  'whitespace-pre-wrap text-[13.5px] leading-relaxed',
                  turn.role === 'user' ? 'text-white' : 'text-default',
                )}
              >
                {turn.content}
              </p>

              {turn.role === 'assistant' && !turn.error ? (
                <div className="mt-2.5 border-t border-[hsl(var(--border))] pt-2">
                  {turn.citations && turn.citations.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-subtle">Based on:</span>
                      {turn.citations.map((c, j) =>
                        c.href ? (
                          <Link
                            key={j}
                            href={c.href}
                            className="inline-flex items-center gap-1 rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[11px] text-muted hover:text-brand"
                          >
                            {c.label}
                            <ExternalLink size={9} />
                          </Link>
                        ) : (
                          <span
                            key={j}
                            className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[11px] text-muted"
                          >
                            {c.label}
                          </span>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-warning">
                      No institutional records were used for this answer.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {loading ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-surface-raised px-4 py-3">
              <Loader2 size={14} className="animate-spin text-subtle" />
              <span className="text-[13px] text-muted">Looking that up…</span>
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-20 mt-5 lg:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-[hsl(var(--border-strong))] bg-surface p-2 shadow-sm">
          <Textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            placeholder="Ask about schedules, workload, rooms, cases…"
            className="max-h-40 min-h-[38px] resize-none border-0 bg-transparent focus:ring-0"
          />
          <Button
            type="submit"
            variant="primary"
            size="icon"
            disabled={!input.trim() || loading}
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-subtle">
          The assistant reads records you are permitted to see. It cannot change anything —
          proposed changes always go through approval.
        </p>
      </form>
    </div>
  );
}
