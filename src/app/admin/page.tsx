import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, DoorOpen, Gauge, LifeBuoy, Megaphone, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { can, requireAuth } from '@/lib/auth/context';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState,
  PageHeader, Progress, Section, Stat, EstimateChip,
} from '@/components/ui';
import { DISPLAY_TIME_ZONE, formatTime, humanize, minutesToHuman, relativeTime, pluralize } from '@/lib/utils';
import { scanVersionConflicts } from '@/services/timetable/conflicts';
import {
  computeAttendanceHealth, computeCommunicationHealth, computeGrievanceHealth,
  computeRoomUtilization, computeTimeSaved, computeWorkloadBalance,
} from '@/services/analytics';
import {
  getClassesInProgress, getCurrentTerm, getInstitutionCounts, getOutstandingAcknowledgements,
  getPendingApprovals, getPublishedVersion, getRecentChanges,
} from './_lib/admin';
import { SetupProgress } from './_components/SetupProgress';
import { countOpenMembershipRequests } from '@/services/membership';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard · CampusOS' };

/**
 * ADMIN EXECUTIVE DASHBOARD
 *
 * Answers, in order: what needs my attention, what is happening now, what
 * changed, what should I do next. Every figure is computed live — the conflict
 * count in particular is a real scan of the published timetable, not a cache.
 */
