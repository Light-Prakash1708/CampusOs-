import { cn } from '@/lib/utils';
import { Reveal } from './motion';
import s from './landing.module.css';

const STEPS = [
  { n: '01', title: 'Create your account', body: 'Start as a student in a minute — no invitation needed.', color: 'var(--lp-yellow)' },
  { n: '02', title: 'Make it yours', body: 'Fill in your profile and preferences. If your college uses CampusOS, it can invite you.', color: 'var(--lp-pink)' },
  { n: '03', title: 'Stay on top of what matters', body: 'Classes, attendance, events, tasks and opportunities, all on one home.', color: 'var(--lp-green)' },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 bg-[var(--lp-night)] px-5 py-20 text-[var(--lp-cream)] sm:px-8 lg:py-24" aria-labelledby="lp-how">
      <div className="mx-auto max-w-[1240px]">
        <Reveal>
          <h2 id="lp-how" className={cn(s.display, 'text-[clamp(34px,4vw,48px)]')}>
            How it works
          </h2>
          <p className="mt-3 text-[16px] text-[#c9c1ee]">Get started in minutes.</p>
        </Reveal>

        <ol className="relative mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
          <span
            className="absolute left-[22px] top-2 bottom-2 w-0 border-l-2 border-dashed border-white/20 md:left-6 md:right-6 md:top-[22px] md:bottom-auto md:h-0 md:w-auto md:border-l-0 md:border-t-2"
            aria-hidden
          />
          {STEPS.map((st, i) => (
            <Reveal as="li" key={st.n} delay={i * 110} className="relative flex gap-4 md:block">
              <span
                className={cn(s.pixelText, 'relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#0b0920] text-[16px] text-[var(--lp-ink)]')}
                style={{ background: st.color }}
              >
                {st.n}
              </span>
              <div className="md:mt-5">
                <h3 className="text-[19px] font-extrabold tracking-tight">{st.title}</h3>
                <p className="mt-1.5 max-w-[320px] text-[14.5px] leading-relaxed text-[#c9c1ee]">{st.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
