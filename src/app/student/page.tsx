import Link from 'next/link';
import { and, count, eq, isNotNull, lt } from 'drizzle-orm';
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  CalendarCheck2,
  CalendarDays,
  ClipboardList,
  FileText,
  Flame,
  Megaphone,
  MapPin,
  Mountain,
  RefreshCw,
  Sparkles,
  Target,
  Ticket,
  Users,
} from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { isEnabled } from '@/lib/features';
import { cn, formatDate, relativeTime } from '@/lib/utils';
import {
  CampusCard,
  CampusEmptyState,
  CampusIllustration,
  CampusNotice,
  CampusPill,
  CampusProgressRow,
  CampusQuickAction,
  CampusSectionHeader,
  CampusSpeech,
  CampusIconTile,
  CampusTimeline,
  PixelAvatar,
  avatarToneFor,
  type TimelineItem,
  type Tone,
} from '@/components/campus';
import type { LucideIcon } from 'lucide-react';
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
import { EVENT_CATEGORIES, listEvents } from '@/services/events';
import { getAttendanceOverview } from '@/services/attendance';
import { trackerForToday } from '@/services/tracker';
import { levelOf } from '@/services/gamification';
import { loansDueSoon } from '@/services/library';
import { buildToday, type TodayItem } from '@/lib/today';
import { categoryTone, EventCoverArt, formatEventDates } from '@/components/campus/events';
import { findNextClass, occurrencesForDate, type ClassOccurrence } from './_lib/schedule';
import { addIsoDays, DAY_LABEL, isoToDate, timeToMinutes, zonedNow } from './_lib/time';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

/**
 * STUDENT HOME — "a calm information hierarchy".
 * Every number on this page comes from the student's own records. Where a
 * record does not exist yet, the page says so rather than inventing a value.
 */
