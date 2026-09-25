'use client';

import * as React from 'react';
import { CheckCheck, Eraser, Save, Undo2 } from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
} from '@/components/ui';
import { cn, percent } from '@/lib/utils';
import { useMutation } from '../_components/useMutation';
import { MutationError } from '../_components/MutationError';

export type MarkStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface RosterStudent {
  studentId: string;
  name: string;
  rollNumber: string;
  avatarUrl: string | null;
  percentageBp: number | null;
  isBelowThreshold: boolean;
}

const OPTIONS: { value: MarkStatus; label: string; short: string; tone: string }[] = [
  { value: 'PRESENT', label: 'Present', short: 'P', tone: 'bg-success text-white border-success' },
  { value: 'ABSENT', label: 'Absent', short: 'A', tone: 'bg-danger text-white border-danger' },
  { value: 'LATE', label: 'Late', short: 'L', tone: 'bg-warning text-white border-warning' },
  { value: 'EXCUSED', label: 'Excused', short: 'E', tone: 'bg-info text-white border-info' },
];

/**
 * The register. Optimised for speed of entry: one tap per student, one tap to
 * mark the whole class present, and a live count that always matches what will
 * be sent. Submit stays disabled until every student has a value, so a partial
 * register can never be filed by accident.
 */
export function AttendanceMarker({
  offeringId,
  offeringLabel,
  date,
  dateLabel,
  timetableEntryId,
  roster,
  minAttendancePercentage,
}: {
  offeringId: string;
  offeringLabel: string;
  date: string;
  dateLabel: string;
  timetableEntryId: string | null;
  roster: RosterStudent[];
  minAttendancePercentage: string;
}) {
  const [marks, setMarks] = React.useState<Record<string, MarkStatus>>({});
  const [topic, setTopic] = React.useState('');
  const [filter, setFilter] = React.useState('');
  const mutation = useMutation<{
    sessionId: string;
    present: number;
    late: number;
    absent: number;
    total: number;
  }>();

  // A different class or date is a different register — never carry marks over.
  React.useEffect(() => {
    setMarks({});
    setTopic('');
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offeringId, date]);

  const counts = React.useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    for (const value of Object.values(marks)) c[value] += 1;
    return c;
  }, [marks]);

  const markedCount = Object.keys(marks).length;
  const remaining = roster.length - markedCount;
  const complete = remaining === 0 && roster.length > 0;

  const visible = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (s) => s.name.toLowerCase().includes(q) || s.rollNumber.toLowerCase().includes(q),
    );
  }, [roster, filter]);

  function setAll(status: MarkStatus) {
    setMarks(Object.fromEntries(roster.map((s) => [s.studentId, status])));
  }

  async function submit() {
    if (!complete) return;
    await mutation.run('/api/faculty/attendance', {
      body: {
        offeringId,
        date,
        timetableEntryId,
        topicCovered: topic.trim() || undefined,
        records: roster.map((s) => ({ studentId: s.studentId, status: marks[s.studentId] })),
      },
    });
  }

  if (roster.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No students are enrolled in this class"
          description="Attendance cannot be taken until the enrolment list is populated. Ask the academic office to enrol the section."
        />
      </Card>
    );
  }

  if (mutation.succeeded && mutation.data) {
    return (
      <Card>
        <div className="p-5">
          <Alert tone="success" title="Register submitted" icon={CheckCheck}>
            {offeringLabel} on {dateLabel}: {mutation.data.present} present, {mutation.data.late}{' '}
            late, {mutation.data.absent} absent, {mutation.data.total} students in total. Percentages
            for this class have been recalculated.
          </Alert>
          <p className="mt-3 text-[12.5px] text-muted">
            To change any of these values now, use a correction — it keeps the original value and
            asks for a reason.
          </p>
          <Button className="mt-3" variant="secondary" icon={Undo2} onClick={() => mutation.reset()}>
            Back to the register
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={offeringLabel}
        description={`${dateLabel} · ${roster.length} students · minimum required ${minAttendancePercentage}%`}
      />

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] bg-surface-muted px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="success">{counts.PRESENT} present</Badge>
          <Badge tone="danger">{counts.ABSENT} absent</Badge>
          <Badge tone="warning">{counts.LATE} late</Badge>
          <Badge tone="info">{counts.EXCUSED} excused</Badge>
          <Badge tone={remaining > 0 ? 'outline' : 'neutral'}>
            {remaining > 0 ? `${remaining} not marked` : 'all marked'}
          </Badge>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="secondary" icon={CheckCheck} onClick={() => setAll('PRESENT')}>
            Mark all present
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Eraser}
            onClick={() => setMarks({})}
            disabled={markedCount === 0}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="border-b border-[hsl(var(--border))] px-4 py-2.5">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or roll number"
          aria-label="Filter students"
        />
      </div>

      <ul className="divide-y divide-[hsl(var(--border))]">
        {visible.map((student) => {
          const value = marks[student.studentId];
          return (
            <li
              key={student.studentId}
              className={cn(
                'flex flex-wrap items-center gap-3 px-4 py-2.5',
                !value && 'bg-surface-muted',
              )}
            >
              <Avatar name={student.name} src={student.avatarUrl} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-default">{student.name}</p>
                <p className="text-[12px] text-muted">
                  {student.rollNumber}
                  {student.percentageBp !== null ? (
                    <>
                      {' · '}
                      <span className={student.isBelowThreshold ? 'text-danger' : 'text-muted'}>
                        {percent(student.percentageBp)} so far
                      </span>
                    </>
                  ) : (
                    ' · no attendance recorded yet'
                  )}
                </p>
              </div>
              <div
                role="radiogroup"
                aria-label={`Attendance for ${student.name}`}
                className="flex shrink-0 overflow-hidden rounded-md border border-[hsl(var(--border-strong))]"
              >
                {OPTIONS.map((option) => {
                  const active = value === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={option.label}
                      onClick={() =>
                        setMarks((prev) => ({ ...prev, [student.studentId]: option.value }))
                      }
                      className={cn(
                        'h-8 w-9 border-r border-[hsl(var(--border))] text-[12.5px] font-semibold transition-colors last:border-r-0',
                        active
                          ? option.tone
                          : 'bg-surface text-subtle hover:bg-surface-sunken hover:text-default',
                      )}
                    >
                      {option.short}
                      <span className="sr-only"> {option.label}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="px-4 py-6 text-center text-[13px] text-muted">
            No student matches &ldquo;{filter}&rdquo;.
          </li>
        ) : null}
      </ul>

      <div className="space-y-3 border-t border-[hsl(var(--border))] bg-surface-muted px-4 py-3.5">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic covered today (optional)"
          aria-label="Topic covered"
          maxLength={280}
        />
        <MutationError error={mutation.error} title="The register was not submitted" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-muted">
            {complete
              ? `Ready to submit ${roster.length} records.`
              : `${remaining} of ${roster.length} students still need a value.`}
          </p>
          <Button
            variant="primary"
            icon={Save}
            loading={mutation.pending}
            disabled={!complete}
            onClick={submit}
          >
            {mutation.pending ? 'Submitting register…' : 'Submit register'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