export default async function AdminDashboard() {
  const user = await requireAuth();
  const now = new Date();

  const [term, version, counts, inProgress, approvals, changes, acks] = await Promise.all([
    getCurrentTerm(user.institutionId),
    getPublishedVersion(user.institutionId),
    getInstitutionCounts(user.institutionId),
    getClassesInProgress(user.institutionId, now),
    getPendingApprovals(user.institutionId, user.userId),
    getRecentChanges(user.institutionId, 8),
    getOutstandingAcknowledgements(user.institutionId),
  ]);

  const openVerifications = can(user, 'user:approve_registration') ? await countOpenMembershipRequests(user.institutionId) : 0;

  const [conflicts, grievances, rooms, workload, attendance, comms, timeSaved] = await Promise.all([
    version
      ? scanVersionConflicts(user.institutionId, version.id)
      : Promise.resolve({ total: 0, items: [] }),
    computeGrievanceHealth(user.institutionId),
    computeRoomUtilization(user.institutionId),
    computeWorkloadBalance(user.institutionId),
    computeAttendanceHealth(user.institutionId),
    computeCommunicationHealth(user.institutionId),
    computeTimeSaved(user.institutionId),
  ]);

  // Everything that genuinely needs a decision today, most urgent first.
  const attention: {
    tone: 'danger' | 'warning' | 'info';
    title: string;
    detail: string;
    href: string;
    cta: string;
  }[] = [];

  if (conflicts.total > 0) {
    attention.push({
      tone: 'danger',
      title: `${pluralize(conflicts.total, 'timetable conflict')} detected`,
      detail: conflicts.items[0]?.message ?? '',
      href: '/admin/timetable/conflicts',
      cta: 'Review conflicts',
    });
  }
  if (grievances.breached > 0) {
    attention.push({
      tone: 'danger',
      title: `${pluralize(grievances.breached, 'case')} past the resolution deadline`,
      detail: 'These have escalated automatically to the next authority.',
      href: '/admin/redressal?filter=breached',
      cta: 'Open cases',
    });
  }
  if (grievances.approachingSla > 0) {
    attention.push({
      tone: 'warning',
      title: `${pluralize(grievances.approachingSla, 'case')} approaching SLA`,
      detail: 'Due within the next six working hours.',
      href: '/admin/redressal?filter=due',
      cta: 'Open cases',
    });
  }
  if (approvals.length > 0) {
    attention.push({
      tone: 'warning',
      title: `${pluralize(approvals.length, 'approval')} waiting on you`,
      detail: approvals[0]!.title,
      href: '/admin/approvals',
      cta: 'Review',
    });
  }
  if (workload.overloadedCount > 0) {
    attention.push({
      tone: 'warning',
      title: `${pluralize(workload.overloadedCount, 'faculty member')} above contracted load`,
      detail: workload.rebalanceHint ?? 'Review the workload distribution.',
      href: '/admin/workload',
      cta: 'View workload',
    });
  }
  if (!version) {
    attention.push({
      tone: 'info',
      title: 'No timetable is published for the current term',
      detail: 'Students and faculty cannot see a schedule until one is published.',
      href: '/admin/timetable',
      cta: 'Build timetable',
    });
  }

  return (
    <div>
      <PageHeader
        title={`Good ${now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'}, ${user.firstName}`}
        description={
          term
            ? `${user.institutionName} · ${term.name}`
            : `${user.institutionName} · no active term configured`
        }
        action={
          <>
            <Button asChild variant="secondary" icon={Megaphone}>
              <Link href="/admin/communications/new">New notice</Link>
            </Button>
            <Button asChild variant="primary" icon={CalendarClock}>
              <Link href="/admin/timetable">Timetable</Link>
            </Button>
          </>
        }
      />

      <SetupProgress
        user={user}
        pending={[
          {
            label: `${pluralize(openVerifications, 'student verification request')} waiting`,
            href: '/admin/verifications',
            count: openVerifications,
          },
        ]}
      />

      {/* ---------------- What needs attention ---------------- */}
      <Section title="Needs your attention">
        {attention.length === 0 ? (
          <Card>
            <CardBody className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-success shrink-0" />
              <div>
                <p className="text-sm font-medium text-default">Nothing is waiting on you</p>
                <p className="text-[13px] text-muted">
                  No timetable conflicts, no overdue cases, no pending approvals.
                </p>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-2">
            {attention.map((item, i) => (
              <Alert
                key={i}
                tone={item.tone}
                icon={AlertTriangle}
                title={item.title}
                action={
                  <Button asChild variant="secondary" size="sm" iconRight={ArrowRight}>
                    <Link href={item.href}>{item.cta}</Link>
                  </Button>
                }
              >
                {item.detail}
              </Alert>
            ))}
          </div>
        )}
      </Section>

      {/* ---------------- Headline numbers ---------------- */}
      <Section title="Institution at a glance">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Students" value={counts.students.toLocaleString('en-IN')} icon={Users}
            sublabel={`${counts.sections} sections · ${counts.programs} programmes`} />
          <Stat label="Faculty" value={counts.faculty} icon={Gauge}
            sublabel={`${counts.departments} departments`} />
          <Stat
            label="Classes in progress"
            value={inProgress.length}
            icon={CalendarClock}
            sublabel={inProgress.length ? 'right now' : 'none at this moment'}
          />
          <Stat
            label="Room utilisation"
            value={`${rooms.overallUtilizationPercent}%`}
            icon={DoorOpen}
            tone={rooms.overallUtilizationPercent < 35 ? 'warning' : 'neutral'}
            sublabel={`${counts.rooms} bookable rooms`}
          />
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ---------------- Left column ---------------- */}
        <div className="space-y-5 lg:col-span-2">
          {/* Conflicts */}
          <Card>
            <CardHeader
              title="Timetable conflicts"
              icon={AlertTriangle}
              description={
                version
                  ? `Live scan of “${version.name}”`
                  : 'No published timetable to scan'
              }
              action={
                conflicts.total > 0 ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/admin/timetable/conflicts">Resolve</Link>
                  </Button>
                ) : null
              }
            />
            {conflicts.total === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No conflicts detected"
                description={
                  version
                    ? 'Every room, faculty member and section is clash-free in the published timetable.'
                    : 'Publish a timetable to enable conflict scanning.'
                }
              />
            ) : (
              <CardBody className="space-y-2.5 p-0">
                {conflicts.items.slice(0, 5).map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 border-b border-[hsl(var(--border))] px-5 py-3 last:border-0"
                  >
                    <Badge tone="danger">{humanize(item.kind)}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] text-default">{item.message}</p>
                      <p className="mt-0.5 text-[12px] text-subtle">
                        {item.timeLabel} · {pluralize(item.affectedStudents, 'student')} affected
                      </p>
                    </div>
                  </div>
                ))}
                {conflicts.total > 5 ? (
                  <p className="px-5 py-2 text-[12.5px] text-muted">
                    and {conflicts.total - 5} more.
                  </p>
                ) : null}
              </CardBody>
            )}
          </Card>

          {/* Change feed */}
          <Card>
            <CardHeader
              title="What changed"
              icon={TrendingUp}
              description="Recent institutional changes, with the reason and who made them"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/changes">View all</Link>
                </Button>
              }
            />
            {changes.length === 0 ? (
              <EmptyState title="No changes recorded yet" description="Timetable moves, cancellations and deadline changes appear here." />
            ) : (
              <CardBody className="space-y-3 p-0">
                {changes.map((c) => (
                  <div key={c.id} className="border-b border-[hsl(var(--border))] px-5 py-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{humanize(c.kind)}</Badge>
                      <p className="text-[13.5px] font-medium text-default">{c.title}</p>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">{c.summary}</p>
                    {c.reason ? (
                      <p className="mt-0.5 text-[12.5px] text-subtle">Reason: {c.reason}</p>
                    ) : null}
                    <p className="mt-1 text-[12px] text-subtle">
                      {c.byFirst ? `${c.byFirst} ${c.byLast ?? ''}`.trim() : 'System'} ·{' '}
                      {relativeTime(c.createdAt)} · {pluralize(c.affectedCount, 'person', 'people')} affected
                    </p>
                  </div>
                ))}
              </CardBody>
            )}
          </Card>

          {/* Classes in progress */}
          <Card>
            <CardHeader
              title="In progress right now"
              icon={CalendarClock}
              description={`${dayLabel(now)} · ${formatTime(now.toTimeString().slice(0, 5))}`}
            />
            {inProgress.length === 0 ? (
              <EmptyState
                title="No classes are running"
                description="Nothing is scheduled in the current period."
              />
            ) : (
              <CardBody className="p-0">
                {inProgress.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-default">
                        {c.subjectCode} {c.subjectName}
                      </p>
                      <p className="text-[12.5px] text-muted">
                        {c.sectionCode} · {c.facultyFirst ? `${c.facultyFirst} ${c.facultyLast ?? ''}`.trim() : 'Unassigned'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[12.5px] text-muted">
                      <Badge tone="brand">Room {c.roomCode ?? 'TBD'}</Badge>
                      <span className="tabular">
                        {formatTime(c.start)}–{formatTime(c.end)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardBody>
            )}
          </Card>
        </div>

        {/* ---------------- Right column ---------------- */}
        <div className="space-y-5">
          {/* Insights derived from real analytics */}
          <Card>
            <CardHeader title="Insights" icon={TrendingUp} description="Derived from current records" />
            <CardBody className="space-y-3">
              {rooms.consolidationHint ? (
                <InsightRow tone="warning" text={rooms.consolidationHint} href="/admin/analytics" />
              ) : null}
              {workload.rebalanceHint ? (
                <InsightRow tone="warning" text={workload.rebalanceHint} href="/admin/workload" />
              ) : null}
              {attendance.studentsBelowThreshold > 0 ? (
                <InsightRow
                  tone="danger"
                  text={`${attendance.studentsBelowThreshold} of ${attendance.totalTrackedStudents} tracked students are below the 75% attendance requirement in at least one subject. Overall attendance is ${attendance.overallPercent}%.`}
                  href="/admin/analytics"
                />
              ) : null}
              {comms.outstandingAcknowledgements > 0 ? (
                <InsightRow
                  tone="info"
                  text={`${comms.outstandingAcknowledgements} acknowledgements are still outstanding across ${pluralize(comms.noticesRequiringAck, 'notice')}. Average read rate is ${comms.averageReadRate}%.`}
                  href="/admin/communications"
                />
              ) : null}
              {!rooms.consolidationHint &&
              !workload.rebalanceHint &&
              attendance.studentsBelowThreshold === 0 &&
              comms.outstandingAcknowledgements === 0 ? (
                <p className="text-[13px] text-muted">
                  No issues stand out in room utilisation, workload balance, attendance or
                  communication reach.
                </p>
              ) : null}
            </CardBody>
          </Card>

          {/* Acknowledgement pressure */}
          <Card>
            <CardHeader
              title="Awaiting acknowledgement"
              icon={Megaphone}
              description="Who has not confirmed they have read a notice"
            />
            {acks.length === 0 ? (
              <EmptyState title="All notices acknowledged" description="Nothing is outstanding." />
            ) : (
              <CardBody className="space-y-3.5">
                {acks.map((a) => {
                  const pct = a.recipientCount
                    ? Math.round((a.acknowledgedCount / a.recipientCount) * 100)
                    : 0;
                  return (
                    <div key={a.id}>
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/admin/communications/${a.id}`}
                          className="text-[13px] font-medium text-default hover:text-brand"
                        >
                          {a.title}
                        </Link>
                        <span className="tabular shrink-0 text-[12px] text-muted">
                          {a.acknowledgedCount}/{a.recipientCount}
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        tone={pct > 85 ? 'success' : pct > 60 ? 'warning' : 'danger'}
                        className="mt-1.5"
                      />
                      <p className="mt-1 text-[11.5px] text-subtle">
                        {a.recipientCount - a.acknowledgedCount} still pending
                      </p>
                    </div>
                  );
                })}
              </CardBody>
            )}
          </Card>

          {/* Approvals */}
          <Card>
            <CardHeader
              title="Pending approvals"
              icon={ShieldCheck}
              action={
                approvals.length ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admin/approvals">All</Link>
                  </Button>
                ) : null
              }
            />
            {approvals.length === 0 ? (
              <EmptyState title="Nothing to approve" description="Requests needing your decision appear here." />
            ) : (
              <CardBody className="p-0">
                {approvals.slice(0, 4).map((a) => (
                  <Link
                    key={a.id}
                    href="/admin/approvals"
                    className="block border-b border-[hsl(var(--border))] px-5 py-3 last:border-0 hover:bg-surface-sunken"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone="warning">{humanize(a.kind)}</Badge>
                    </div>
                    <p className="mt-1 text-[13px] font-medium text-default">{a.title}</p>
                    <p className="text-[12px] text-subtle">
                      {a.requesterFirst ? `${a.requesterFirst} ${a.requesterLast ?? ''}`.trim() : 'System'} ·{' '}
                      {relativeTime(a.createdAt)}
                    </p>
                  </Link>
                ))}
              </CardBody>
            )}
          </Card>

          {/* Estimated time saved */}
          <Card>
            <CardHeader title="Estimated time saved" icon={Gauge} />
            <CardBody>
              <p className="text-2xl font-semibold tabular tracking-[-0.02em] text-default">
                {minutesToHuman(timeSaved.totalMinutes)}
              </p>
              <div className="mt-2 space-y-1">
                {timeSaved.byActivity.map((a) => (
                  <div key={a.activity} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-muted">{humanize(a.activity)}</span>
                    <EstimateChip>{minutesToHuman(a.minutes)}</EstimateChip>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-subtle">
                {timeSaved.disclaimer}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InsightRow({
  tone,
  text,
  href,
}: {
  tone: 'info' | 'warning' | 'danger';
  text: string;
  href: string;
}) {
  const dot = { info: 'bg-info', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <Link href={href} className="flex gap-2.5 rounded-md p-1.5 -m-1.5 hover:bg-surface-sunken">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <p className="text-[13px] leading-relaxed text-default">{text}</p>
    </Link>
  );
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: DISPLAY_TIME_ZONE });
}
