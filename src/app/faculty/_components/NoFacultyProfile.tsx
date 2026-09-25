import { UserCog } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';

/**
 * Shown when an account sits in the faculty portal without a faculty profile
 * (for example a counsellor or library account). We do not fabricate teaching
 * data for them — we explain why the page is empty.
 */
export function NoFacultyProfile({ what }: { what: string }) {
  return (
    <Card>
      <EmptyState
        icon={UserCog}
        title={`No faculty record is linked to your account`}
        description={`${what} is derived from a faculty profile — teaching allocations, workload and leave all hang off it. Ask your institution administrator to link a faculty record to your login.`}
      />
    </Card>
  );
}
