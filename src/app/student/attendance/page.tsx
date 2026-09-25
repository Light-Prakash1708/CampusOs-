import Link from 'next/link';
import { AlertTriangle, CheckSquare, Flag, Info } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Progress,
  Section,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDateTime, percent, pluralize } from '@/lib/utils';
import { requireStudentContext } from '../_lib/auth';
import {
  attendanceTone,
  getAttendanceRows,
  getCurrentTerm,
  summariseAttendance,
  type AttendanceRow,
} from '../_lib/student';
import { AskAiLink } from '../_components/bits';

export const metadata = { title: 'Attendance' };
export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const user = await requireStudentContext('attendance:view_own');

  const [term, rows] = await Promise.all([
    getCurrentTerm(user.institutionId),
    getAttendanceRows(user.institutionId, user.studentProfileId),
  ]);

  const overall = summariseAttendance(rows);
  const recorded = rows.filter((r) => r.heldSessions > 0);
  const lastRecomputed = recorded.reduce<Date | null>(
    (latest, row) =>
      row.recomputedAt && (!latest || row.recomputedAt > latest) ? row.recomputedAt : latest,
    null,
  );

  return (
    <>
      <PageHeader
        title="Attendance"
        description={
          term
            ? `${term.name}. Percentages are computed from the attendance your faculty have submitted and locked.`
            : 'No active term.'
        }
        action={<AskAiLink question="Which subjects am I short of attendance in, and by how much?" />}
      />

      {recorded.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={CheckSquare}
              title="No attendance recorded yet"
              description="Nothing has been submitted for your subjects this term. Your percentage appears here as soon as a class is marked."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* ------------------------------ Summary --------------------------- */}
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Overall attendance"
              value={percent(overall.percentageBp)}
              sublabel={`${overall.attended} of ${overall.held} classes`}
              tone={overall.percentageBp >= 7500 ? 'success' : 'danger'}
              icon={CheckSquare}
            />
            <Stat
              label="Subjects below requirement"
              value={overall.atRisk.length}
              sublabel={
                overall.atRisk.length === 0
                  ? 'All subjects meet the minimum'
                  : 'Shortage affects exam eligibility'
              }
              tone={overall.atRisk.length === 0 ? 'success' : 'danger'}
              icon={AlertTriangle}
            />
            <Stat
              label="Classes you can still miss"
              value={rows.reduce((n, r) => n + r.absenceHeadroom, 0)}
              sublabel="Across all subjects, at the current pace"
              tone="neutral"
              icon={Flag}
            />
          </div>

          {overall.atRisk.length > 0 ? (
            <Alert
              className="mb-5"
              tone="danger"
              icon={AlertTriangle}
              title={`${pluralize(overall.atRisk.length, 'subject')} below the required minimum`}
            >
              A shortage can block you from sitting the end-semester examination. If you believe a
              record is wrong, dispute it against the specific subject below — the case links back
              to the attendance record for the reviewer.
            </Alert>
          ) : null}

          {/* ------------------------------- Table ---------------------------- */}
          <Section title="By subject" id="subjects">
            <Card className="hidden sm:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Subject</Th>
                    <Th align="right">Attended</Th>
                    <Th align="right">Held</Th>
                    <Th align="right">Percentage</Th>
                    <Th>Status</Th>
                    <Th>Headroom</Th>
                    <Th align="right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.offeringId}>
                      <Td>
                        <p className="text-[13.5px] font-medium text-default">{row.name}</p>
                        <p className="text-[11.5px] text-subtle">
                          {row.code}
                          {row.facultyName ? ` · ${row.facultyName}` : ''}
                        </p>
                      </Td>
                      <Td align="right" className="tabular">
                        {row.attendedSessions}
                      </Td>
                      <Td align="right" className="tabular">
                        {row.heldSessions}
                      </Td>
                      <Td align="right">
                        <span className="tabular font-medium text-default">
                          {row.heldSessions === 0 ? '—' : percent(row.percentageBp)}
                        </span>
                        {row.heldSessions > 0 ? (
                          <Progress
                            className="ml-auto mt-1 w-24"
                            value={row.percentageBp / 100}
                            tone={attendanceTone(row.percentageBp, row.requiredPercentage)}
                          />
                        ) : null}
                      </Td>
                      <Td>
                        <StatusBadge row={row} />
                      </Td>
                      <Td>
                        <span className="text-[12.5px] text-muted">{headroomText(row)}</span>
                      </Td>
                      <Td align="right">
                        <Link
                          href={disputeHref(row)}
                          className="text-[12.5px] font-medium text-brand hover:underline"
                        >
                          Dispute this
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            {/* Mobile cards */}
            <div className="space-y-3 sm:hidden">
              {rows.map((row) => (
                <Card key={row.offeringId}>
                  <CardBody className="space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-default">
                          {row.name}
                        </p>
                        <p className="text-[11.5px] text-subtle">{row.code}</p>
                      </div>
                      <span className="tabular shrink-0 text-lg font-semibold text-default">
                        {row.heldSessions === 0 ? '—' : percent(row.percentageBp)}
                      </span>
                    </div>
                    {row.heldSessions > 0 ? (
                      <Progress
                        value={row.percentageBp / 100}
                        tone={attendanceTone(row.percentageBp, row.requiredPercentage)}
                      />
                    ) : null}
                    <p className="text-[12.5px] text-muted">
                      {row.attendedSessions} of {row.heldSessions} classes attended
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge row={row} />
                      <span className="text-[12.5px] text-muted">{headroomText(row)}</span>
                    </div>
                    <Link
                      href={disputeHref(row)}
                      className="inline-block text-[12.5px] font-medium text-brand hover:underline"
                    >
                      Dispute this
                    </Link>
                  </CardBody>
                </Card>
              ))}
            </div>
          </Section>

          <Card>
            <CardHeader title="How this is calculated" icon={Info} />
            <CardBody className="space-y-2 text-[13px] leading-relaxed text-muted">
              <p>
                Percentage is <span className="text-default">attended ÷ held</span> for classes that
                have actually been marked and locked by your faculty. Classes that were cancelled
                are not counted as held.
              </p>
              <p>
                &ldquo;You can miss N more&rdquo; is the institution&rsquo;s own{' '}
                <span className="text-default">absence headroom</span> figure, recomputed whenever
                attendance is written. Where you are already below the minimum, we show instead how
                many consecutive classes you would need to attend to climb back to it.
              </p>
              <p>
                A disputed record is never edited silently: the original value is preserved and the
                correction is recorded against your case.
                {lastRecomputed ? ` Last recomputed ${formatDateTime(lastRecomputed)}.` : ''}
              </p>
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}

