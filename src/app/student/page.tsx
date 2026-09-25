import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  DoorOpen,
  History,
  MapPin,
  Megaphone,
  Sparkles,
  Target,
  User,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Divider,
  EmptyState,
  Progress,
  Section,
} from '@/components/ui';
import { formatDate, formatTime, percent, pluralize, relativeTime } from '@/lib/utils';
import { isEnabled } from '@/lib/features';
import { getStudentSkillProfile } from '@/services/skills';
import { requireStudentContext } from './_lib/auth';
import {
  getAttendanceRows,
  getCurrentTerm,
  getEnrolledOfferings,
  getInstitutionTimezone,
  getPublishedTimetable,
  getScheduleExceptions,
  getWeeklyClasses,
  summariseAttendance,
} from './_lib/student';
import { getStudentAssignments } from './_lib/coursework';
import { getHolidays, getStudentAnnouncements, getStudentChanges } from './_lib/campus';
import { findNextClass, occurrencesForDate, type ClassOccurrence } from './_lib/schedule';
import {
  addIsoDays,
  DAY_LABEL,
  formatIsoDayLabel,
  isoToDate,
  minutesUntilLabel,
  timeToMinutes,
  zonedNow,
} from './_lib/time';
import { AskAiLink, priorityTone, SubjectTag } from './_components/bits';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function StudentDashboard() {
  const user = await requireStudentContext();
  const timeZone = await getInstitutionTimezone(user.institutionId);
  const now = zonedNow(timeZone);

  const [term, offerings, attendanceRows, assignments, announcements, changes] = await Promise.all([
    getCurrentTerm(user.institutionId),
    getEnrolledOfferings(user.institutionId, user.studentProfileId),
    getAttendanceRows(user.institutionId, user.studentProfileId),
    getStudentAssignments(user.institutionId, user.studentProfileId),
    getStudentAnnouncements(user.institutionId, user.userId),
    getStudentChanges(user.institutionId, user.sectionId, user.userId, 5),
  ]);

  const timetable = term ? await getPublishedTimetable(user.institutionId, term.id) : null;
  const classes =
    timetable && user.sectionId
      ? await getWeeklyClasses(user.institutionId, user.sectionId, timetable.versionId)
      : [];

  const horizonEnd = addIsoDays(now.today, 8);
  const [exceptions, holidays] = await Promise.all([
    getScheduleExceptions(
      user.institutionId,
      offerings.map((o) => o.offeringId),
      classes.map((c) => c.entryId),
      now.today,
      horizonEnd,
    ),
    getHolidays(user.institutionId, now.today, horizonEnd),
  ]);

  const holidayDates = new Set(holidays.map((h) => h.date));
  const todayHoliday = holidays.find((h) => h.date === now.today) ?? null;

  const todaysClasses = occurrencesForDate(now.today, classes, exceptions);
  const remainingToday = todaysClasses.filter((occurrence) => {
    const end = timeToMinutes(occurrence.endTime);
    return end !== null && end > now.minutes;
  });

  const next = findNextClass(now.today, now.minutes, classes, exceptions, holidayDates);

  const attendance = summariseAttendance(attendanceRows);
  const overdue = assignments.filter((a) => a.bucket === 'OVERDUE');
  const upcoming = assignments
    .filter((a) => a.bucket === 'DUE_SOON')
    .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));

  const needsAck = announcements.filter(
    (a) => a.requiresAcknowledgement && !a.acknowledgedAt,
  );
  const unread = announcements.filter((a) => !a.readAt);

  const skillsEnabled = isEnabled(user.featureFlags, 'skill_engine_enabled');
  const skillProfile = skillsEnabled
    ? await getStudentSkillProfile(user.institutionId, user.studentProfileId)
    : null;

  const attentionCount =
    attendance.atRisk.length + overdue.length + needsAck.length;

  return (
    <>
      {/* ------------------------------ Greeting ----------------------------- */}
      <div className="mb-5">
        <p className="text-[12.5px] font-medium text-subtle">
          {greeting(now.minutes)} · {DAY_LABEL[now.day]}, {formatDate(isoToDate(now.today))}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.01em] text-default">
          {user.firstName}
        </h1>
        <p className="mt-1 text-[13.5px] text-muted">
          {term ? `${term.name} · Semester ${term.semesterNumber}` : 'No active term'}
          {' · '}
          {pluralize(offerings.length, 'subject')}
          {attentionCount > 0
            ? ` · ${pluralize(attentionCount, 'thing')} need${attentionCount === 1 ? 's' : ''} your attention`
            : ' · nothing needs your attention right now'}
        </p>
      </div>

      {/* -------------------------- Needs attention -------------------------- */}
      {attentionCount > 0 ? (
        <Section title="Needs your attention">
          <div className="space-y-2.5">
            {attendance.atRisk.length > 0 ? (
              <Alert
                tone="danger"
                icon={AlertTriangle}
                title={`${pluralize(attendance.atRisk.length, 'subject')} below the attendance requirement`}
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/student/attendance">Review</Link>
                  </Button>
                }
              >
                {attendance.atRisk
                  .slice(0, 3)
                  .map((r) => `${r.code} at ${percent(r.percentageBp)}`)
                  .join(' · ')}
                {attendance.atRisk.length > 3 ? ` · +${attendance.atRisk.length - 3} more` : ''}
              </Alert>
            ) : null}

            {overdue.length > 0 ? (
              <Alert
                tone="warning"
                icon={ClipboardList}
                title={`${pluralize(overdue.length, 'assignment')} past the due date`}
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/student/assignments">Open</Link>
                  </Button>
                }
              >
                {overdue
                  .slice(0, 2)
                  .map((a) => `${a.subjectCode} — ${a.title}`)
                  .join(' · ')}
                {overdue.length > 2 ? ` · +${overdue.length - 2} more` : ''}
              </Alert>
            ) : null}

            {needsAck.length > 0 ? (
              <Alert
                tone="info"
                icon={BellRing}
                title={`${pluralize(needsAck.length, 'notice')} waiting for your acknowledgement`}
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/student/announcements">Read</Link>
                  </Button>
                }
              >
                {needsAck[0]?.title}
                {needsAck[0]?.acknowledgementDeadline
                  ? ` — respond by ${formatDate(needsAck[0].acknowledgementDeadline)}`
                  : ''}
              </Alert>
            ) : null}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ------------------------------ Left column ---------------------- */}
        <div className="space-y-5 lg:col-span-2">
          {/* Next class */}
          <Card>
            <CardHeader
              title="Next class"
              icon={CalendarClock}
              action={
                <Button asChild size="sm" variant="ghost" iconRight={ArrowRight}>
                  <Link href="/student/schedule">Full timetable</Link>
                </Button>
              }
            />
            <CardBody className="p-0">
              {!timetable ? (
                <EmptyState
                  icon={CalendarClock}
                  title="No published timetable"
                  description="Your section's timetable has not been published for this term yet. It will appear here as soon as the administration publishes it."
                />
              ) : next ? (
                <NextClassPanel
                  occurrence={next.occurrence}
                  isToday={next.isToday}
                  nowMinutes={now.minutes}
                  todayIso={now.today}
                />
              ) : (
                <EmptyState
                  icon={CalendarClock}
                  title="No classes scheduled in the next week"
                  description={
                    todayHoliday
                      ? `${todayHoliday.name} today, and nothing is scheduled for the days after it.`
                      : 'Nothing is on your timetable for the coming week.'
                  }
                />
              )}
            </CardBody>

            {timetable && todaysClasses.length > 0 ? (
              <CardFooter className="p-0">
                <div className="px-5 py-3">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subtle">
                    {remainingToday.length > 0
                      ? `Rest of today · ${pluralize(remainingToday.length, 'class', 'classes')}`
                      : 'Today · all classes finished'}
                  </p>
                  <ul className="space-y-1.5">
                    {(remainingToday.length > 0 ? remainingToday : todaysClasses).map((c) => (
                      <li
                        key={c.key}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]"
                      >
                        <span className="tabular w-[68px] shrink-0 text-muted">
                          {formatTime(c.startTime)}
                        </span>
                        <span
                          className={
                            c.status === 'CANCELLED'
                              ? 'font-medium text-subtle line-through'
                              : 'font-medium text-default'
                          }
                        >
                          {c.subjectName}
                        </span>
                        {c.roomCode ? (
                          <span className="text-[12.5px] text-subtle">Room {c.roomCode}</span>
                        ) : null}
                        {c.status !== 'SCHEDULED' ? (
                          <Badge tone={c.status === 'CANCELLED' ? 'danger' : 'warning'}>
                            {c.status.replace(/_/g, ' ').toLowerCase()}
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardFooter>
            ) : null}
          </Card>

          {/* Assignments */}
          <Card>
            <CardHeader
              title="Assignments"
              description={
                assignments.length > 0
                  ? `${overdue.length} overdue · ${upcoming.length} still to hand in`
                  : undefined
              }
              icon={ClipboardList}
              action={
                <Button asChild size="sm" variant="ghost" iconRight={ArrowRight}>
                  <Link href="/student/assignments">All</Link>
                </Button>
              }
            />
            <CardBody className="p-0">
              {overdue.length === 0 && upcoming.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Nothing to hand in"
                  description="Every assignment you have been set is either submitted or already evaluated."
                />
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {[...overdue, ...upcoming].slice(0, 5).map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <SubjectTag code={a.subjectCode} />
                        <span className="mt-1 block truncate text-[13.5px] font-medium text-default">
                          {a.title}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-muted">
                          {a.dueAt
                            ? `Due ${formatDate(a.dueAt)} · ${relativeTime(a.dueAt)}`
                            : 'No due date set'}
                          {a.originalDueAt && a.dueAt
                            ? ` · moved from ${formatDate(a.originalDueAt)}`
                            : ''}
                        </span>
                      </span>
                      <Badge tone={a.bucket === 'OVERDUE' ? 'danger' : 'neutral'}>
                        {a.bucket === 'OVERDUE' ? 'Overdue' : `${a.maxScore} marks`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Attendance */}
          <Card>
            <CardHeader
              title="Attendance"
              description={
                attendance.held > 0
                  ? `${attendance.attended} of ${attendance.held} classes attended this term`
                  : undefined
              }
              icon={CheckSquare}
              action={
                <Button asChild size="sm" variant="ghost" iconRight={ArrowRight}>
                  <Link href="/student/attendance">Details</Link>
                </Button>
              }
            />
            <CardBody>
              {attendance.held === 0 ? (
                <EmptyState
                  icon={CheckSquare}
                  title="No attendance recorded yet"
                  description="Once your faculty start submitting attendance for this term, your percentage appears here."
                />
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="tabular text-3xl font-semibold tracking-[-0.02em] text-default">
                      {percent(attendance.percentageBp)}
                    </span>
                    <span className="text-[12.5px] text-muted">overall, all subjects</span>
                  </div>
                  <Progress
                    className="mt-3"
                    value={attendance.percentageBp / 100}
                    tone={attendance.percentageBp >= 7500 ? 'success' : 'danger'}
                  />

                  {attendance.atRisk.length > 0 ? (
                    <>
                      <Divider className="my-4" />
                      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subtle">
                        Below requirement
                      </p>
                      <ul className="space-y-2">
                        {attendance.atRisk.map((r) => (
                          <li key={r.offeringId} className="flex items-center gap-3">
                            <span className="min-w-0 flex-1">
                              <SubjectTag code={r.code} name={r.name} />
                              <span className="mt-0.5 block text-[12.5px] text-muted">
                                {r.attendedSessions}/{r.heldSessions} attended ·{' '}
                                {r.absenceHeadroom > 0
                                  ? `${pluralize(r.absenceHeadroom, 'absence')} left`
                                  : Number.isFinite(r.sessionsToRecover)
                                    ? `attend the next ${pluralize(r.sessionsToRecover, 'class', 'classes')} to reach ${r.requiredPercentage}%`
                                    : 'cannot reach the requirement this term'}
                              </span>
                            </span>
                            <Badge tone="danger" className="tabular">
                              {percent(r.percentageBp)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ----------------------------- Right column ---------------------- */}
        <div className="space-y-5">
          {/* Notices */}
          <Card>
            <CardHeader
              title="Notices"
              description={
                unread.length > 0 ? `${unread.length} unread` : 'You are up to date'
              }
              icon={Megaphone}
              action={
                <Button asChild size="sm" variant="ghost" iconRight={ArrowRight}>
                  <Link href="/student/announcements">All</Link>
                </Button>
              }
            />
            <CardBody className="p-0">
              {announcements.length === 0 ? (
                <EmptyState
                  icon={Megaphone}
                  title="No notices yet"
                  description="Notices addressed to your programme, section or the whole institution will appear here."
                />
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {[...needsAck, ...announcements.filter((a) => !needsAck.includes(a))]
                    .slice(0, 4)
                    .map((a) => (
                      <li key={a.id} className="px-5 py-3">
                        <Link
                          href={`/student/announcements#${a.reference}`}
                          className="group block"
                        >
                          <span className="flex items-center gap-2">
                            <Badge tone={priorityTone(a.priority)}>
                              {a.priority.toLowerCase()}
                            </Badge>
                            {a.requiresAcknowledgement && !a.acknowledgedAt ? (
                              <Badge tone="warning" dot>
                                action needed
                              </Badge>
                            ) : !a.readAt ? (
                              <Badge tone="brand" dot>
                                unread
                              </Badge>
                            ) : null}
                          </span>
                          <span className="mt-1.5 block text-[13.5px] font-medium leading-snug text-default group-hover:text-brand">
                            {a.title}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-subtle">
                            {a.publishedAt ? relativeTime(a.publishedAt) : 'Not published'}
                            {a.authorName ? ` · ${a.authorName}` : ''}
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* What changed */}
          <Card>
            <CardHeader
              title="What changed"
              description="Recent changes affecting your section"
              icon={History}
            />
            <CardBody className="p-0">
              {changes.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="Nothing has changed"
                  description="Room moves, cancellations and deadline changes that affect you are listed here with the reason."
                />
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {changes.map((c) => (
                    <li key={c.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-[13.5px] font-medium leading-snug text-default">
                          {c.title}
                        </p>
                        {c.isTargeted ? (
                          <Badge tone="brand" className="shrink-0">
                            your section
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-muted">{c.summary}</p>
                      {c.reason ? (
                        <p className="mt-1 text-[12px] text-subtle">Reason: {c.reason}</p>
                      ) : null}
                      <p className="mt-1 text-[11.5px] text-subtle">
                        {c.effectiveFrom
                          ? `Effective ${formatDate(c.effectiveFrom)} · `
                          : ''}
                        recorded {relativeTime(c.createdAt)}
                        {c.changedByName ? ` by ${c.changedByName}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Skills */}
          {skillsEnabled ? (
            <Card>
              <CardHeader
                title="Career readiness"
                icon={Target}
                action={
                  <Button asChild size="sm" variant="ghost" iconRight={ArrowRight}>
                    <Link href="/student/skills">Open</Link>
                  </Button>
                }
              />
              <CardBody>
                {skillProfile?.careerGoal ? (
                  <>
                    <p className="text-[13px] text-muted">
                      Target role
                      <span className="ml-1.5 font-medium text-default">
                        {skillProfile.careerGoal.title}
                      </span>
                    </p>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="tabular text-3xl font-semibold tracking-[-0.02em] text-default">
                        {skillProfile.careerGoal.readiness}%
                      </span>
                      <span className="text-[12.5px] text-muted">ready</span>
                    </div>
                    <Progress
                      className="mt-2.5"
                      value={skillProfile.careerGoal.readiness}
                      tone={
                        skillProfile.careerGoal.readiness >= 75
                          ? 'success'
                          : skillProfile.careerGoal.readiness >= 50
                            ? 'warning'
                            : 'danger'
                      }
                    />
                    <p className="mt-2 text-[12.5px] text-muted">
                      {skillProfile.careerGoal.metRequirements} of{' '}
                      {skillProfile.careerGoal.totalRequirements} requirements met, from{' '}
                      {pluralize(skillProfile.overallEvidenceCount, 'piece')} of evidence.
                    </p>
                    {skillProfile.careerGoal.gaps.filter((g) => g.gap > 0).length > 0 ? (
                      <p className="mt-2 text-[12.5px] text-subtle">
                        Biggest gap:{' '}
                        <span className="text-default">
                          {skillProfile.careerGoal.gaps[0]?.skill}
                        </span>{' '}
                        ({skillProfile.careerGoal.gaps[0]?.current} →{' '}
                        {skillProfile.careerGoal.gaps[0]?.required})
                      </p>
                    ) : null}
                  </>
                ) : (
                  <EmptyState
                    icon={Target}
                    title="No career goal set"
                    description="Pick a target role to see how your evidenced skills compare against what it requires."
                    action={
                      <Button asChild size="sm" variant="secondary">
                        <Link href="/student/skills">Open skills</Link>
                      </Button>
                    }
                  />
                )}
              </CardBody>
            </Card>
          ) : null}

          {/* Assistant */}
          {isEnabled(user.featureFlags, 'ai_assistant_enabled') &&
          user.permissions.has('ai:use_assistant') ? (
            <Card>
              <CardBody>
                <p className="flex items-center gap-2 text-[13.5px] font-semibold text-default">
                  <Sparkles size={15} className="text-brand" aria-hidden />
                  Ask about your own records
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  The assistant answers from your timetable, attendance and notices, and cites the
                  records it used.
                </p>
                <div className="mt-3 flex flex-col gap-1.5">
                  <AskAiLink question="How many classes can I miss and still stay above 75%?" />
                  <AskAiLink question="What is due this week?" />
                  <AskAiLink question="Why did my Financial Management class move rooms?" />
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------- */

function NextClassPanel({
  occurrence,
  isToday,
  nowMinutes,
  todayIso,
}: {
  occurrence: ClassOccurrence;
  isToday: boolean;
  nowMinutes: number;
  todayIso: string;
}) {
  const start = timeToMinutes(occurrence.startTime) ?? 0;
  const end = timeToMinutes(occurrence.endTime) ?? 0;
  const inProgress = isToday && start <= nowMinutes && end > nowMinutes;

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={inProgress ? 'success' : 'brand'} dot>
          {inProgress
            ? 'in progress'
            : isToday
              ? minutesUntilLabel(start - nowMinutes)
              : occurrence.dateIso === addIsoDays(todayIso, 1)
                ? 'tomorrow'
                : formatIsoDayLabel(occurrence.dateIso)}
        </Badge>
        {occurrence.status !== 'SCHEDULED' ? (
          <Badge tone={occurrence.status === 'EXTRA_CLASS' ? 'info' : 'warning'}>
            {occurrence.status.replace(/_/g, ' ').toLowerCase()}
          </Badge>
        ) : null}
      </div>

      <p className="mt-2.5 text-lg font-semibold tracking-[-0.01em] text-default">
        {occurrence.subjectName}
      </p>
      <p className="text-[12.5px] text-subtle">{occurrence.subjectCode}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
        <span className="inline-flex items-center gap-1.5 text-muted">
          <CalendarClock size={14} className="text-subtle" aria-hidden />
          <span className="tabular text-default">
            {formatTime(occurrence.startTime)} – {formatTime(occurrence.endTime)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted">
          <DoorOpen size={14} className="text-subtle" aria-hidden />
          <span className="text-default">
            {occurrence.roomCode ? `Room ${occurrence.roomCode}` : 'Room not assigned'}
          </span>
          {occurrence.roomBuilding ? (
            <span className="inline-flex items-center gap-1 text-subtle">
              <MapPin size={12} aria-hidden />
              {occurrence.roomBuilding}
            </span>
          ) : null}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted">
          <User size={14} className="text-subtle" aria-hidden />
          <span className="text-default">{occurrence.facultyName ?? 'Faculty not assigned'}</span>
        </span>
      </div>

      {occurrence.exceptionReason ? (
        <p className="mt-3 rounded-md bg-warning-subtle px-3 py-2 text-[12.5px] text-default">
          {occurrence.exceptionReason}
        </p>
      ) : null}
    </div>
  );
}

function greeting(minutes: number): string {
  if (minutes < 12 * 60) return 'Good morning';
  if (minutes < 17 * 60) return 'Good afternoon';
  return 'Good evening';
}
