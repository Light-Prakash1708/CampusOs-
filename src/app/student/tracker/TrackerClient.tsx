'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, Pause, Play, Plus, Trash2, Undo2, Archive } from 'lucide-react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';
import { cn } from '@/lib/utils';
import { CATEGORY_LABEL, GOAL_CATEGORIES } from '@/lib/tracker';

type Result = { xp?: number; milestones?: number[]; count?: number };

/** Live message for screen readers and sighted users after an action. */
function useStatus() {
  const [msg, setMsg] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(id);
  }, [msg]);
  return [msg, setMsg] as const;
}

/* -------------------------------- check-in -------------------------------- */

export function CheckInButton({
  goalId,
  title,
  done,
  unit,
  compact = false,
}: {
  goalId: string;
  title: string;
  /** Today's target already met. */
  done: boolean;
  unit?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const api = useApi<Result>();
  const undo = useApi<Result>();
  const [msg, setMsg] = useStatus();
  const [amount, setAmount] = React.useState('');

  async function checkIn() {
    const res = await api.call(`/api/tracker/goals/${goalId}/checkin`, { amount: unit && amount ? Number(amount) : null, day: 'today' });
    if (res) {
      setAmount('');
      const parts = ['Checked in'];
      if (res.xp) parts.push(`+${res.xp} XP`);
      if (res.milestones?.length) parts.push(`${res.milestones.join(', ')}-day streak bonus`);
      setMsg(parts.join(' · '));
      router.refresh();
    }
  }
  async function undoIt() {
    const res = await undo.call(`/api/tracker/goals/${goalId}/checkin`, {}, 'DELETE');
    if (res) {
      setMsg('Check-in removed');
      router.refresh();
    }
  }

  return (
    <div className={cn('flex flex-col items-stretch gap-1.5', compact ? 'sm:items-end' : '')}>
      <div className="flex flex-wrap items-center gap-2">
        {unit && !done ? (
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Amount in {unit}</span>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder={unit}
              className="h-11 w-24"
            />
          </label>
        ) : null}
        {done ? (
          <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-mint px-3 text-[13px] font-extrabold text-mint-ink">
            <CheckCircle2 size={16} aria-hidden /> Done today
          </span>
        ) : (
          <Button variant="primary" onClick={checkIn} loading={api.loading} className="min-h-[44px]" aria-label={`Check in: ${title}`}>
            <Check size={16} aria-hidden /> Check in
          </Button>
        )}
        {done ? (
          <Button variant="ghost" onClick={undoIt} loading={undo.loading} className="min-h-[44px]" aria-label={`Undo today’s check-in: ${title}`}>
            <Undo2 size={15} aria-hidden /> Undo
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="min-h-[1em] text-[12px] font-bold text-mint-ink">
        {msg}
      </p>
      <ErrorBox error={api.error ?? undo.error} />
    </div>
  );
}

/* ---------------------------------- tasks --------------------------------- */

export interface TaskView {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  overdue: boolean;
}

export function TaskPanel({ tasks, today, autoFocus = false }: { tasks: TaskView[]; today: string; autoFocus?: boolean }) {
  const router = useRouter();
  const api = useApi<{ id: string }>();
  const [title, setTitle] = React.useState('');
  const [due, setDue] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await api.call('/api/tracker/tasks', { title: title.trim(), dueDate: due || null });
    if (res) {
      setTitle('');
      setDue('');
      router.refresh();
    }
  }

  async function mutate(id: string, method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/tracker/tasks/${id}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) setError(json.error?.message ?? 'That didn’t work. Try again.');
      else router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex flex-wrap items-end gap-2" aria-label="Add a task">
        <label className="min-w-[180px] flex-1">
          <span className="sr-only">New task</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" maxLength={120} autoFocus={autoFocus} className="h-11" />
        </label>
        <label>
          <span className="sr-only">Due date (optional)</span>
          <Input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className="h-11 w-[150px]" />
        </label>
        <Button type="submit" variant="primary" loading={api.loading} disabled={!title.trim()} className="min-h-[44px]">
          <Plus size={16} aria-hidden /> Add
        </Button>
      </form>
      <ErrorBox error={api.error ?? (error ? { message: error } : null)} />

      {open.length === 0 && done.length === 0 ? (
        <p className="text-[13px] text-subtle">No tasks yet. Add the next small thing you need to do.</p>
      ) : null}
      <ul className="divide-y divide-[hsl(var(--border))]" aria-label="Open tasks">
        {open.map((t) => (
          <TaskRow key={t.id} task={t} today={today} busy={busy === t.id} onToggle={() => mutate(t.id, 'PATCH', { done: true })} onDelete={() => mutate(t.id, 'DELETE')} />
        ))}
      </ul>
      {done.length ? (
        <details className="rounded-xl border border-[hsl(var(--border))]">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-[12.5px] font-bold text-muted">Done in the last 7 days ({done.length})</summary>
          <ul className="divide-y divide-[hsl(var(--border))] px-1">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} today={today} busy={busy === t.id} onToggle={() => mutate(t.id, 'PATCH', { done: false })} onDelete={() => mutate(t.id, 'DELETE')} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function TaskRow({ task, today, busy, onToggle, onDelete }: { task: TaskView; today: string; busy: boolean; onToggle: () => void; onDelete: () => void }) {
  const dueLabel = task.dueDate ? (task.dueDate === today ? 'Today' : task.overdue ? `Overdue · ${fmt(task.dueDate)}` : fmt(task.dueDate)) : null;
  return (
    <li className="flex items-center gap-2 py-1">
      <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={task.done} onChange={onToggle} disabled={busy} className="h-5 w-5 accent-[hsl(var(--brand))]" />
        <span className="min-w-0">
          <span className={cn('block truncate text-[13.5px] font-semibold', task.done ? 'text-subtle line-through' : 'text-default')}>{task.title}</span>
          {dueLabel ? <span className={cn('text-[11.5px] font-bold', task.overdue ? 'text-coral-ink' : 'text-subtle')}>{dueLabel}</span> : null}
        </span>
      </label>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-subtle hover:bg-surface-sunken hover:text-default"
        aria-label={`Delete task: ${task.title}`}
      >
        <Trash2 size={15} aria-hidden />
      </button>
    </li>
  );
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/* -------------------------------- goal form -------------------------------- */

export function GoalForm() {
  const router = useRouter();
  const api = useApi<{ id: string }>();
  const [f, setF] = React.useState({ title: '', description: '', category: 'STUDY', cadence: 'DAILY', target: '1', unit: '', targetDate: '', steps: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await api.call('/api/tracker/goals', {
      title: f.title,
      description: f.description || null,
      category: f.category,
      cadence: f.cadence,
      targetPerPeriod: f.cadence === 'ONCE' ? 1 : Number(f.target || 1),
      unit: f.unit || null,
      targetDate: f.targetDate || null,
      steps: f.cadence === 'ONCE' ? f.steps.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
    });
    if (res) {
      router.push(`/student/tracker/${res.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="What do you want to do?" htmlFor="g-title" required error={api.fieldError('title')}>
        <Input id="g-title" value={f.title} onChange={set('title')} maxLength={120} placeholder="e.g. Practise DSA problems" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind" htmlFor="g-cadence">
          <Select id="g-cadence" value={f.cadence} onChange={set('cadence')}>
            <option value="DAILY">A daily habit</option>
            <option value="WEEKLY">Some days each week</option>
            <option value="ONCE">A one-off goal with steps</option>
          </Select>
        </Field>
        <Field label="Category" htmlFor="g-cat">
          <Select id="g-cat" value={f.category} onChange={set('category')}>
            {GOAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {f.cadence !== 'ONCE' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={f.cadence === 'DAILY' ? 'Check-ins per day' : 'Days per week'}
            htmlFor="g-target"
            hint={f.cadence === 'DAILY' ? 'Usually 1.' : 'Between 1 and 7.'}
            error={api.fieldError('targetPerPeriod')}
          >
            <Input id="g-target" type="number" min={1} max={f.cadence === 'WEEKLY' ? 7 : 20} value={f.target} onChange={set('target')} />
          </Field>
          <Field label="Track an amount (optional)" htmlFor="g-unit" hint="e.g. minutes, pages, problems">
            <Input id="g-unit" value={f.unit} onChange={set('unit')} maxLength={24} placeholder="minutes" />
          </Field>
        </div>
      ) : (
        <Field label="Steps" htmlFor="g-steps" hint="One per line. You can add more later.">
          <Textarea id="g-steps" rows={4} value={f.steps} onChange={set('steps')} placeholder={'Pick a course\nFinish week 1\nBuild the mini-project'} />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target date (optional)" htmlFor="g-date" error={api.fieldError('targetDate')}>
          <Input id="g-date" type="date" value={f.targetDate} onChange={set('targetDate')} />
        </Field>
      </div>
      <Field label="Why it matters (optional)" htmlFor="g-desc">
        <Textarea id="g-desc" rows={2} value={f.description} onChange={set('description')} maxLength={1000} />
      </Field>
      <p className="text-[12.5px] text-muted">Only you can see your goals. You can delete them — or all your tracker data — at any time.</p>
      <ErrorBox error={api.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} className="min-h-[44px]">
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={api.loading} className="min-h-[44px]">
          Create goal
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------ goal actions ------------------------------- */

export function GoalActions({ goalId, status, canComplete }: { goalId: string; status: 'ACTIVE' | 'PAUSED' | 'COMPLETED'; canComplete: boolean }) {
  const router = useRouter();
  const api = useApi<{ id: string; xp?: number }>();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [msg, setMsg] = useStatus();

  async function patch(body: unknown) {
    if (await api.call(`/api/tracker/goals/${goalId}`, body, 'PATCH')) router.refresh();
  }
  async function complete() {
    const res = await api.call(`/api/tracker/goals/${goalId}/complete`, {});
    if (res) {
      setMsg(res.xp ? `Goal complete · +${res.xp} XP` : 'Goal complete');
      router.refresh();
    }
  }
  async function remove() {
    if (await api.call(`/api/tracker/goals/${goalId}`, {}, 'DELETE')) {
      router.push('/student/tracker');
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== 'COMPLETED' && canComplete ? (
          <Button variant="primary" onClick={complete} loading={api.loading} className="min-h-[44px]">
            <CheckCircle2 size={15} aria-hidden /> Mark complete
          </Button>
        ) : null}
        {status === 'ACTIVE' ? (
          <Button variant="secondary" onClick={() => patch({ status: 'PAUSED' })} className="min-h-[44px]">
            <Pause size={15} aria-hidden /> Pause
          </Button>
        ) : status === 'PAUSED' ? (
          <Button variant="secondary" onClick={() => patch({ status: 'ACTIVE' })} className="min-h-[44px]">
            <Play size={15} aria-hidden /> Resume
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => patch({ status: 'ARCHIVED' }).then(() => router.push('/student/tracker'))} className="min-h-[44px]">
          <Archive size={15} aria-hidden /> Archive
        </Button>
        {confirmDelete ? (
          <>
            <Button variant="danger" onClick={remove} className="min-h-[44px]">
              Delete goal and its history
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} className="min-h-[44px]">
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="min-h-[44px]">
            <Trash2 size={15} aria-hidden /> Delete
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" className="min-h-[1em] text-[12.5px] font-bold text-mint-ink">
        {msg}
      </p>
      <ErrorBox error={api.error} />
    </div>
  );
}

/* ---------------------------------- steps ---------------------------------- */

export function StepsEditor({ goalId, steps, locked }: { goalId: string; steps: { id: string; title: string; done: boolean }[]; locked: boolean }) {
  const router = useRouter();
  const api = useApi<{ id: string }>();
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (await api.call(`/api/tracker/goals/${goalId}/steps`, { title: title.trim() })) {
      setTitle('');
      router.refresh();
    }
  }
  async function mutate(id: string, method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(id);
    await fetch(`/api/tracker/steps/${id}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => undefined);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {steps.length === 0 ? <p className="text-[13px] text-subtle">No steps yet. Break the goal into a few small ones.</p> : null}
      <ul className="divide-y divide-[hsl(var(--border))]">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={s.done} disabled={locked || busy === s.id} onChange={() => mutate(s.id, 'PATCH', { done: !s.done })} className="h-5 w-5 accent-[hsl(var(--brand))]" />
              <span className={cn('text-[13.5px] font-semibold', s.done ? 'text-subtle line-through' : 'text-default')}>{s.title}</span>
            </label>
            {!locked ? (
              <button type="button" onClick={() => mutate(s.id, 'DELETE')} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-subtle hover:text-default" aria-label={`Delete step: ${s.title}`}>
                <Trash2 size={15} aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!locked ? (
        <form onSubmit={add} className="flex gap-2" aria-label="Add a step">
          <label className="flex-1">
            <span className="sr-only">New step</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a step…" maxLength={120} className="h-11" />
          </label>
          <Button type="submit" variant="secondary" loading={api.loading} disabled={!title.trim()} className="min-h-[44px]">
            <Plus size={15} aria-hidden /> Add
          </Button>
        </form>
      ) : null}
      <ErrorBox error={api.error} />
    </div>
  );
}
