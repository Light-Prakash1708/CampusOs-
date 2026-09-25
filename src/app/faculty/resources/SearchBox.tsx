'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button, Input } from '@/components/ui';

/** Full-text search across the institution's published resources. */
export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(initialQuery);
  const [pending, startTransition] = React.useTransition();

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        startTransition(() =>
          router.push(q ? `/faculty/resources?q=${encodeURIComponent(q)}` : '/faculty/resources'),
        );
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search titles, topics, descriptions and extracted text"
        aria-label="Search resources"
      />
      <Button type="submit" variant="secondary" icon={Search} loading={pending}>
        Search
      </Button>
    </form>
  );
}
