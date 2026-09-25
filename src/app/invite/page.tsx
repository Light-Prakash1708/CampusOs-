import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AuthShell } from '@/components/auth/AuthShell';
import { peekToken } from '@/services/auth/tokens';
import { NewPasswordForm } from '../reset-password/NewPasswordForm';

export const metadata = { title: 'Accept invitation · CampusOS' };
export const dynamic = 'force-dynamic';

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = token ? await peekToken(token, 'INVITE') : null;

  if (!token || !valid) {
    return (
      <AuthShell
        title="This invitation is no longer valid"
        subtitle="Invitations expire after 7 days, and only the most recent one works. Ask your college office to send a new invitation."
        footer={<a href="/login" className="font-medium text-brand hover:underline">Go to sign in</a>}
      >
        <span />
      </AuthShell>
    );
  }

  const [who] = await db
    .select({ firstName: t.users.firstName, email: t.users.email, institution: t.institutions.name })
    .from(t.users)
    .innerJoin(t.institutions, eq(t.institutions.id, t.users.institutionId))
    .where(and(eq(t.users.id, valid.userId), eq(t.users.institutionId, valid.institutionId)))
    .limit(1);

  return (
    <AuthShell
      title={`Welcome to ${who?.institution ?? 'CampusOS'}`}
      subtitle={
        <>
          Hi {who?.firstName}, set a password for <span className="font-medium text-default">{who?.email}</span> to activate your account.
        </>
      }
    >
      <NewPasswordForm token={token} endpoint="/api/auth/invite/accept" submitLabel="Activate my account" />
    </AuthShell>
  );
}
