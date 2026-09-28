import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { TryDemo } from '@/components/auth/TryDemo';
import { getCurrentUser } from '@/lib/auth/context';
import { demoSignInEnabled } from '@/lib/demo';

export const metadata = { title: 'Try the demo · CampusOS' };
export const dynamic = 'force-dynamic';

/**
 * "View demo" from the landing page. Signs into the isolated demo college
 * (fictional data, reset nightly) through the existing demo sign-in. When the
 * demo is off for this deployment, this page says so instead of failing.
 */
export default async function DemoPage() {
  const user = await getCurrentUser();
  if (user) redirect(`/${user.portal}`);
  const enabled = demoSignInEnabled();

  return (
    <AuthShell
      title="Explore CampusOS"
      subtitle="Step into a sample college and see CampusOS as a student, a teacher or the college office would."
      footer={
        <>
          Ready for your own?{' '}
          <a href="/register" className="font-medium text-brand hover:underline">Create a student account</a>
          {' · '}
          <a href="/register-college" className="font-medium text-brand hover:underline">Register your college</a>
        </>
      }
    >
      {enabled ? (
        <TryDemo />
      ) : (
        <p className="rounded-lg bg-surface-sunken px-4 py-3 text-[13.5px] leading-relaxed text-muted">
          The demo college isn’t open on this server right now.{' '}
          <a href="/register-college" className="font-semibold text-brand hover:underline">Ask us for a walkthrough</a>.
        </p>
      )}
    </AuthShell>
  );
}
