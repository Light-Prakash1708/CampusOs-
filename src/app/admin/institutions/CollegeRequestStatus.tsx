'use client';

import * as React from 'react';
import { Select } from '@/components/ui';
import { useApi } from '@/components/auth/useApi';

const LABELS = { NEW: 'New', CONTACTED: 'Contacted', SET_UP: 'Set up', DECLINED: 'Declined' } as const;

/** Operators move a "Register your college" request along. Saved on change. */
export function CollegeRequestStatus({ id, status }: { id: string; status: string }) {
  const [value, setValue] = React.useState(status);
  const api = useApi<{ status: string }>();
  return (
    <div>
      <Select
        aria-label="Request status"
        value={value}
        disabled={api.loading}
        onChange={async (e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          const d = await api.call(`/api/admin/college-requests/${id}`, { status: next }, 'PATCH');
          if (!d) setValue(prev);
        }}
      >
        {Object.entries(LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Select>
      {api.error ? <p className="mt-1 text-[11.5px] text-danger">{api.error.message}</p> : null}
    </div>
  );
}
