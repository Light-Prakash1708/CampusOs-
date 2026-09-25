'use client';

import * as React from 'react';
import {
  CalendarX2,
  CheckCircle2,
  ClipboardCheck,
  Search,
  TriangleAlert,
  Users,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { formatDate, formatTime, humanize, pluralize } from '@/lib/utils';
import { useMutation } from '../_components/useMutation';
import { MutationError } from '../_components/MutationError';

interface AffectedClass {
  date: string;
  dayOfWeek: string;
  entryId: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string;
  sectionCode: string;
  roomCode: string | null;
  studentCount: number;
  alreadyCovered: boolean;
  coveredReason: string | null;
}

interface Impact {
  classes: AffectedClass[];
  studentsAffected: number;
  workingDays: number;
  holidays: { date: string; name: string }[];
  warning: string | null;
}

const LEAVE_TYPES = ['CASUAL', 'MEDICAL', 'EARNED', 'DUTY', 'OTHER'] as const;

/**
 * Two deliberate steps: see the impact, then confirm.
 *
 * The classes listed here come from the same server function the submission
 * uses, so what is confirmed is exactly what is recorded against the request
 * for the approver to see.
 */
export function LeaveRequestForm({
  defaultFrom,
  highlightEntryId,
  minDate,
}: {
  defaultFrom: string;
  highlightEntryId: string | null;
  minDate: string;
}) {
  const [leaveType, setLeaveType] = React.useState<string>('CASUAL');
  const [fromDate, setFromDate] = React.useState(defaultFrom);
  const [toDate, setToDate] = React.useState(defaultFrom);
  const [isHalfDay, setIsHalfDay] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [impact, setImpact] = React.useState<Impact | null>(null);

  const preview = useMutation<Impact>({ refresh: false });
  const submit = useMutation<{
    reference: string;
    classesNeedingCover: number;
    studentsAffected: number;
  }>();

  // Any change to the dates invalidates a previously fetched impact.
  React.useEffect(() => {
    setImpact(null);
    preview.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const datesValid = !!fromDate && !!toDate && toDate >= fromDate;
  const reasonValid = reason.trim().length >= 10;

  async function checkImpact() {
    if (!datesValid) return;
    const data = await preview.run(
      `/api/faculty/leave/impact?from=${fromDate}&to=${toDate}`,
      { method: 'GET' },
    );
    if (data) setImpact(data);
  }

  const needingCover = (impact?.classes ?? []).filter((c) => !c.alreadyCovered);

  if (submit.succeeded && submit.data) {
    return (
      <Card>
        <CardBody>
          <Alert tone="success" icon={CheckCircle2} title={`Submitted as ${submit.data.reference}`}>
            Your request is pending approval. Your head of department sees it with the{' '}
            {pluralize(submit.data.classesNeedingCover, 'class')} that need cover and the{' '}
            {submit.data.studentsAffected} students involved. Nothing on the timetable changes until
            it is approved.
          </Alert>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => {
              submit.reset();
              setReason('');
              setImpact(null);
            }}
          >
            Request more leave
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Request leave"
        description="Step 1: pick the dates and see what it affects. Step 2: confirm."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="lv-type" required>
            <Select id="lv-type" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
              {LEAVE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {humanize(v)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="lv-from" required>
            <Input
              id="lv-from"
              type="date"
              min={minDate}
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                if (e.target.value > toDate) setToDate(e.target.value);
              }}
            />
          </Field>
          <Field
            label="To"
            htmlFor="lv-to"
            required
            error={datesValid ? undefined : 'The end date must not be before the start date.'}
          >
            <Input
              id="lv-to"
              type="date"
              min={fromDate || minDate}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              disabled={isHalfDay}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-default">
          <input
            type="checkbox"
            checked={isHalfDay}
            onChange={(e) => {
              setIsHalfDay(e.target.checked);
              if (e.target.checked) setToDate(fromDate);
            }}
            className="h-4 w-4 rounded border-[hsl(var(--border-strong))]"
          />
          Half day only
        </label>

        <Field
          label="Reason"
          htmlFor="lv-reason"
          required
          hint="Seen by your approver and stored with the request. At least 10 characters."
        >
          <Textarea
            id="lv-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Attending the NAAC accreditation workshop as an institutional representative."
          />
        </Field>

        <MutationError error={preview.error} title="The impact could not be worked out" />

        {impact ? (
          <div className="rounded-lg border border-[hsl(var(--border-strong))] bg-surface-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck size={16} className="text-brand" aria-hidden />
              <p className="text-[13.5px] font-semibold text-default">
                What this leave affects
              </p>
              <Badge tone={needingCover.length > 0 ? 'warning' : 'success'}>
                {pluralize(needingCover.length, 'class')} needing cover
              </Badge>
              {impact.studentsAffected > 0 ? (
                <Badge tone="info" icon={Users}>
                  {impact.studentsAffected} students
                </Badge>
              ) : null}
            </div>

            {impact.warning ? (
              <Alert tone="warning" icon={TriangleAlert} className="mt-3">
                {impact.warning}
              </Alert>
            ) : null}

            {impact.holidays.length > 0 ? (
              <p className="mt-2 text-[12.5px] text-muted">
                Institution holidays in this range:{' '}
                {impact.holidays.map((h) => `${formatDate(h.date, false)} (${h.name})`).join(', ')}.
              </p>
            ) : null}

            {impact.classes.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">
                No class of yours falls in this range, so nothing needs cover.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))] bg-surface">
                {impact.classes.map((c) => (
                  <li
                    key={`${c.entryId}-${c.date}`}
                    className={`flex flex-wrap items-center gap-3 px-3 py-2 ${
                      c.entryId === highlightEntryId ? 'bg-brand-subtle' : ''
                    }`}
                  >
                    <div className="w-[120px] shrink-0">
                      <p className="text-[12.5px] font-medium text-default">
                        {formatDate(c.date, false)}
                      </p>
                      <p className="tabular text-[11.5px] text-subtle">
                        {formatTime(c.startTime)}–{formatTime(c.endTime)}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-default">
                        {c.subjectCode} {c.subjectName} · {c.sectionCode}
                      </p>
                      <p className="text-[12px] text-muted">
                        Room {c.roomCode ?? 'not allocated'} ·{' '}
                        {pluralize(c.studentCount, 'student')}
                      </p>
                    </div>
                    {c.alreadyCovered ? (
                      <Badge tone="neutral">{c.coveredReason}</Badge>
                    ) : (
                      <Badge tone="warning">needs cover</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <MutationError error={submit.error} title="The request was not submitted" />
      </CardBody>
      <CardFooter>
        <div className="flex flex-wrap items-center gap-2">
          {!impact ? (
            <Button
              variant="secondary"
              icon={Search}
              loading={preview.pending}
              disabled={!datesValid}
              onClick={checkImpact}
            >
              Check what this affects
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                icon={CalendarX2}
                loading={submit.pending}
                disabled={!reasonValid}
                onClick={() =>
                  submit.run('/api/faculty/leave', {
                    body: { leaveType, fromDate, toDate, isHalfDay, reason: reason.trim() },
                  })
                }
              >
                Confirm and submit
              </Button>
              <Button variant="ghost" onClick={() => setImpact(null)}>
                Change the dates
              </Button>
              {!reasonValid ? (
                <span className="text-[12px] text-subtle">A reason is required to submit.</span>
              ) : null}
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
