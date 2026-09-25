import Link from 'next/link';
import { CalendarClock, DoorOpen, GraduationCap, Hourglass, Timer } from 'lucide-react';
import {
  Badge,
  Button,
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
import { formatDate, formatDateTime, humanize, minutesToHuman, num, pluralize } from '@/lib/utils';
import { requireStudentContext } from '../_lib/auth';
import {
  getCurrentTerm,
  getInstitutionTimezone,
} from '../_lib/student';
import { getStudentAssessments, type StudentAssessment } from '../_lib/coursework';
import { zonedNow } from '../_lib/time';
import { AskAiLink, ProseBody, SubjectTag } from '../_components/bits';

export const metadata = { title: 'Exams & Results' };
export const dynamic = 'force-dynamic';

export default async function AssessmentsPage() {
  const user = await requireStudentContext('assessment:view_results_own');
  const timeZone = await getInstitutionTimezone(user.institutionId);
  const now = zonedNow(timeZone);

  const term = await getCurrentTerm(user.institutionId);
  const assessments = await getStudentAssessments(
    user.institutionId,
    user.studentProfileId,
    user.sectionId,
    term?.id ?? null,
  );

  const upcoming = assessments.filter((a) => !a.date || a.date >= now.today);
  const past = assessments.filter((a) => a.date && a.date < now.today);
  const withResults = assessments.filter((a) => a.result);

  const totalScored = withResults.reduce(
    (n, a) => n + (a.result?.isAbsent ? 0 : Number(a.result?.score ?? 0)),
    0,
  );
  const totalPossible = withResults.reduce((n, a) => n + Number(a.maxScore), 0);

  return (
    <>
      <PageHeader
        title="Exams & Results"
        description={
          term
            ? `${term.name}. Only published exam schedules and released results are shown.`
            : 'No active term.'
        }
        action={<AskAiLink question="When is my next exam and what is it worth?" />}
      />

      {assessments.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={GraduationCap}
              title="No exam schedule published yet"
              description="The examination cell has not published a schedule for your subjects this term. Nothing is shown until it is official — a draft date is not a commitment."
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href="/student/announcements">Check notices</Link>
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {withResults.length > 0 ? (
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <Stat
                label="Results released"
                value={withResults.length}
                sublabel={`of ${pluralize(assessments.length, 'scheduled assessment')}`}
                icon={GraduationCap}
              />
              <Stat
                label="Marks obtained"
                value={`${num(totalScored, 1)}`}
                sublabel={`out of ${num(totalPossible, 0)} released so far`}
                tone="brand"
              />
              <Stat
                label="Still to sit"
                value={upcoming.length}
                sublabel={upcoming[0]?.date ? `Next on ${formatDate(upcoming[0].date)}` : '—'}
                icon={Hourglass}
              />
            </div>
          ) : null}

          <Section title="Exam schedule" description="Dates, times and seating as published.">
            {upcoming.length === 0 ? (
              <Card>
                <CardBody className="p-0">
                  <EmptyState
                    icon={CalendarClock}
                    title="No upcoming exams"
                    description="Everything on the published schedule has already taken place."
                  />
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-3">
                {upcoming.map((a) => (
                  <ExamCard key={a.id} assessment={a} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Results" description="Released by the examination cell.">
            {withResults.length === 0 ? (
              <Card>
                <CardBody className="p-0">
                  <EmptyState
                    icon={GraduationCap}
                    title="No results released"
                    description="Scores appear here only after the examination cell publishes them. Nothing provisional is shown."
                  />
                </CardBody>
              </Card>
            ) : (
              <>
                <Card className="hidden sm:block">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Assessment</Th>
                        <Th>Subject</Th>
                        <Th align="right">Score</Th>
                        <Th align="center">Grade</Th>
                        <Th>Released</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {withResults.map((a) => (
                        <tr key={a.id}>
                          <Td>
                            <p className="text-[13.5px] font-medium text-default">{a.title}</p>
                            <p className="text-[11.5px] text-subtle">{humanize(a.kind)}</p>
                          </Td>
                          <Td>
                            <span className="text-[13px] text-default">{a.subjectName ?? '—'}</span>
                          </Td>
                          <Td align="right">
                            {a.result?.isAbsent ? (
                              <Badge tone="danger">Absent</Badge>
                            ) : (
                              <>
                                <span className="tabular font-medium text-default">
                                  {num(a.result?.score, 2)} / {num(a.maxScore, 0)}
                                </span>
                                <Progress
                                  className="ml-auto mt-1 w-24"
                                  value={scorePercent(a)}
                                  tone={
                                    scorePercent(a) >= 75
                                      ? 'success'
                                      : scorePercent(a) >= 40
                                        ? 'warning'
                                        : 'danger'
                                  }
                                />
                              </>
                            )}
                          </Td>
                          <Td align="center">
                            {a.result?.grade ? (
                              <Badge tone="brand">{a.result.grade}</Badge>
                            ) : (
                              <span className="text-subtle">—</span>
                            )}
                          </Td>
                          <Td>
                            <span className="text-[12.5px] text-muted">
                              {formatDate(a.result?.publishedAt)}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>

                <div className="space-y-3 sm:hidden">
                  {withResults.map((a) => (
                    <Card key={a.id}>
                      <CardBody className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-medium text-default">
                              {a.title}
                            </p>
                            <p className="text-[11.5px] text-subtle">
                              {a.subjectCode ?? '—'} · {humanize(a.kind)}
                            </p>
                          </div>
                          {a.result?.isAbsent ? (
                            <Badge tone="danger">Absent</Badge>
                          ) : (
                            <span className="tabular shrink-0 text-[15px] font-semibold text-default">
                              {num(a.result?.score, 1)}
                              <span className="text-[12px] font-normal text-subtle">
                                /{num(a.maxScore, 0)}
                              </span>
                            </span>
                          )}
                        </div>
                        {!a.result?.isAbsent ? (
                          <Progress
                            value={scorePercent(a)}
                            tone={
                              scorePercent(a) >= 75
                                ? 'success'
                                : scorePercent(a) >= 40
                                  ? 'warning'
                                  : 'danger'
                            }
                          />
                        ) : null}
                        <p className="text-[12px] text-subtle">
                          {a.result?.grade ? `Grade ${a.result.grade} · ` : ''}released{' '}
                          {formatDate(a.result?.publishedAt)}
                        </p>
                        {a.result?.remarks ? (
                          <p className="text-[12.5px] text-muted">{a.result.remarks}</p>
                        ) : null}
                      </CardBody>
                    </Card>
                  ))}
                </div>

                <p className="mt-3 text-[12.5px] text-subtle">
                  Something look wrong?{' '}
                  <Link
                    href="/student/readdressal/new?category=examination"
                    className="font-medium text-brand hover:underline"
                  >
                    Request a re-evaluation
                  </Link>
                  .
                </p>
              </>
            )}
          </Section>

          {past.length > 0 ? (
            <Section title="Already sat" description="Papers whose date has passed.">
              <Card>
                <CardBody className="p-0">
                  <ul className="divide-y divide-[hsl(var(--border))]">
                    {past.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium text-default">
                            {a.title}
                          </p>
                          <p className="text-[12px] text-subtle">
                            {a.subjectCode ?? '—'} · {formatDate(a.date)}
                          </p>
                        </div>
                        <Badge tone={a.result ? 'success' : 'neutral'}>
                          {a.result ? 'Result released' : 'Awaiting result'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}

function ExamCard({ assessment }: { assessment: StudentAssessment }) {
  return (
    <Card>
      <CardHeader
        title={assessment.title}
        description={assessment.subjectName ?? undefined}
        action={<Badge tone="brand">{humanize(assessment.kind)}</Badge>}
      >
        {assessment.subjectCode ? (
          <div className="mt-1.5">
            <SubjectTag code={assessment.subjectCode} />
          </div>
        ) : null}
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={13} className="text-subtle" aria-hidden />
            <span className="text-default">
              {assessment.startsAt ? formatDateTime(assessment.startsAt) : formatDate(assessment.date)}
            </span>
          </span>
          {assessment.durationMinutes ? (
            <span className="inline-flex items-center gap-1.5">
              <Timer size={13} className="text-subtle" aria-hidden />
              <span className="text-default">{minutesToHuman(assessment.durationMinutes)}</span>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <DoorOpen size={13} className="text-subtle" aria-hidden />
            <span className="text-default">
              {assessment.roomCode
                ? `Room ${assessment.roomCode}${assessment.roomBuilding ? `, ${assessment.roomBuilding}` : ''}`
                : 'Seating not allocated yet'}
            </span>
          </span>
          <span>
            Worth <span className="text-default">{num(assessment.maxScore, 0)} marks</span>
          </span>
        </div>
        {assessment.instructions ? <ProseBody text={assessment.instructions} /> : null}
        <AskAiLink question={`What should I revise for ${assessment.title}?`} />
      </CardBody>
    </Card>
  );
}

function scorePercent(assessment: StudentAssessment): number {
  const max = Number(assessment.maxScore);
  const score = Number(assessment.result?.score ?? 0);
  if (!Number.isFinite(max) || max <= 0) return 0;
  return (score / max) * 100;
}
