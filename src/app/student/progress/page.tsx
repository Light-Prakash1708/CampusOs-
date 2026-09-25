import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Award, BadgeCheck, CheckCircle2, Lock, ShieldCheck, Trophy } from 'lucide-react';
import { isEnabled } from '@/lib/features';
import { SOURCE_LABEL, type XpSource } from '@/lib/gamification';
import { cn, formatDate } from '@/lib/utils';
import { CampusCard, CampusFilter, CampusProgressBar, CampusSectionHeader, CampusStat } from '@/components/campus';
import { getLeaderboard, getProgress, type BoardPeriod, type BoardScope } from '@/services/gamification';
import { requireStudentContext } from '../_lib/auth';

export const metadata = { title: 'Progress' };
export const dynamic = 'force-dynamic';

const VIS_COPY: Record<string, string> = {
  PUBLIC: 'You appear by name.',
  ANONYMOUS: 'You appear under a pseudonym.',
  PRIVATE: 'Only you can see your position.',
  OPT_OUT: 'You’ve opted out of leaderboards.',
};

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ scope?: string; period?: string }> }) {
  const user = await requireStudentContext();
  if (!isEnabled(user.featureFlags, 'gamification_enabled')) notFound();
  const sp = await searchParams;
  const scope: BoardScope = sp.scope === 'section' ? 'section' : 'college';
  const period: BoardPeriod = sp.period === 'all' ? 'all' : sp.period === 'month' ? 'month' : 'week';
  const boardsOn = isEnabled(user.featureFlags, 'leaderboards_enabled');
  const [p, board] = await Promise.all([getProgress(user), boardsOn ? getLeaderboard(user, scope, period) : Promise.resolve(null)]);
  const pct = Math.round((p.level.xpIntoLevel / Math.max(1, p.level.xpForNext)) * 100);
  const earned = p.achievements.filter((a) => a.earnedAt);
  const qs = (patch: Record<string, string>) => `/student/progress?${new URLSearchParams({ scope, period, ...patch })}#board`;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[26px] font-extrabold text-default sm:text-[30px]">Progress</h1>
        <p className="mt-1 text-[13.5px] text-muted">Levels, badges and weekly challenges — from things you actually did.</p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <CampusCard as="section" className="p-5" aria-labelledby="level-h">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border-[1.5px] border-ink bg-lavender font-display text-[26px] font-extrabold text-lavender-ink shadow-pop">
              {p.level.level}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="level-h" className="font-display text-[20px] font-extrabold text-default">
                Level {p.level.level}
              </h2>
              <p className="text-[13px] text-muted">
                {p.totalXp} XP · {p.level.xpForNext - p.level.xpIntoLevel} XP to level {p.level.level + 1}
              </p>
              <CampusProgressBar value={pct} tone="lavender" label={`Progress to level ${p.level.level + 1}`} className="mt-2" />
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
            <div className="rounded-xl border border-[hsl(var(--border))] p-3">
              <dt className="flex items-center gap-1.5 font-bold text-muted">
                <ShieldCheck size={14} aria-hidden /> Verified XP
              </dt>
              <dd className="tabular font-display text-[20px] font-extrabold text-default">{p.verifiedXp}</dd>
              <dd className="text-[11.5px] text-subtle">Event check-ins and certificates. The only XP that can rank you.</dd>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] p-3">
              <dt className="flex items-center gap-1.5 font-bold text-muted">
                <Lock size={14} aria-hidden /> From your tracker
              </dt>
              <dd className="tabular font-display text-[20px] font-extrabold text-default">{p.totalXp - p.verifiedXp}</dd>
              <dd className="text-[11.5px] text-subtle">Check-ins, goals, streaks, challenges. Counts for your level only.</dd>
            </div>
          </dl>
        </CampusCard>

        <CampusCard as="section" className="p-5" aria-labelledby="ch-h">
          <CampusSectionHeader id="ch-h" title="This week’s challenges" />
          <p className="mt-1 text-[12px] text-subtle">Monday to Sunday. XP is added automatically when you finish one.</p>
          <ul className="mt-3 space-y-3">
            {p.challenges.map((c) => (
              <li key={c.code} className="rounded-xl border border-[hsl(var(--border))] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-bold text-default">{c.title}</span>
                  <span className={cn('shrink-0 text-[12px] font-extrabold', c.done ? 'text-mint-ink' : 'text-muted')}>
                    {c.done ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 size={14} aria-hidden /> +{c.xp} XP
                      </span>
                    ) : (
                      `${c.progress}/${c.target} · ${c.xp} XP`
                    )}
                  </span>
                </div>
                <CampusProgressBar value={(c.progress / c.target) * 100} tone={c.done ? 'mint' : 'sky'} label={`${c.title}: ${c.progress} of ${c.target}`} className="mt-2" />
              </li>
            ))}
          </ul>
        </CampusCard>
      </div>

      <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <CampusStat label="Events attended" value={p.stats.eventsAttended} tone="coral" href="/student/events?mine=registered" />
        <CampusStat label="Certificates" value={p.stats.certificates} tone="sun" href="/student/certificates" />
        <CampusStat label="Days with a check-in" value={p.stats.checkinDays} tone="mint" href="/student/tracker" />
        <CampusStat label="Best streak" value={p.stats.bestStreak} tone="peach" href="/student/tracker" />
        <CampusStat label="Tasks done" value={p.stats.tasksDone} tone="lavender" href="/student/tracker#tasks" />
      </section>

      <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="badges-h">
        <CampusSectionHeader id="badges-h" title={`Badges · ${earned.length} of ${p.achievements.length}`} />
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {p.achievements.map((a) => (
            <li
              key={a.code}
              className={cn('flex gap-3 rounded-xl border-[1.5px] p-3', a.earnedAt ? 'border-ink bg-sun shadow-pop' : 'border-dashed border-[hsl(var(--border-strong))] bg-surface')}
            >
              <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px]', a.earnedAt ? 'border-ink bg-surface text-sun-ink' : 'border-[hsl(var(--border))] text-subtle')}>
                {a.earnedAt ? <Award size={20} aria-hidden /> : <Lock size={16} aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className={cn('flex items-center gap-1 text-[13.5px] font-extrabold', a.earnedAt ? 'text-sun-ink' : 'text-default')}>
                  {a.title}
                  {a.verified ? <BadgeCheck size={14} aria-label="Verified by CampusOS" /> : null}
                </span>
                <span className="block text-[12px] text-muted">{a.description}</span>
                <span className="block text-[11.5px] font-bold text-subtle">
                  {a.earnedAt ? `Earned ${formatDate(a.earnedAt)}` : `${a.progress} / ${a.target}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CampusCard>

      {board ? (
        <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="board-h" id="board">
          <CampusSectionHeader id="board-h" title="Leaderboard" />
          <p className="mt-1 text-[12.5px] text-muted">
            Verified XP only. {VIS_COPY[board.myVisibility] ?? ''}{' '}
            <Link href="/account/privacy" className="font-bold underline">
              Change how you appear
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <CampusFilter
              label="Who"
              options={[
                { key: 'college', label: 'My college', href: qs({ scope: 'college' }), active: scope === 'college' },
                { key: 'section', label: 'My section', href: qs({ scope: 'section' }), active: scope === 'section' },
              ]}
            />
            <CampusFilter
              label="When"
              options={[
                { key: 'week', label: 'This week', href: qs({ period: 'week' }), active: period === 'week' },
                { key: 'month', label: '30 days', href: qs({ period: 'month' }), active: period === 'month' },
                { key: 'all', label: 'All time', href: qs({ period: 'all' }), active: period === 'all' },
              ]}
            />
          </div>
          {board.sectionless ? (
            <p className="mt-4 text-[13px] text-subtle">You aren’t in a section yet, so there’s no section board.</p>
          ) : board.rows.length === 0 ? (
            <p className="mt-4 text-[13px] text-subtle">
              Nobody has verified XP here yet for this period. Get checked in at an event to get on the board.
            </p>
          ) : (
            <ol className="mt-4 divide-y divide-[hsl(var(--border))]" aria-label="Rankings">
              {board.rows.map((r, i) => (
                <li key={`${r.rank}-${i}`} className={cn('flex min-h-[44px] items-center gap-3 px-2 py-2', r.isMe && 'rounded-lg bg-lavender')}>
                  <span className="w-8 text-center font-display text-[15px] font-extrabold text-muted">{r.rank <= 3 ? <Trophy size={16} className="mx-auto text-sun-ink" aria-label={`Rank ${r.rank}`} /> : r.rank}</span>
                  <span className={cn('min-w-0 flex-1 truncate text-[13.5px] font-bold', r.isMe ? 'text-lavender-ink' : 'text-default')}>{r.name}</span>
                  <span className="tabular text-[13px] font-extrabold text-default">{r.xp} XP</span>
                </li>
              ))}
            </ol>
          )}
          {board.me && !board.rows.some((r) => r.isMe) ? (
            <p className="mt-3 rounded-lg bg-lavender px-3 py-2 text-[13px] font-bold text-lavender-ink">
              You’re #{board.me.rank} of {board.total} with {board.me.xp} verified XP.
            </p>
          ) : null}
        </CampusCard>
      ) : null}

      <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="ledger-h">
        <CampusSectionHeader id="ledger-h" title="Recent XP" />
        {p.ledger.length === 0 ? (
          <p className="mt-3 text-[13px] text-subtle">
            No XP yet. <Link href="/student/tracker" className="font-bold underline">Check in to a habit</Link> or <Link href="/student/events" className="font-bold underline">go to an event</Link>.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[hsl(var(--border))]">
            {p.ledger.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-default">{x.reason}</span>
                  <span className="text-[11.5px] text-subtle">
                    {SOURCE_LABEL[x.source as XpSource] ?? x.source} · {formatDate(x.createdAt)}
                    {x.verified ? ' · verified' : ''}
                  </span>
                </span>
                <span className={cn('tabular shrink-0 text-[13px] font-extrabold', x.amount < 0 ? 'text-coral-ink' : 'text-mint-ink')}>
                  {x.amount > 0 ? '+' : ''}
                  {x.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CampusCard>
    </div>
  );
}
