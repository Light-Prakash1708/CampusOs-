'use client';

import { CampusEmptyState } from '@/components/campus';
import { Button } from '@/components/ui';

export default function ToolsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <CampusEmptyState
      sprite="robot"
      title="Tools didn’t load"
      description="Something went wrong while loading your tools. Your data is safe — try again."
      action={<Button variant="primary" onClick={reset}>Try again</Button>}
    />
  );
}