export default async function StudentHome() {
  const user = await requireStudentContext();
  const timeZone = await getInstitutionTimezone(user.institutionId);
  const now = zonedNow(timeZone);

  const [term, offerings, attendanceRows, assignments, announcements, changes, identity, activity] = await Promise.all([
    getCurrentTerm(user.institutionId),
    getEnrolledOfferings(user.institutionId, user.studentProfileId),
    getAttendanceRows(user.institutionId, user.studentProfileId),
    getStudentAssignments(user.institutionId, user.studentProfileId),
    getStudentAnnouncements(user.institutionId, user.userId),
    getStudentChanges(user.institutionId, user.sectionId, user.userId, 6),
    loadIdentity(user.studentProfileId),
    loadCampusActivity(user.userId),
  ]);

  const timetable = term ? await getPublishedTimetable(user.institutionId, term.id) : null;
  const classes =
    timetable && user.sectionId ? await getWeeklyClasses(user.institutionId, user.sectionId, timetable.versionId) : [];
  const horizonEnd = addIsoDays(now.today, 8);
  const [exceptions, holidays, events] = await Promise.all([
    getScheduleExceptions(user.institutionId, offerings.map((o) => o.offeringId), classes.map((c) => c.entryId), now.today, horizonEnd),
    getHolidays(user.institutionId, now.today, horizonEnd),
    isEnabled(user.featureFlags, 'events_enabled')
      ? listEvents(user, { when: 'upcoming', sort: 'date', limit: 3 })
      : Promise.resolve([]),
  ]);
  const eventsOnForDay = isEnabled(user.featureFlags, 'events_enabled');
  const [myEvents, savedEvents, attendanceOverview, trackerToday, level, loansDue] = await Promise.all([
    eventsOnForDay ? listEvents(user, { mine: 'registered', when: 'upcoming', sort: 'date', limit: 10 }) : Promise.resolve([]),
    eventsOnForDay ? listEvents(user, { mine: 'saved', when: 'upcoming', sort: 'date', limit: 20 }) : Promise.resolve([]),
    user.permissions.has('attendance:view_own') ? getAttendanceOverview(user) : Promise.resolve(null),
    trackerForToday(user),
    isEnabled(user.featureFlags, 'gamification_enabled') ? levelOf(user.userId) : Promise.resolve(null),
    user.permissions.has('library:borrow') ? loansDueSoon(user) : Promise.resolve([]),
  ]);

  const holidayToday = holidays.find((h) => h.date === now.today) ?? null;
  const todays = holidayToday ? [] : occurrencesForDate(now.today, classes, exceptions);
  const next = findNextClass(now.today, now.minutes, classes, exceptions, new Set(holidays.map((h) => h.date)));

  /* ---------------------------- progress (real) --------------------------- */
  const attendance = summariseAttendance(attendanceRows);
  const attendancePct = attendance.held > 0 ? attendance.percentageBp / 100 : null;
  const dueOrDone = assignments.filter((a) => a.bucket !== 'DUE_SOON' || a.submission);
  const submitted = assignments.filter((a) => a.bucket === 'SUBMITTED' || a.bucket === 'EVALUATED');
  const assignmentPct = dueOrDone.length > 0 ? (submitted.length / dueOrDone.length) * 100 : null;
  const activityPct = activity.pastRegistrations > 0 ? (activity.attended / activity.pastRegistrations) * 100 : null;
  const habitsDue = trackerToday.goals.length;
  const habitsDone = trackerToday.goals.filter((g) => g.doneToday).length;
  const goalsPct = habitsDue > 0 ? (habitsDone / habitsDue) * 100 : null;

  const f = user.featureFlags;
  const trackerOn = isEnabled(f, 'personal_tracker_enabled');
  const eventsOn = isEnabled(f, 'events_enabled');
  const libraryOn = isEnabled(f, 'resource_hub_enabled');
  const aiOn = isEnabled(f, 'ai_assistant_enabled') && user.permissions.has('ai:use_assistant');

  const quickActions = [
    { href: '/student/attendance', icon: CalendarCheck2, label: 'Attendance Planner', tone: 'mint' as Tone, on: true },
    { href: '/student/assignments', icon: ClipboardList, label: 'Submit Assignment', tone: 'coral' as Tone, on: true },
    { href: '/student/events', icon: Ticket, label: 'Explore Events', tone: 'lavender' as Tone, on: eventsOn },
    { href: '/student/tracker', icon: Target, label: 'Track Goals', tone: 'mint' as Tone, on: trackerOn },
    { href: '/student/assistant', icon: Sparkles, label: 'Ask AI', tone: 'lavender' as Tone, on: aiOn },
    isEnabled(f, 'opportunity_hub_enabled')
      ? { href: '/student/opportunities', icon: Briefcase, label: 'Discover Opportunities', tone: 'sun' as Tone, on: true }
      : { href: '/student/skills', icon: Mountain, label: 'Career & Skills', tone: 'sun' as Tone, on: isEnabled(f, 'skill_engine_enabled') },
    { href: '/student/assessments', icon: FileText, label: 'Exams & Results', tone: 'sky' as Tone, on: true },
  ]
    .filter((a) => a.on)
    .slice(0, 6);

  /* ------------------------------ notices ---------------------------------- */
  type Item = { key: string; icon: LucideIcon; tone: Tone; title: string; meta: string; href: string; at: number; unread: boolean };
  const noticeItems: Item[] = [
    ...changes.map((c) => ({
      key: `c-${c.id}`,
      icon: RefreshCw,
      tone: 'peach' as Tone,
      title: c.title,
      meta: `${c.summary} · ${relativeTime(c.createdAt)}`,
      href: '/student/announcements?tab=changes',
      at: c.createdAt.getTime(),
      unread: false,
    })),
    ...announcements.slice(0, 8).map((a) => ({
      key: `a-${a.id}`,
      icon: a.priority === 'CRITICAL' ? AlertTriangle : Megaphone,
      tone: (a.priority === 'CRITICAL' ? 'coral' : a.category === 'EVENT' ? 'lavender' : 'sky') as Tone,
      title: a.title,
      meta: `${a.authorName ?? a.departmentName ?? 'Notice'} · ${relativeTime(a.publishedAt)}`,
      href: `/student/announcements#${a.id}`,
      at: a.publishedAt?.getTime() ?? 0,
      unread: !a.readAt,
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 4);

  /* ------------------------------ your day -------------------------------- */
  const dayItems = buildToday({
    today: now.today,
    nowMinutes: now.minutes,
    timeZone,
    classes: todays.map((c) => ({ key: c.key, subject: c.subjectName, room: c.roomCode, start: c.startTime, end: c.endTime, status: c.status })),
    nextClass: next && !next.isToday ? { subject: next.occurrence.subjectName, room: next.occurrence.roomCode, start: next.occurrence.startTime, dayLabel: DAY_LABEL[next.occurrence.day] } : null,
    assignments: assignments.map((a) => ({ id: a.id, title: a.title, subject: a.subjectName, dueAt: a.dueAt, submitted: a.bucket === 'SUBMITTED' || a.bucket === 'EVALUATED' })),
    attentionSubjects: (attendanceOverview?.advice ?? [])
      .filter((a) => a.offeringId && (a.severity === 'critical' || a.severity === 'warning'))
      .map((a) => ({ offeringId: a.offeringId!, title: a.title, body: a.body, critical: a.severity === 'critical' })),
    events: [...new Map([...myEvents, ...savedEvents].map((e) => [e.id, e])).values()].map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      venue: e.mode === 'ONLINE' ? 'Online' : e.venue ?? e.area ?? e.city ?? 'Venue to be announced',
      registered: e.myStatus === 'REGISTERED',
      registrationDeadline: e.registrationDeadline,
      saved: e.saved,
    })),
    notices: announcements.map((a) => ({ id: a.id, title: a.title, critical: a.priority === 'CRITICAL' && !a.readAt, needsAck: a.requiresAcknowledgement && !a.acknowledgedAt })),
    tasks: trackerToday.tasks,
    goals: trackerToday.goals,
    loans: loansDue,
  });

  // Events 2.0: includes other colleges' public events when discovery is on,
  // and the student's own registration state.
  const upcomingEvents = events;

  return (
    <div className="space-y-5">
      {/* ------------------------------ greeting ------------------------------ */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-extrabold leading-tight text-default sm:text-[32px]">
            {greeting(now.minutes)}, {user.firstName}! <span aria-hidden>{greetingEmoji(now.minutes)}</span>
          </h1>
          <p className="mt-1 text-[14.5px] font-medium text-muted">Same campus. Bigger opportunities.</p>
          <p className="mt-1 text-[12.5px] font-semibold text-subtle">
            {[identity, DAY_LABEL[now.day], formatDate(isoToDate(now.today))].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="hidden items-center gap-3 md:flex" aria-hidden>
          <PixelAvatar tone={avatarToneFor(user.userId)} size={52} />
          <CampusSpeech>“{dailyLine(now.today)}”</CampusSpeech>
        </div>
      </header>

      <YourDay items={dayItems} />

      {/* -------------------- schedule · campus · progress -------------------- */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="today-h">
          <CampusSectionHeader id="today-h" title="Today’s Schedule" href="/student/schedule" />
          <div className="mt-4">
            {holidayToday ? (
              <CampusEmptyState sprite="student" title={`No classes — ${holidayToday.name}`} description="Enjoy the day off." />
            ) : todays.length === 0 ? (
              <CampusEmptyState
                sprite="student"
                title="No classes today"
                description={
                  next
                    ? `Next: ${next.occurrence.subjectName} on ${DAY_LABEL[next.occurrence.day]} at ${next.occurrence.startTime.slice(0, 5)}.`
                    : timetable
                      ? 'Nothing scheduled in the next week.'
                      : 'Your timetable has not been published yet.'
                }
              />
            ) : (
              <CampusTimeline items={toTimeline(todays, now.minutes)} />
            )}
          </div>
        </CampusCard>

        <CampusCard as="section" className="relative hidden overflow-hidden md:order-last md:block xl:order-none" aria-label="Campus quick links">
          <CampusIllustration name="home-hero" priority sizes="(min-width: 1280px) 460px, (min-width: 768px) 50vw, 100vw" className="h-full object-cover" />
          {/* The signposts in the illustration are real links. */}
          <nav aria-label="Campus shortcuts" className="absolute inset-y-0 right-[4%] w-[36%]">
            {HOTSPOTS.filter((h) => h.when(f, aiOn)).map((h) => (
              <Link
                key={h.href}
                href={h.href}
                aria-label={h.label}
                title={h.label}
                className="absolute left-0 right-0 rounded-md focus-visible:outline-[3px] focus-visible:outline-offset-1 hover:bg-white/15"
                style={{ top: `${h.top}%`, height: '10%' }}
              />
            ))}
          </nav>
        </CampusCard>

        <CampusCard as="section" className="flex flex-col p-4 sm:p-5" aria-labelledby="progress-h">
          <CampusSectionHeader id="progress-h" title="My Progress" href={trackerOn ? '/student/tracker' : '/student/attendance'} />
          <div className="mt-4 space-y-4">
            <CampusProgressRow icon={CalendarDays} label="Attendance" value={attendancePct} tone="mint" href="/student/attendance" emptyText="No classes marked yet" />
            <CampusProgressRow icon={ClipboardList} label="Assignments" value={assignmentPct} tone="lavender" href="/student/assignments" emptyText="No assignments due yet" detail={`${submitted.length} of ${dueOrDone.length} submitted`} />
            {trackerOn ? (
              <CampusProgressRow
                icon={Target}
                label="Today’s habits"
                value={goalsPct}
                tone="peach"
                href="/student/tracker"
                emptyText="No daily habits yet — start with one small thing"
                detail={habitsDue ? `${habitsDone} of ${habitsDue} checked in today` : undefined}
              />
            ) : null}
            {eventsOn ? (
              <CampusProgressRow icon={Users} label="Campus Activity" value={activityPct} tone="coral" href="/student/events" emptyText="Attend an event to see this" detail={`${activity.attended} of ${activity.pastRegistrations} events attended`} />
            ) : null}
          </div>
          {level ? (
            <Link href="/student/progress" className="mt-auto flex min-h-[44px] items-center gap-2 rounded-xl border-[1.5px] border-ink bg-surface px-3 py-2.5 shadow-pop campus-press">
              <Flame size={18} className="text-peach-ink" aria-hidden />
              <span className="text-[13px] font-bold text-default">
                {level.totalXp > 0 ? `Level ${level.level} · ${level.xpForNext - level.xpIntoLevel} XP to level ${level.level + 1}` : 'Earn XP: check in to a habit or attend an event'}
              </span>
            </Link>
          ) : null}
        </CampusCard>
      </div>

      {/* ---------------------------- quick actions --------------------------- */}
      <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {quickActions.map((a) => (
          <CampusQuickAction key={a.href} href={a.href} icon={a.icon} label={a.label} tone={a.tone} />
        ))}
      </section>

      {/* ------------------------- events · notices -------------------------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {eventsOn ? (
          <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="events-h">
            <CampusSectionHeader id="events-h" title="Upcoming Events" href="/student/events" />
            {upcomingEvents.length === 0 ? (
              <CampusEmptyState sprite="student" title="No events coming up yet" description="When your college schedules events, they appear here." />
            ) : (
              <ul className="-mx-1 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
                {upcomingEvents.map((e) => {
                  const where = e.mode === 'ONLINE' ? 'Online' : e.venue ?? e.area ?? e.city ?? 'Venue to be announced';
                  return (
                    <li key={e.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
                      <Link href={`/student/events/${e.id}`} className="group block overflow-hidden rounded-xl border-[1.5px] border-ink bg-surface-raised shadow-pop campus-press">
                        <EventCoverArt title={e.title} tone={categoryTone(e.category)} className="h-20 border-b-[1.5px] border-ink" />
                        <div className="p-3">
                          <p className="line-clamp-2 text-[13px] font-extrabold leading-snug text-default">{e.title}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted">
                            <MapPin size={11} aria-hidden /> <span className="truncate">{where}{e.ownCollege ? '' : ` · ${e.institutionShort ?? e.institutionName}`}</span>
                          </p>
                          <p className="text-[11.5px] font-semibold text-subtle">{formatEventDates(e.startsAt, e.endsAt)}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <CampusPill tone={categoryTone(e.category)}>{EVENT_CATEGORIES[e.category as keyof typeof EVENT_CATEGORIES] ?? 'Event'}</CampusPill>
                            {e.myStatus === 'REGISTERED' ? <CampusPill tone="mint">Registered ✓</CampusPill> : null}
                            {e.myStatus === 'WAITLISTED' ? <CampusPill tone="sun">Waitlisted</CampusPill> : null}
                            {e.demo ? <CampusPill tone="sun">Demo</CampusPill> : null}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CampusCard>
        ) : null}

        <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="notices-h">
          <CampusSectionHeader id="notices-h" title="Notices & Updates" href="/student/announcements" linkLabel="See All" />
          {noticeItems.length === 0 ? (
            <CampusEmptyState sprite="robot" title="All caught up" description="New notices and schedule changes will show up here." />
          ) : (
            <div className="mt-3 divide-y divide-[hsl(var(--border))]">
              {noticeItems.map((n) => (
                <CampusNotice key={n.key} icon={n.icon} tone={n.tone} title={n.title} meta={n.meta} href={n.href} unread={n.unread} />
              ))}
            </div>
          )}
        </CampusCard>
      </div>

      {libraryOn ? (
        <p className="text-center text-[12px] text-subtle">
          <BookOpen size={12} className="mr-1 inline" aria-hidden />
          Looking for notes or PYQs? <Link href="/student/library" className="font-bold text-brand hover:underline">Visit the library</Link>
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------ helpers ---------------------------------- */

const HOTSPOTS: { label: string; href: string; top: number; when: (f: Record<string, boolean>, ai: boolean) => boolean }[] = [
  { label: 'Attend class — open your attendance planner', href: '/student/attendance', top: 22, when: () => true },
  { label: 'Explore events', href: '/student/events', top: 35, when: (f) => isEnabled(f, 'events_enabled') },
  { label: 'Complete tasks — open assignments', href: '/student/assignments', top: 48, when: () => true },
  { label: 'Visit library', href: '/student/library', top: 61, when: (f) => isEnabled(f, 'resource_hub_enabled') },
  { label: 'Ask AI assistant', href: '/student/assistant', top: 75, when: (_f, ai) => ai },
];

function toTimeline(items: ClassOccurrence[], nowMinutes: number): TimelineItem[] {
  let nextMarked = false;
  return items.map((o) => {
    const start = timeToMinutes(o.startTime) ?? 0;
    const end = timeToMinutes(o.endTime) ?? 0;
    let status: TimelineItem['status'] = 'upcoming';
    if (o.status === 'CANCELLED') status = 'cancelled';
    else if (nowMinutes >= start && nowMinutes < end) status = 'ongoing';
    else if (end <= nowMinutes) status = 'done';
    else if (!nextMarked) {
      status = 'next';
      nextMarked = true;
    }
    const note =
      o.status === 'CANCELLED' ? 'Cancelled'
        : o.status === 'ROOM_CHANGED' ? 'Room changed'
          : o.status === 'FACULTY_SUBSTITUTED' ? 'Substitute teacher'
            : o.status === 'ONLINE' ? 'Online'
              : o.status === 'EXTRA_CLASS' ? 'Extra class'
                : o.status === 'TIME_CHANGED' ? 'New time' : null;
    return {
      key: o.key,
      start: o.startTime.slice(0, 5),
      end: o.endTime.slice(0, 5),
      title: o.subjectName,
      meta: [o.roomCode, o.facultyName].filter(Boolean).join(' · ') || null,
      status,
      note,
    };
  });
}

async function loadIdentity(studentProfileId: string): Promise<string | null> {
  const [row] = await db
    .select({ program: t.programs.name, year: t.studentProfiles.currentYear, section: t.sections.name })
    .from(t.studentProfiles)
    .innerJoin(t.programs, eq(t.programs.id, t.studentProfiles.programId))
    .leftJoin(t.sections, eq(t.sections.id, t.studentProfiles.sectionId))
    .where(eq(t.studentProfiles.id, studentProfileId))
    .limit(1);
  if (!row) return null;
  return [row.program, `Year ${row.year}`, row.section ? `Section ${row.section}` : null].filter(Boolean).join(' · ');
}

/** Event registrations whose event has ended, and how many were attended. */
/**
 * Past confirmed registrations vs attended. Selected by user, not tenant:
 * registrations for other colleges' public events are stored under the
 * organiser's institution but are still this student's campus activity.
 */
async function loadCampusActivity(userId: string) {
  const base = and(
    eq(t.eventRegistrations.userId, userId),
    eq(t.eventRegistrations.status, 'REGISTERED'),
    lt(t.events.endsAt, new Date()),
  );
  const [past] = await db
    .select({ n: count() })
    .from(t.eventRegistrations)
    .innerJoin(t.events, eq(t.events.id, t.eventRegistrations.eventId))
    .where(base);
  const [attended] = await db
    .select({ n: count() })
    .from(t.eventRegistrations)
    .innerJoin(t.events, eq(t.events.id, t.eventRegistrations.eventId))
    .where(and(base, isNotNull(t.eventRegistrations.attendedAt)));
  return { pastRegistrations: past?.n ?? 0, attended: attended?.n ?? 0 };
}

function greeting(minutes: number): string {
  if (minutes < 12 * 60) return 'Good Morning';
  if (minutes < 17 * 60) return 'Good Afternoon';
  return 'Good Evening';
}
function greetingEmoji(minutes: number): string {
  if (minutes < 12 * 60) return '☀️';
  if (minutes < 17 * 60) return '🌤️';
  return '🌙';
}

const LINES = [
  'Today’s a good day to be 1% better.',
  'Small steps every day.',
  'Discipline now, freedom later.',
  'One class at a time.',
  'Show up. That’s half of it.',
  'Curiosity is a superpower.',
  'Future you says thanks.',
];
function dailyLine(iso: string): string {
  const d = Number(iso.replace(/-/g, '')) % LINES.length;
  return LINES[d]!;
}

const DAY_KIND: Record<TodayItem['kind'], { icon: LucideIcon; tone: Tone; label: string }> = {
  class: { icon: CalendarDays, tone: 'sky', label: 'Class' },
  deadline: { icon: ClipboardList, tone: 'lavender', label: 'Deadline' },
  attendance: { icon: CalendarCheck2, tone: 'coral', label: 'Attendance' },
  event: { icon: Ticket, tone: 'sun', label: 'Event' },
  registration: { icon: Ticket, tone: 'peach', label: 'Registration' },
  notice: { icon: Megaphone, tone: 'rose', label: 'Notice' },
  task: { icon: ClipboardList, tone: 'mint', label: 'Task' },
  goal: { icon: Target, tone: 'mint', label: 'Goal' },
  library: { icon: BookOpen, tone: 'peach', label: 'Library' },
};

/** "What matters today" — one ranked list from real records (src/lib/today.ts). */
function YourDay({ items }: { items: TodayItem[] }) {
  return (
    <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="day-h">
      <CampusSectionHeader id="day-h" title="Your Day" />
      {items.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
          <CalendarCheck2 size={16} className="text-mint-ink" aria-hidden /> Nothing pressing today — no deadlines, warnings or events waiting on you.
        </p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {items.map((it, i) => (
              // Phones: the four most important; the rest behind "Show more".
              <li key={it.key} className={i >= 4 ? 'hidden md:block' : undefined}>
                <DayItem it={it} />
              </li>
            ))}
          </ul>
          {items.length > 4 ? (
            <details className="mt-2 md:hidden">
              <summary className="flex min-h-[44px] cursor-pointer items-center text-[13px] font-bold text-brand">Show {items.length - 4} more</summary>
              <ul className="space-y-2">
                {items.slice(4).map((it) => (
                  <li key={it.key}>
                    <DayItem it={it} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </CampusCard>
  );
}

function DayItem({ it }: { it: TodayItem }) {
  const k = DAY_KIND[it.kind];
  return (
    <Link
                  href={it.href}
                  className={cn(
                    'flex h-full items-start gap-2.5 rounded-xl border-[1.5px] p-2.5 transition-colors hover:bg-surface-sunken/60',
                    it.urgent ? 'border-coral-ink bg-coral/60' : 'border-[hsl(var(--border-strong))] bg-surface',
                  )}
                >
                  <CampusIconTile icon={k.icon} tone={k.tone} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-extrabold text-default">{it.title}</span>
                      <span className={cn('tabular shrink-0 text-[11.5px] font-bold', it.urgent ? 'text-coral-ink' : 'text-subtle')}>{it.when}</span>
                    </span>
                    <span className="line-clamp-2 block text-[12px] leading-snug text-muted">{it.detail}</span>
                    <span className="sr-only">{k.label}</span>
                  </span>
                </Link>
  );
}
