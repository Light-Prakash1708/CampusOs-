'use client';

import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

export function LaunchButton({ ready }: { ready: boolean }) {
  const router = useRouter();
  const api = useApi();
  return (
    <div className="space-y-2">
      <ErrorBox error={api.error} />
      <Button
        variant="primary"
        icon={Rocket}
        disabled={!ready}
        loading={api.loading}
        title={ready ? undefined : 'Finish the open steps first'}
        onClick={async () => {
          const d = await api.call('/api/admin/setup', {});
          if (d) router.refresh();
        }}
      >
        Mark ready for the pilot
      </Button>
    </div>
  );
}
