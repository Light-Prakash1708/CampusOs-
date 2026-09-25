import { AuthShell } from '@/components/auth/AuthShell';
import { VerifyEmail } from './VerifyEmail';

export const metadata = { title: 'Confirm email · CampusOS' };

/**
 * The link lands here and the page POSTs the token. Consuming a token on GET
 * would let mail scanners and link previewers "click" it on the user's behalf.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Confirm your email" footer={<a href="/login" className="font-medium text-brand hover:underline">Go to sign in</a>}>
      <VerifyEmail token={token ?? ''} />
    </AuthShell>
  );
}
