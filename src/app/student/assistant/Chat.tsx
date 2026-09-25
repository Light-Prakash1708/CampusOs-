'use client';

import * as React from 'react';
import Link from 'next/link';
import { CornerDownLeft, Info, Sparkles, Wrench } from 'lucide-react';
import {
  AiLabel,
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ErrorState,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/utils';

/* Response envelope from POST /api/ai/ask */
interface Citation {
  type: string;
  label: string;
  href?: string;
}

interface AskResponse {
  ok: boolean;
  data?: {
    text: string;
    citations?: Citation[];
    toolsUsed?: string[];
    grounded?: boolean;
    isLanguageModel?: boolean;
    provider?: string;
  };
  error?: { message?: string; hint?: string };
}

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations: Citation[];
  toolsUsed: string[];
  grounded: boolean;
}

export function Chat({
  initialQuestion,
  suggestions,
  studentName,
}: {
  initialQuestion: string;
  suggestions: string[];
  studentName: string;
}) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState(initialQuestion);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [provider, setProvider] = React.useState<{
    isLanguageModel: boolean;
    name: string;
  } | null>(null);

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

    const history = turns.map((turn) => ({ role: turn.role, content: turn.text }));
    const userTurn: Turn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      citations: [],
      toolsUsed: [],
      grounded: false,
    };
    setTurns((current) => [...current, userTurn]);
    setPending(true);

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed, history }),
      });

      const payload = (await response.json().catch(() => null)) as AskResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setError({
          message:
            payload?.error?.message ?? `The assistant did not answer (HTTP ${response.status}).`,
          hint:
            payload?.error?.hint ??
            'Your question was not answered. Everything else in CampusOS still works.',
        });
        // Keep the question in the box so nothing the user typed is lost.
        setInput(trimmed);
        setTurns((current) => current.filter((t) => t.id !== userTurn.id));
        return;
      }

      setProvider({
        isLanguageModel: payload.data.isLanguageModel !== false,
        name: payload.data.provider ?? 'the configured provider',
      });

      setTurns((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: payload.data?.text ?? '',
          citations: payload.data?.citations ?? [],
          toolsUsed: payload.data?.toolsUsed ?? [],
          grounded: payload.data?.grounded === true,
        },
      ]);
    } catch {
      setError({
        message: 'Could not reach the assistant.',
        hint: 'Check your connection and try again. Nothing was recorded.',
      });
      setInput(trimmed);
      setTurns((current) => current.filter((t) => t.id !== userTurn.id));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {provider && !provider.isLanguageModel ? (
        <Alert tone="warning" icon={Info} title="The offline assistant is running">
          No language model is configured for this institution, so answers come from a rule-based
          fallback that reads your records directly. It is accurate about facts it can look up, but
          it cannot reason or write freely. Answers are still cited.
        </Alert>
      ) : null}

      {/* ------------------------------ Transcript ---------------------------- */}
      {turns.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-subtle">
              <Sparkles size={20} className="text-brand" aria-hidden />
            </span>
            <p className="text-sm font-medium text-default">Ask about your own records</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted">
              {studentName}, the assistant can read your timetable, attendance, assignments and the
              notices addressed to you. It cites the records behind every answer, and it cannot see
              anyone else&rsquo;s data.
            </p>
            <div className="mt-5 flex flex-col items-stretch gap-2 sm:mx-auto sm:max-w-md">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-left text-[13px] text-default transition-colors hover:bg-surface-sunken"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {turns.map((turn) =>
            turn.role === 'user' ? (
              <div key={turn.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 text-[13.5px] leading-relaxed text-white">
                  {turn.text}
                </p>
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
                      .map((paragraph, i) => (
                        <p key={i} className="whitespace-pre-line">
                          {paragraph}
                        </p>
                      ))}
                  </div>

                  {turn.citations.length > 0 ? (
                    <div>
                      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-subtle">
                        Sources
                      </p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {turn.citations.map((citation, i) => (
                          <li key={`${citation.label}-${i}`}>
                            {citation.href ? (
                              <Link
                                href={citation.href}
                                className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[12px] text-brand transition-colors hover:bg-surface-sunken"
                              >
                                <span className="text-subtle">{citation.type}</span>
                                {citation.label}
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[12px] text-muted">
                                <span className="text-subtle">{citation.type}</span>
                                {citation.label}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {turn.toolsUsed.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
                      <Wrench size={11} aria-hidden />
                      Looked up: {turn.toolsUsed.join(', ')}
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

      {/* -------------------------------- Composer ---------------------------- */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(input);
        }}
        className="sticky bottom-16 lg:bottom-0"
      >
        <Card className={cn('shadow-sm', pending && 'opacity-90')}>
          <CardBody className="p-3">
            <Textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void ask(input);
                }
              }}
              placeholder="Ask about your timetable, attendance, assignments or notices…"
              maxLength={1000}
              disabled={pending}
              className="border-0 px-1 py-1 focus:ring-0"
            />
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-[11.5px] text-subtle">
                <CornerDownLeft size={11} className="mr-1 inline" aria-hidden />
                Enter to send · Shift+Enter for a new line
              </p>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={pending}
                disabled={input.trim().length === 0}
              >
                Ask
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