function StatusBadge({ row }: { row: AttendanceRow }) {
  if (row.heldSessions === 0) return <Badge tone="neutral">Not started</Badge>;
  const tone = attendanceTone(row.percentageBp, row.requiredPercentage);
  if (tone === 'danger') return <Badge tone="danger">Below {row.requiredPercentage}%</Badge>;
  if (tone === 'warning') return <Badge tone="warning">At the line</Badge>;
  return <Badge tone="success">Safe</Badge>;
}

function headroomText(row: AttendanceRow): string {
  if (row.heldSessions === 0) return 'No classes held yet';
  if (row.absenceHeadroom > 0) {
    return `You can miss ${pluralize(row.absenceHeadroom, 'more class', 'more classes')}`;
  }
  if (!Number.isFinite(row.sessionsToRecover)) {
    return `Cannot reach ${row.requiredPercentage}% this term`;
  }
  if (row.sessionsToRecover === 0) return 'Miss no further classes';
  return `Attend the next ${pluralize(row.sessionsToRecover, 'class', 'classes')} to reach ${row.requiredPercentage}%`;
}

function disputeHref(row: AttendanceRow): string {
  const params = new URLSearchParams({
    category: 'attendance',
    offering: row.offeringId,
    subject: row.code,
  });
  return `/student/redressal/new?${params.toString()}`;
}
