import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { requireStudentContext } from '@/app/student/_lib/auth';
import {
  getAttendanceRows,
  getCurrentTerm,
  getInstitutionTimezone,
  getPublishedTimetable,
  getScheduleExceptions,
  getWeeklyClasses,
  getEnrolledOfferings,
  summariseAttendance,
} from '@/app/student/_lib/student';
import { getHolidays } from '@/app/student/_lib/campus';
import { findNextClass } from '@/app/student/_lib/schedule';
import { addIsoDays, DAY_LABEL, zonedNow } from '@/app/student/_lib/time';
import { CampusComingSoon, CampusRing, CampusSectionHeader, CampusSpeech, PixelAvatar, avatarToneFor } from '@/components/campus';
import { CampusToolCard } from '@/components/campus/tools';
import { ToolOpenLink } from '@/components/campus/ToolOpenLink';
import { isEnabled } from '@/lib/features';
import { mostUsed, type ResolvedTool } from '@/lib/tools';
import { pluralize } from '@/lib/utils';
import { listEvents } from '@/services/events';
import { listForStudent } from '@/services/opportunities';
import { listToolsFor } from '@/services/tools';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tools & Utilities' };

/**
 * TOOLS & UTILITIES HUB
 * Every tool comes from the registry (src/lib/tools.ts): available tools link
 * to working pages, unbuilt ones say which phase delivers them. Numbers on
 * the cards are this student's own records; where there are none, the card
 * says so. Order follows the student's own usage (most-opened first).
 */
