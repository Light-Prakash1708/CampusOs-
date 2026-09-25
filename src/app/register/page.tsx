import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/context';
import { AuthShell } from '@/components/auth/AuthShell';
import { listRegistrableInstitutions } from '@/services/public-directory';
import { RegisterForm } from './RegisterForm';

export const metadata = { title: 'Create your account · CampusOS' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(`/${user.portal}`);
  const colleges = await listRegistrableInstitutions();

  return (
    <AuthShell
      title="Create your student account"
      subtitle="Takes about a minute. Your college decides who can join, so use your college email if it asks for one."
      footer={
        <>
          Already have an account?{' '}
          <a href="/login" className="font-medium text-brand hover:underline">Sign in</a>
        </>
      }
    >
      {colleges.length === 0 ? (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-surface-sunken p-4 text-[13.5px] leading-relaxed text-muted">
          No college on this CampusOS server accepts self-registration yet. If your college uses
          CampusOS, ask the college office for an invitation.
        </div>
      ) : (
        <RegisterForm
          colleges={colleges.map((c) => ({
            slug: c.slug,
            name: c.name,
            city: c.city,
            mode: c.mode,
            allowedDomains: c.allowedDomains ?? [],
          }))}
        />
      )}
    </AuthShell>
  );
}
