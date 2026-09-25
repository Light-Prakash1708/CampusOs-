import { AuthShell } from '@/components/auth/AuthShell';
import { peekToken } from '@/services/auth/tokens';
import { NewPasswordForm } from './NewPasswordForm';

export const metadata = { title: 'Choose a new password · CampusOS' };
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = token ? await peekToken(token, 'PASSWORD_RESET') : null;

  if (!token || !valid) {
    return (
      <AuthShell
        title="This link has expired"
        subtitle="Reset links work once and expire after 30 minutes. Request a new one — only the most recent email works."
        footer={<a href="/login" className="font-medium text-brand hover:underline">Back to sign in</a>}
      >
        <a href="/forgot-password" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand text-[15px] font-medium text-white hover:bg-[hsl(var(--brand-hover))]">
          Request a new link
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You will be signed out of every device, then you can sign in with the new password.">
      <NewPasswordForm token={token} endpoint="/api/auth/password/reset" submitLabel="Change password" />
    </AuthShell>
  );
}
