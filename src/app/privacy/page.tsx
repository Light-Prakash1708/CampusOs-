import Link from 'next/link';
import { PRIVACY_NOTICE_VERSION } from '@/lib/privacy-notice';
import { formatDate } from '@/lib/utils';

export const metadata = { title: 'Privacy notice · CampusOS' };

function contact() {
  return process.env.PRIVACY_CONTACT_EMAIL?.trim() || null;
}

/**
 * The privacy notice (CAMPUSOS-006). Plain language, versioned; accepting it
 * is recorded in consent_records. Describes what the software does — it must
 * be reviewed by a lawyer before a public launch (see docs/PRIVACY.md).
 */
export default function PrivacyNoticePage() {
  const email = contact();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-[14.5px] leading-relaxed text-default sm:py-14">
      <p className="text-[12.5px] font-semibold uppercase tracking-wide text-subtle">CampusOS</p>
      <h1 className="mt-1 font-display text-[28px] font-extrabold leading-tight sm:text-[32px]">Privacy notice</h1>
      <p className="mt-1 text-[13px] text-muted">Version {PRIVACY_NOTICE_VERSION} · effective {formatDate(new Date(PRIVACY_NOTICE_VERSION))}</p>

      <Section title="Who is responsible for your data">
        <p>
          <strong>If your college uses CampusOS</strong>, your college decides how your academic data (enrolment, attendance, notices, grievances) is used, and CampusOS processes it on the college’s behalf. Questions about those records go to your college first.
        </p>
        <p>
          <strong>If you created a personal account</strong> (without a college), the operator of this CampusOS service is responsible for the data in your personal workspace.
        </p>
      </Section>

      <Section title="What we collect and why">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Account:</strong> your name, email and password (stored as a secure hash) — to let you sign in.</li>
          <li><strong>Age confirmation:</strong> only whether you are 18 or older — never your date of birth. Personal accounts are for adults; under-18s join through their college.</li>
          <li><strong>Academic records</strong> (college students): your section, attendance, notices addressed to you, assignments and results — to show you where you stand.</li>
          <li><strong>Things you add:</strong> goals, saved opportunities, grievances, skills — to provide those features. Your personal tracker is visible only to you.</li>
          <li><strong>College ID</strong> (only if you ask to join a college): kept privately, seen only by that college’s reviewers while your request is open. Never sent to AI or OCR services.</li>
          <li><strong>Usage counts:</strong> pseudonymous records of which features are used (for example “a notice was acknowledged”), stored without your name, email or messages, and deleted after 400 days. We use them to improve the product. We do not track keystrokes, time on page or what you type.</li>
        </ul>
      </Section>

      <Section title="AI features">
        <p>
          The assistant only reads data you are already allowed to see. By default, answers come from CampusOS’s built-in assistant and no data leaves CampusOS. A college can choose to turn on an external AI provider; when it does, the data needed to answer your question is sent to that provider to write the answer. The assistant never produces a “risk score” about you.
        </p>
      </Section>

      <Section title="Who can see your data">
        <p>
          Your college’s authorised staff see college records according to their role. Other students never see your attendance, grades, grievances or private goals. We do not sell personal data or use it for advertising.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Each kind of data has a retention period, listed on your Privacy page after you sign in. Academic records your college must keep by law may be retained by the college after you leave.
        </p>
      </Section>

      <Section title="Your rights">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Download a copy of your data (Privacy page → Export).</li>
          <li>Correct your details, or ask your college to correct academic records.</li>
          <li>Erase personal data: your tracker and AI memory are erased immediately; a personal account can be deleted by you; a college account is reviewed by your college because some records must be kept.</li>
          <li>Withdraw optional consents at any time from the Privacy page.</li>
        </ul>
        <p className="mt-2">
          {email ? (
            <>Contact for privacy questions or complaints: <a className="font-semibold text-brand" href={`mailto:${email}`}>{email}</a>.</>
          ) : (
            <>For privacy questions, contact your college’s office, or the operator of this CampusOS service.</>
          )}
        </p>
      </Section>

      <p className="mt-10 text-[13px] text-muted">
        <Link href="/register" className="font-semibold text-brand">Create an account</Link> · <Link href="/login" className="font-semibold text-brand">Sign in</Link>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 space-y-2">
      <h2 className="font-display text-[18px] font-bold">{title}</h2>
      {children}
    </section>
  );
}
