import { BellRing, ClipboardList, FileSpreadsheet, GraduationCap, Mail, MessagesSquare, type LucideIcon } from 'lucide-react';
import { CampusMark } from '@/components/brand';
import { cn } from '@/lib/utils';
import { DoodleArrow } from './art';
import { Reveal } from './motion';
import s from './landing.module.css';

interface Source {
  label: string;
  detail: string;
  icon: LucideIcon;
  bg: string;
  rot: number;
  /** Position on the desktop canvas (percent). */
  x: number;
  y: number;
}

const SOURCES: Source[] = [
  { label: 'Class WhatsApp group', detail: '214 unread', icon: MessagesSquare, bg: 'var(--lp-green-soft)', rot: -5, x: 0, y: 8 },
  { label: 'College portal', detail: 'Log in to see notices', icon: GraduationCap, bg: 'var(--lp-lav-soft)', rot: 3, x: 33, y: 2 },
  { label: 'Email', detail: 'Re: Re: Fwd: internship', icon: Mail, bg: 'var(--lp-coral-soft)', rot: -2, x: 3, y: 42 },
  { label: 'Attendance.xlsx', detail: 'Last updated… ?', icon: FileSpreadsheet, bg: 'var(--lp-blue-soft)', rot: 4, x: 35, y: 38 },
  { label: 'Notice board', detail: 'Room changed tomorrow', icon: BellRing, bg: 'var(--lp-yellow-soft)', rot: -4, x: 1, y: 76 },
  { label: 'Event sign-up form', detail: 'Closes tonight', icon: ClipboardList, bg: '#fce7f3', rot: 2, x: 33, y: 76 },
];

export function Fragmentation() {
  return (
    <section className="relative bg-[var(--lp-cream)] px-5 py-24 sm:px-8 lg:py-32" aria-labelledby="lp-problem">
      <div className="mx-auto grid max-w-[1240px] gap-14 xl:grid-cols-[0.8fr_1.2fr] xl:items-center">
        <Reveal>
          <p className={cn(s.pixelText, 'text-[13px] uppercase text-[#8b5cf6]')}>The problem</p>
          <h2 id="lp-problem" className={cn(s.display, 'mt-4 text-[clamp(38px,5vw,60px)]')}>
            College life is scattered everywhere.
          </h2>
          <p className="mt-6 max-w-[430px] text-[17px] leading-relaxed text-[var(--lp-muted)]">
            The timetable lives in one place, notices in another, attendance in a spreadsheet you can&apos;t see, and the
            hackathon you wanted closed yesterday in a group you muted.
          </p>
        </Reveal>

        {/* Desktop: the sources drift toward one CampusOS card. */}
        <Reveal delay={100} className="relative mx-auto hidden aspect-[1.45/1] w-full max-w-[820px] lg:block">
          <svg className="absolute inset-0 h-full w-full text-[var(--lp-ink)]/55" viewBox="0 0 100 69" preserveAspectRatio="none" aria-hidden>
            {SOURCES.map((src, i) => (
              <path
                key={i}
                className={s.dash}
                d={`M ${src.x + 29} ${src.y * 0.69 + 5} C ${src.x + 44} ${src.y * 0.69 + 5}, 62 ${34 + (i - 2.5) * 3}, 72 34.5`}
                stroke="currentColor"
                strokeWidth="0.35"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {SOURCES.map((src) => (
            <SourceChip key={src.label} src={src} className="absolute w-[29%]" style={{ left: `${src.x}%`, top: `${src.y}%` }} />
          ))}
          <div className="absolute right-0 top-1/2 w-[28%] -translate-y-1/2">
            <Destination />
          </div>
        </Reveal>

        {/* Phones and small tablets: a simple stack. */}
        <Reveal className="lg:hidden">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SOURCES.map((src) => (
              <SourceChip key={src.label} src={src} />
            ))}
          </div>
          <DoodleArrow className="mx-auto my-4 h-12 w-16 rotate-[20deg] text-[var(--lp-ink)]" />
          <Destination />
        </Reveal>
      </div>
    </section>
  );
}

function SourceChip({ src, className, style }: { src: Source; className?: string; style?: React.CSSProperties }) {
  const Icon = src.icon;
  return (
    <div
      className={cn(s.card, s.chip, 'flex min-w-0 items-start gap-2.5 p-3', className)}
      style={{ ...style, background: src.bg, '--rot': `${src.rot}deg` } as React.CSSProperties}
    >
      <Icon size={18} className="mt-0.5 shrink-0 text-[var(--lp-ink)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-extrabold leading-tight text-[var(--lp-ink)]">{src.label}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--lp-muted)]">{src.detail}</p>
      </div>
    </div>
  );
}

function Destination() {
  return (
    <div className="rounded-2xl border-2 border-[var(--lp-ink)] bg-[var(--lp-night)] p-5 text-[var(--lp-cream)] shadow-[5px_5px_0_0_#fbbf24]">
      <CampusMark height={34} />
      <p className="mt-3 text-[20px] font-extrabold leading-tight tracking-tight">
        CampusOS brings the pieces together.
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-[#c9c1ee]">One home for your classes, notices, events and plans.</p>
    </div>
  );
}
