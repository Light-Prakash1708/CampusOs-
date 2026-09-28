import { AuthShell } from '@/components/auth/AuthShell';
import { CollegeRequestForm } from './CollegeRequestForm';

export const metadata = { title: 'Register your college · CampusOS' };

export default function RegisterCollegePage() {
  return (
    <AuthShell
      title="Bring CampusOS to your college"
      subtitle="Start with one department or batch, alongside the ERP you already use. We set it up with you."
      footer={
        <>
          Already set up?{' '}
          <a href="/login" className="font-medium text-brand hover:underline">Sign in</a>
        </>
      }
    >
      <CollegeRequestForm />
    </AuthShell>
  );
}
