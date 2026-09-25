import { describe, it, expect } from 'vitest';
import { buildToday, type TodayInputs } from '@/lib/today';

const TZ = 'Asia/Kolkata';
// 2026-09-25 10:30 IST
const base: TodayInputs = {
  today: '2026-09-25',
  nowMinutes: 10 * 60 + 30,
  timeZone: TZ,
  classes: [],
  nextClass: null,
  assignments: [],
  attentionSubjects: [],
  events: [],
  notices: [],
};
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('Your Day', () => {
  it('lists remaining classes by time, marks the live one, skips finished and cancelled', () => {
    const items = buildToday({
      ...base,
      classes: [
        { key: 'a', subject: 'Economics', room: 'A103', start: '09:00:00', end: '09:50:00', status: 'SCHEDULED' },
        { key: 'b', subject: 'Finance', room: 'B207', start: '10:00:00', end: '10:50:00', status: 'SCHEDULED' },
        { key: 'c', subject: 'Statistics', room: null, start: '12:00:00', end: '12:50:00', status: 'ROOM_CHANGED' },
        { key: 'd', subject: 'Law', room: 'C1', start: '14:00:00', end: '14:50:00', status: 'CANCELLED' },
      ],
    });
    expect(items.map((i) => [i.title, i.when])).toEqual([
      ['Finance', 'Now'],
      ['Statistics', '12:00'],
    ]);
    expect(items[1]!.detail).toContain('room changed');
  });

  it('falls back to the next class when nothing is left today', () => {
    const items = buildToday({ ...base, nextClass: { subject: 'Economics', room: 'A103', start: '09:00:00', dayLabel: 'Monday' } });
    expect(items[0]).toMatchObject({ kind: 'class', when: 'Monday', title: 'Next class: Economics' });
  });

  it('puts urgent items first: overdue work, critical attendance, critical notices', () => {
    const items = buildToday({
      ...base,
      classes: [{ key: 'b', subject: 'Finance', room: 'B207', start: '11:00:00', end: '11:50:00', status: 'SCHEDULED' }],
      assignments: [
        { id: '1', title: 'Case study', subject: 'Marketing', dueAt: ist('2026-09-24T23:59:00'), submitted: false },
        { id: '2', title: 'Essay', subject: 'English', dueAt: ist('2026-09-25T17:00:00'), submitted: false },
        { id: '3', title: 'Quiz', subject: 'Maths', dueAt: ist('2026-09-26T09:00:00'), submitted: false },
        { id: '4', title: 'Done', subject: 'X', dueAt: ist('2026-09-25T12:00:00'), submitted: true },
      ],
      attentionSubjects: [{ offeringId: 'o1', title: 'Attend the next 3 Economics classes', body: '…', critical: true }],
      notices: [
        { id: 'n1', title: 'Exam moved', critical: true, needsAck: false },
        { id: 'n2', title: 'Policy', critical: false, needsAck: true },
        { id: 'n3', title: 'FYI', critical: false, needsAck: false },
      ],
    }, 20);
    expect(items.slice(0, 3).map((i) => i.key)).toEqual(['a-1', 'att-o1', 'n-n1']);
    expect(items.every((i) => i.key !== 'a-4' && i.key !== 'n-n3')).toBe(true);
    const essay = items.find((i) => i.key === 'a-2')!;
    expect(essay.when).toBe('Due 17:00');
    expect(items[0]!.detail).toBe('Marketing · was due 24 Sept');
    expect(items.find((i) => i.key === 'a-3')!.when).toBe('Tomorrow');
    expect(items.indexOf(essay)).toBeLessThan(items.findIndex((i) => i.key === 'a-3')); // today before tomorrow
  });

  it('shows my events today/tomorrow and saved events whose registration is closing', () => {
    const items = buildToday({
      ...base,
      events: [
        { id: 'e1', title: 'Hackathon', startsAt: ist('2026-09-25T18:00:00'), venue: 'Hall B', registered: true, registrationDeadline: null, saved: true },
        { id: 'e2', title: 'MUN', startsAt: ist('2026-10-10T10:00:00'), venue: 'KSM', registered: false, registrationDeadline: ist('2026-09-25T23:00:00'), saved: true },
        { id: 'e3', title: 'Fest', startsAt: ist('2026-10-12T10:00:00'), venue: 'X', registered: false, registrationDeadline: ist('2026-09-25T09:00:00'), saved: true },
        { id: 'e4', title: 'Talk', startsAt: ist('2026-10-01T10:00:00'), venue: 'Y', registered: true, registrationDeadline: null, saved: false },
      ],
    });
    expect(items.map((i) => [i.key, i.when])).toEqual([
      ['ev-e1', '18:00'],
      ['reg-e2', 'Closes 23:00'],
    ]);
  });

  it('includes tracker tasks and goals when provided, and respects the limit', () => {
    const items = buildToday({
      ...base,
      tasks: [{ id: 't1', title: 'Revise ch. 3', dueDate: '2026-09-25', href: '/student/tracker' }, { id: 't2', title: 'Later', dueDate: '2026-09-30', href: '/x' }],
      goals: [{ id: 'g1', title: 'Read 20 pages', streak: 4, href: '/student/tracker/goals/g1', doneToday: false }, { id: 'g2', title: 'Done', streak: 1, href: '/y', doneToday: true }],
    });
    expect(items.map((i) => [i.key, i.when])).toEqual([
      ['t-t1', 'Today'],
      ['g-g1', 'Day 5'],
    ]);
    expect(buildToday({ ...base, notices: Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: 'n', critical: true, needsAck: false })) }).length).toBe(7);
  });
});

describe('display formatting is timezone-stable', () => {
  it('formats instants in the display timezone, not the server’s', async () => {
    const { formatDate, formatDateTime } = await import('@/lib/utils');
    const late = new Date('2026-09-25T18:30:00Z'); // 00:00 on the 26th in India
    expect(formatDate(late)).toBe('26 Sept 2026');
    expect(formatDateTime(late)).toMatch(/^26 Sept 2026, 12:00\s?am$/i);
  });
});
