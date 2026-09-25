import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotForm } from './ForgotForm';

export const metadata = { title: 'Reset password · CampusOS' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter the email you use for CampusOS. We will send a link to choose a new password."
      footer={<a href="/login" className="font-medium text-brand hover:underline">Back to sign in</a>}
    >
      <ForgotForm />
    </AuthShell>
  );
}
