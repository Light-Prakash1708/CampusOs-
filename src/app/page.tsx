import Link from 'next/link';
import {
  CalendarClock,
  Megaphone,
  Sparkles,
  Gauge,
  LifeBuoy,
  Target,
  ShieldCheck,
  ArrowRight,
  Check,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';

export const metadata = {
  title: 'CampusOS — One intelligent operating system for your campus',
  description:
    'Connect students, faculty, classrooms, academic resources and institutional communication in one platform that prevents conflicts before they happen.',
};

const FEATURES = [
  {
    icon: Megaphone,
    title: 'Communication that reaches the right people',
    body: 'Address a notice to a department, a year, a section or a single class. CampusOS works out exactly who is affected, delivers it, and shows you who has actually read it.',
  },
  {
    icon: CalendarClock,
    title: 'A timetable that refuses to clash',
    body: 'Rooms, faculty and student groups are checked before anything is saved. When a conflict exists, you get the reason and workable alternatives — not a silent overwrite.',
  },
  {
    icon: Gauge,
    title: 'Faculty workload you can see',
    body: 'Teaching, labs, assessment and administrative duties add up to a number you can compare across a department, so overload is visible before someone burns out.',
  },
  {
    icon: Sparkles,
    title: 'An assistant that reads your records, not the internet',
    body: 'Answers come from your institution’s own data with citations. When the assistant proposes a change, a human approves it before anything moves.',
  },
  {
    icon: LifeBuoy,
    title: 'Complaints that cannot disappear',
    body: 'Every issue gets a case number, an owner, a deadline and an escalation path. Nothing can be quietly deleted, and every action is logged.',
  },
  {
    icon: Target,
    title: 'Employability, evidenced',
    body: 'A student’s skill profile is built from real coursework and assessment — with a plan to close the gap to the role they are aiming for.',
  },
];

const DIFFERENTIATORS = [
  {
    title: 'The coordination tax',
    body: 'Institutions lose hours because information is fragmented across WhatsApp, spreadsheets and notice boards. CampusOS turns a message into context, validation, a decision, an action, a notification and an audit record.',
  },
  {
    title: 'Exceptions, handled properly',
    body: 'Normal weeks are easy. CampusOS is built for the hard ones: a faculty member is absent, a room floods, an exam moves, a student disputes attendance.',
  },
  {
    title: 'Closed-loop, never advisory-only',
    body: 'Detect, recommend, validate, approve, execute, notify, track. A recommendation nobody acts on is not a solution.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[hsl(var(--border))] bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
              C
            </span>
            <span className="text-[15px] font-semibold text-default">CampusOS</span>
          </div>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="#features">Features</Link>
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-[hsl(var(--border))] px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <Badge tone="brand" className="mb-5">
            Academic operations, coordinated
          </Badge>
          <h1 className="text-[38px] font-semibold leading-[1.1] tracking-[-0.03em] text-default sm:text-[52px]">
            One intelligent operating system for your campus.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-muted sm:text-[17px]">
            Connect students, faculty, classrooms, academic resources and institutional
            communication in one platform — and stop losing hours to conflicting information.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="primary" size="lg" iconRight={ArrowRight}>
              <Link href="/login">Explore the demo</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="#features">See what it does</Link>
            </Button>
          </div>
          <p className="mt-4 text-[12.5px] text-subtle">
            Runs alongside your existing ERP. Import your data, take over workflows gradually.
          </p>
        </div>
      </section>

      {/* Problem framing */}
      <section className="border-b border-[hsl(var(--border))] bg-surface-muted px-5 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-8 md:grid-cols-3">
            {DIFFERENTIATORS.map((d) => (
              <div key={d.title}>
                <h2 className="text-[15px] font-semibold text-default">{d.title}</h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-[hsl(var(--border))] px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-default">
              Built for the work a college actually does
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Not a digitised notice board. A coordination layer that knows what is happening, who
              is affected, and what should happen next.
            </p>
          </div>

          <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-subtle">
                    <Icon size={17} className="text-brand" />
                  </span>
                  <div>
                    <h3 className="text-[14.5px] font-semibold text-default">{f.title}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{f.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-b border-[hsl(var(--border))] bg-surface-muted px-5 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface shadow-xs">
              <ShieldCheck size={19} className="text-brand" />
            </span>
            <div>
              <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-default">
                Trust before novelty
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                An institution has to be able to rely on this system for operational information.
                So the boring things are the ones we took most seriously.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  'Double-booking is prevented by the database, not just the interface.',
                  'Every consequential action is written to an append-only audit log.',
                  'AI proposes changes; a person approves them before anything is applied.',
                  'Assistant answers are grounded in your records and cite what they used.',
                  'Grievances cannot be silently deleted, and SLA breaches escalate automatically.',
                  'Each institution’s data is isolated at every query.',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13.5px] leading-relaxed text-default">
                    <Check size={15} className="mt-0.5 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-default">
            See it with a full campus of data
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            The demo institution has departments, programmes, sections, a live timetable, real
            conflicts to resolve and open grievance cases.
          </p>
          <Button asChild variant="primary" size="lg" className="mt-7" iconRight={ArrowRight}>
            <Link href="/login">Open CampusOS</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-[hsl(var(--border))] px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[12.5px] text-subtle sm:flex-row">
          <p>CampusOS · Academic operations platform</p>
          <p>Built for Smart India Hackathon 2026 · SIH-2026-13-002 / 13-009 / 13-011 / 13-012</p>
        </div>
      </footer>
    </div>
  );
}
