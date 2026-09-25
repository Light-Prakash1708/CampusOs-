import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/context';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; verified?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(`/${user.portal}`);

  const params = await searchParams;
  const demoMode = process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';

  return (
    <AuthShell
      title="Welcome back 👋"
      subtitle="Sign in with the account your college gave you."
      footer={
        <>
          New student?{' '}
          <a href="/register" className="font-bold text-brand hover:underline">
            Create your account
          </a>
        </>
      }
    >
      <LoginForm
        nextUrl={params.next}
        demoMode={demoMode}
        // Server-rendered and only in non-production demo mode — never inlined
        // into the client bundle (v1 defect D3).
        demoPassword={demoMode ? (process.env.DEMO_PASSWORD ?? '') : ''}
        notice={
          params.reset
            ? 'Your password has been changed. Sign in with the new one.'
            : params.verified
              ? 'Email confirmed. You can sign in now.'
              : null
        }
      />
    </AuthShell>
  );
}