export default async function ToolsPage() {
  const user = await requireStudentContext();
  const tools = await listToolsFor(user);
  const byKey = new Map(tools.map((t) => [t.key, t]));

  const [highlights, favourites] = [await loadHighlights(user, byKey), mostUsed(tools)];
  const featured = tools.filter((t) => t.featured);
  const more = tools.filter((t) => !t.featured);
  const available = tools.filter((t) => t.status === 'AVAILABLE').length;
  const planned = tools.filter((t) => t.status === 'PLANNED').length;

  return (
    <div className="space-y-6">
      {/* ------------------------------- header ------------------------------ */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-extrabold leading-tight text-default sm:text-[34px]">Tools &amp; Utilities</h1>
          <p className="mt-1 text-[14px] text-muted">Everything you need to make student life easier.</p>
          <p className="mt-2 text-[12.5px] font-semibold text-subtle">
            {pluralize(available, 'tool')} ready · {planned} more on the roadmap
          </p>
        </div>
        <div className="hidden items-center gap-3 sm:flex" aria-hidden>
          <CampusSpeech>Small tools. Big peace of mind.</CampusSpeech>
          <PixelAvatar tone={avatarToneFor(user.userId)} size={56} />
        </div>
      </header>

      {/* ---------------------------- most used ------------------------------ */}
      {favourites.length ? (
        <section aria-labelledby="fav-h">
          <CampusSectionHeader id="fav-h" title="Your most used" />
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {favourites.map((t) => (
              <li key={t.key} className="shrink-0">
                <ToolOpenLink
                  tool={t.key}
                  href={t.href!}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-[1.5px] border-ink bg-surface-raised px-3.5 text-[13px] font-bold text-default shadow-pop campus-press"
                >
                  {t.title}
                  <span className="tabular text-[11px] font-semibold text-subtle">{t.openCount}×</span>
                </ToolOpenLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ----------------------------- featured ------------------------------ */}
      <section aria-label="Main tools">
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {featured.map((t) => (
            <li key={t.key}>
              <CampusToolCard tool={t} variant="feature" highlight={highlights[t.key]} />
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------- attendance planner banner ---------------------- */}
      {byKey.has('attendance') ? <AttendanceBanner data={highlights.__attendance as AttendanceSummary | undefined} tools={byKey} /> : null}

      {/* ------------------------------- more -------------------------------- */}
      <section aria-labelledby="more-h">
        <CampusSectionHeader id="more-h" title="And a few more things you’ll love" />
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {more.map((t) => (
            <li key={t.key}>
              <CampusToolCard tool={t} variant="compact" />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] text-subtle">
          Tools marked “Coming in Phase N” are on the CampusOS roadmap and switch on here automatically when they ship. Your most-opened tools move to the front — that
          count is visible only to you and is part of{' '}
          <Link href="/account/privacy" className="font-semibold text-brand underline-offset-2 hover:underline">
            your data
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

interface AttendanceSummary {
  held: number;
  attended: number;
  pct: number | null;
  headroom: number;
  atRisk: number;
}

type Highlights = Record<string, React.ReactNode> & { __attendance?: unknown };

/** Real, per-student highlights for the featured cards. Each is optional. */
async function loadHighlights(
  user: Awaited<ReturnType<typeof requireStudentContext>>,
  tools: Map<string, ResolvedTool>,
): Promise<Highlights> {
  const out: Highlights = {};
  const on = (key: string) => tools.get(key)?.status === 'AVAILABLE';

  const [rows, nextClass, events, openings] = await Promise.all([
    on('attendance') ? getAttendanceRows(user.institutionId, user.studentProfileId) : Promise.resolve(null),
    on('timetable') ? loadNextClass(user) : Promise.resolve(null),
    on('events') && isEnabled(user.featureFlags, 'events_enabled') ? listEvents(user, { when: 'upcoming', sort: 'date', limit: 60 }) : Promise.resolve(null),
    on('opportunities') ? listForStudent(user, { limit: 200 }) : Promise.resolve(null),
  ]);

  if (rows) {
    const s = summariseAttendance(rows);
    const summary: AttendanceSummary = {
      held: s.held,
      attended: s.attended,
      pct: s.held > 0 ? s.percentageBp / 100 : null,
      headroom: rows.reduce((n, r) => n + r.absenceHeadroom, 0),
      atRisk: s.atRisk.length,
    };
    out.__attendance = summary;
    out.attendance = (
      <div className="flex items-center gap-3 rounded-xl border-[1.5px] border-ink bg-surface p-2.5">
        <CampusRing value={summary.pct} label="Overall attendance" size={64} thickness={9} tone={summary.atRisk ? 'coral' : 'mint'} emptyLabel="—" />
        <p className="text-[12px] leading-snug text-muted">
          {summary.pct === null ? (
            'No classes marked yet.'
          ) : (
            <>
              <span className="font-bold text-default">
                {summary.attended} of {summary.held}
              </span>{' '}
              classes attended
              {summary.atRisk ? <span className="block font-bold text-coral-ink">{pluralize(summary.atRisk, 'subject')} below the line</span> : null}
            </>
          )}
        </p>
      </div>
    );
  }

  if (on('timetable')) {
    out.timetable = (
      <div className="rounded-xl border-[1.5px] border-ink bg-surface p-2.5 text-[12px]">
        {nextClass ? (
          <>
            <p className="font-bold uppercase tracking-wide text-subtle" style={{ fontSize: 10.5 }}>
              Next class{nextClass.isToday ? ' · today' : ` · ${DAY_LABEL[nextClass.occurrence.day]}`}
            </p>
            <p className="mt-0.5 truncate font-extrabold text-default">{nextClass.occurrence.subjectName}</p>
            <p className="text-muted">
              <span className="tabular">{nextClass.occurrence.startTime.slice(0, 5)}</span>
              {nextClass.occurrence.roomCode ? ` · ${nextClass.occurrence.roomCode}` : ''}
            </p>
          </>
        ) : (
          <p className="text-muted">No classes in the next week.</p>
        )}
      </div>
    );
  }

  if (events) {
    const registered = events.filter((e) => e.myStatus === 'REGISTERED').length;
    out.events = (
      <div className="rounded-xl border-[1.5px] border-ink bg-surface p-2.5 text-[12px] text-muted">
        {events.length ? (
          <>
            <span className="font-extrabold text-default">{pluralize(events.length, 'upcoming event')}</span> you can see
            {registered ? <span className="block">You’re registered for {registered}.</span> : null}
          </>
        ) : (
          'No upcoming events right now.'
        )}
      </div>
    );
  }
  if (openings) {
    const strong = openings.filter((o) => o.skills.length > 0 && o.match.matched.length / o.skills.length >= 0.5).length;
    out.opportunities = (
      <div className="rounded-xl border-[1.5px] border-ink bg-surface p-2.5 text-[12px] text-muted">
        {openings.length ? (
          <>
            <span className="font-extrabold text-default">{pluralize(openings.length, 'open listing')}</span> at your college
            {strong ? <span className="block">{strong} match at least half your skills.</span> : null}
          </>
        ) : (
          'No open listings right now.'
        )}
      </div>
    );
  }
  return out;
}

async function loadNextClass(user: Awaited<ReturnType<typeof requireStudentContext>>) {
  const now = zonedNow(await getInstitutionTimezone(user.institutionId));
  const term = await getCurrentTerm(user.institutionId);
  const timetable = term ? await getPublishedTimetable(user.institutionId, term.id) : null;
  if (!timetable || !user.sectionId) return null;
  const [classes, offerings] = await Promise.all([
    getWeeklyClasses(user.institutionId, user.sectionId, timetable.versionId),
    getEnrolledOfferings(user.institutionId, user.studentProfileId),
  ]);
  const horizon = addIsoDays(now.today, 8);
  const [exceptions, holidays] = await Promise.all([
    getScheduleExceptions(user.institutionId, offerings.map((o) => o.offeringId), classes.map((c) => c.entryId), now.today, horizon),
    getHolidays(user.institutionId, now.today, horizon),
  ]);
  return findNextClass(now.today, now.minutes, classes, exceptions, new Set(holidays.map((h) => h.date)));
}

/**
 * The reference's "student favourite" banner, framed as planning: the
 * student's real standing and absence headroom (classes that can be missed
 * while every subject stays at its minimum), with the Attendance Planner as
 * the call to action.
 */
function AttendanceBanner({ data, tools }: { data: AttendanceSummary | undefined; tools: Map<string, ResolvedTool> }) {
  const planner = tools.get('attendance-planner');
  const attendance = tools.get('attendance');
  return (
    <section aria-labelledby="bunk-h" className="rounded-2xl border-[1.5px] border-ink bg-sun p-4 shadow-pop sm:p-5">
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded-md bg-ink px-2 py-0.5 text-[11px] font-bold text-white">
            <Sparkles size={11} aria-hidden /> Student favourite
          </span>
          <h2 id="bunk-h" className="mt-2 font-display text-[22px] font-extrabold leading-tight text-default sm:text-[26px]">
            Know exactly how many classes you can safely miss.
          </h2>
          <p className="mt-1 max-w-2xl text-[13.5px] text-sun-ink">
            Your headroom is worked out from the classes your faculty have marked and each subject’s minimum attendance — no guessing.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {planner?.status === 'AVAILABLE' && planner.href ? (
              <ToolOpenLink
                tool="attendance-planner"
                href={planner.href}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-ink px-4 text-[13.5px] font-bold text-white shadow-pop campus-press"
              >
                Open Attendance Planner <ArrowRight size={15} aria-hidden />
              </ToolOpenLink>
            ) : null}
            {attendance?.href ? (
              <ToolOpenLink
                tool="attendance"
                href="/student/attendance?view=subjects#subjects"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-surface px-4 text-[13.5px] font-bold text-default shadow-pop campus-press"
              >
                See subject headroom <ArrowRight size={15} aria-hidden />
              </ToolOpenLink>
            ) : null}
            {planner?.status === 'DISABLED' ? <CampusComingSoon label="Planner is off at your college" /> : null}
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border-[1.5px] border-ink bg-surface p-3.5 shadow-pop">
          <CampusRing value={data?.pct ?? null} label="Current attendance" sublabel="current" size={96} thickness={12} tone={data?.atRisk ? 'coral' : 'mint'} emptyLabel="No classes yet" />
          <div className="min-w-[150px]">
            <p className="text-[12px] font-semibold text-muted">Classes you can miss</p>
            {data && data.pct !== null ? (
              <>
                <p className="tabular font-display text-[34px] font-extrabold leading-none text-default">{data.headroom}</p>
                <p className="mt-1 text-[11.5px] text-subtle">
                  {data.atRisk
                    ? `in subjects still above their minimum. ${pluralize(data.atRisk, 'subject')} ${data.atRisk === 1 ? 'needs' : 'need'} recovery first.`
                    : 'while staying above every subject’s minimum'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[12.5px] text-subtle">Appears once attendance is marked.</p>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11.5px] text-sun-ink">
        Estimates from recorded classes and your college’s minimum per subject. Institutional attendance policies may differ.
      </p>
    </section>
  );
}
