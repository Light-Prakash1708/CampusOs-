/**
 * "YOUR DAY" — what matters today, in one ranked list.
 * ---------------------------------------------------------------------------
 * Pure: the dashboard gathers real records and this decides order and copy,
 * so the ranking is unit-tested. Every item links somewhere real.
 *
 * Order: urgent (overdue work, attendance below minimum, critical notices)
 * → today by time → tomorrow → the rest. Capped by the caller.
 */

export type TodayKind = 'class' | 'deadline' | 'attendance' | 'event' | 'notice' | 'registration' | 'task' | 'goal';

export interface TodayItem {
  key: string;
  kind: TodayKind;
  /** "09:50", "Due 23:59", "Tomorrow", "Now", "Overdue" … */
  when: string;
  title: string;
  detail: string;
  href: string;
  urgent: boolean;
  /** Sort key within its band (lower first). */
  order: number;
}

export interface TodayInputs {
  today: string; // YYYY-MM-DD in the college's timezone
  nowMinutes: number;
  timeZone: string;
  classes: { key: string; subject: string; room: string | null; start: string; end: string; status: string }[];
  nextClass: { subject: string; room: string | null; start: string; dayLabel: string } | null;
  assignments: { id: string; title: string; subject: string; dueAt: Date | null; submitted: boolean }[];
  attentionSubjects: { offeringId: string; title: string; body: string; critical: boolean }[];
  events: { id: string; title: string; startsAt: Date; venue: string; registered: boolean; registrationDeadline: Date | null; saved: boolean }[];
  notices: { id: string; title: string; critical: boolean; needsAck: boolean }[];
  tasks?: { id: string; title: string; dueDate: string | null; href: string }[];
  goals?: { id: string; title: string; streak: number; href: string; doneToday: boolean }[];
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function localParts(d: Date, timeZone: string): { date: string; minutes: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hhmm = `${get('hour')}:${get('minute')}`;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: toMin(hhmm), hhmm };
}

/** "2026-08-24" → "24 Aug". */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildToday(input: TodayInputs, limit = 7): TodayItem[] {
  const tomorrow = addDays(input.today, 1);
  const out: TodayItem[] = [];

  // Classes still to come today (or in progress).
  for (const c of input.classes) {
    if (c.status === 'CANCELLED') continue;
    const start = toMin(c.start);
    const end = toMin(c.end);
    if (end <= input.nowMinutes) continue;
    const live = start <= input.nowMinutes;
    out.push({
      key: `class-${c.key}`,
      kind: 'class',
      when: live ? 'Now' : c.start.slice(0, 5),
      title: c.subject,
      detail: `${c.room ? `Room ${c.room}` : 'Room not set'}${live ? ` · until ${c.end.slice(0, 5)}` : ''}${c.status === 'ROOM_CHANGED' ? ' · room changed' : ''}`,
      href: '/student/schedule',
      urgent: false,
      order: 100 + start,
    });
  }
  if (!out.some((i) => i.kind === 'class') && input.nextClass) {
    out.push({
      key: 'next-class',
      kind: 'class',
      when: input.nextClass.dayLabel,
      title: `Next class: ${input.nextClass.subject}`,
      detail: `${input.nextClass.start.slice(0, 5)}${input.nextClass.room ? ` · Room ${input.nextClass.room}` : ''}`,
      href: '/student/schedule',
      urgent: false,
      order: 3000,
    });
  }

  // Assignments: overdue (urgent), due today, due tomorrow.
  for (const a of input.assignments) {
    if (a.submitted || !a.dueAt) continue;
    const due = localParts(a.dueAt, input.timeZone);
    const overdue = due.date < input.today || (due.date === input.today && due.minutes < input.nowMinutes);
    if (overdue) {
      out.push({ key: `a-${a.id}`, kind: 'deadline', when: 'Overdue', title: a.title, detail: `${a.subject} · was due ${due.date === input.today ? `at ${due.hhmm}` : shortDate(due.date)}`, href: '/student/assignments', urgent: true, order: 10 });
    } else if (due.date === input.today) {
      out.push({ key: `a-${a.id}`, kind: 'deadline', when: `Due ${due.hhmm}`, title: a.title, detail: a.subject, href: '/student/assignments', urgent: false, order: 100 + due.minutes });
    } else if (due.date === tomorrow) {
      out.push({ key: `a-${a.id}`, kind: 'deadline', when: 'Tomorrow', title: a.title, detail: `${a.subject} · due ${due.hhmm}`, href: '/student/assignments', urgent: false, order: 2000 + due.minutes });
    }
  }

  // Attendance: the advisor's most important items.
  for (const s of input.attentionSubjects.slice(0, 2)) {
    out.push({ key: `att-${s.offeringId}`, kind: 'attendance', when: 'Attendance', title: s.title, detail: s.body, href: `/student/attendance/${s.offeringId}`, urgent: s.critical, order: s.critical ? 20 : 1500 });
  }

  // Events I'm registered for today/tomorrow; saved events whose registration closes within a day.
  for (const e of input.events) {
    const at = localParts(e.startsAt, input.timeZone);
    if (e.registered && (at.date === input.today || at.date === tomorrow)) {
      out.push({ key: `ev-${e.id}`, kind: 'event', when: at.date === input.today ? at.hhmm : 'Tomorrow', title: e.title, detail: `${e.venue} · you’re registered — your pass is ready`, href: `/student/events/${e.id}`, urgent: false, order: at.date === input.today ? 100 + at.minutes : 2000 + at.minutes });
    } else if (!e.registered && e.saved && e.registrationDeadline) {
      const dl = localParts(e.registrationDeadline, input.timeZone);
      if (dl.date === input.today && dl.minutes > input.nowMinutes) {
        out.push({ key: `reg-${e.id}`, kind: 'registration', when: `Closes ${dl.hhmm}`, title: `Register for ${e.title}`, detail: 'Registration closes today', href: `/student/events/${e.id}`, urgent: false, order: 100 + dl.minutes });
      } else if (dl.date === tomorrow) {
        out.push({ key: `reg-${e.id}`, kind: 'registration', when: 'Tomorrow', title: `Register for ${e.title}`, detail: `Registration closes tomorrow at ${dl.hhmm}`, href: `/student/events/${e.id}`, urgent: false, order: 2500 });
      }
    }
  }

  // Notices: critical unread or awaiting acknowledgement.
  for (const n of input.notices) {
    if (!n.critical && !n.needsAck) continue;
    out.push({ key: `n-${n.id}`, kind: 'notice', when: n.critical ? 'Important' : 'Acknowledge', title: n.title, detail: n.needsAck ? 'Your college asked you to acknowledge this notice' : 'Critical notice', href: `/student/announcements#${n.id}`, urgent: n.critical, order: n.critical ? 30 : 1800 });
  }

  // Personal tracker (when enabled): tasks due today, goals not yet checked in.
  for (const t of input.tasks ?? []) {
    if (t.dueDate && t.dueDate > input.today) continue;
    out.push({ key: `t-${t.id}`, kind: 'task', when: t.dueDate && t.dueDate < input.today ? 'Overdue' : 'Today', title: t.title, detail: 'Your task', href: t.href, urgent: false, order: 1200 });
  }
  for (const g of input.goals ?? []) {
    if (g.doneToday) continue;
    out.push({ key: `g-${g.id}`, kind: 'goal', when: g.streak > 0 ? `Day ${g.streak + 1}` : 'Today', title: g.title, detail: g.streak > 0 ? `Keep your ${g.streak}-day streak going` : 'Check in today', href: g.href, urgent: false, order: 1300 });
  }

  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.order - b.order).slice(0, limit);
}
