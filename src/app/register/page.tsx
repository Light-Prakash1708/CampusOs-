import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/context';
import { AuthShell } from '@/components/auth/AuthShell';
import { listRegistrableInstitutions } from '@/services/public-directory';
import { selfRegistrationEnabled } from '@/lib/env';
import { RegisterChooser } from './RegisterChooser';

export const metadata = { title: 'Create your account · CampusOS' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(`/${user.portal}`);
  const { as } = await searchParams;
  const colleges = await listRegistrableInstitutions();

  const selfRegistration = selfRegistrationEnabled();

  return (
    <AuthShell
      title="Create your CampusOS account"
      subtitle="Join your campus or start your student profile."
      footer={
        <>
          Already have an account?{' '}
          <a href="/login" className="font-medium text-brand hover:underline">Sign in</a>
          {' · '}
          <a href="/register-college" className="font-medium text-brand hover:underline">Register your college</a>
        </>
      }
    >
      <RegisterChooser
        selfRegistration={selfRegistration}
        staff={as === 'staff'}
        colleges={colleges.map((c) => ({
          slug: c.slug,
          name: c.name,
          city: c.city,
          mode: c.mode,
          allowedDomains: c.allowedDomains ?? [],
        }))}
      />
    </AuthShell>
  );
}
