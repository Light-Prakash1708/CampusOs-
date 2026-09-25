'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Field, Select, Input } from '@/components/ui';

export interface PickerOffering {
  id: string;
  label: string;
}

/** Drives the page from the URL, so a register is always a shareable link. */
export function ClassPicker({
  offerings,
  offeringId,
  date,
  minDate,
  maxDate,
}: {
  offerings: PickerOffering[];
  offeringId: string | null;
  date: string;
  minDate?: string;
  maxDate?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  function navigate(next: { offering?: string; date?: string }) {
    const search = new URLSearchParams(params.toString());
    if (next.offering !== undefined) {
      search.set('offering', next.offering);
      // The scheduled period belongs to the previous class; drop it.
      search.delete('entry');
      search.delete('session');
    }
    if (next.date !== undefined) {
      search.set('date', next.date);
      search.delete('session');
    }
    startTransition(() => router.push(`/faculty/attendance?${search.toString()}`));
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
      <Field label="Class" htmlFor="offering">
        <Select
          id="offering"
          value={offeringId ?? ''}
          disabled={pending}
          onChange={(e) => navigate({ offering: e.target.value })}
        >
          <option value="" disabled>
            Select a class
          </option>
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date" htmlFor="date">
        <Input
          id="date"
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          disabled={pending}
          onChange={(e) => e.target.value && navigate({ date: e.target.value })}
        />
      </Field>
    </div>
  );
}
