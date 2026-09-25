# CampusOS — engineering conventions

Read this before writing any code in this repository.

## Stack

- **Next.js 15** (App Router, React 19, Server Components by default)
- **TypeScript strict** — `npx tsc --noEmit` must pass with zero errors
- **Tailwind CSS v4** with CSS-variable design tokens (see `src/app/globals.css`)
- **Drizzle ORM** over **PostgreSQL 16** (NOT Prisma — engine binaries are unavailable)
- Icons: `lucide-react`. Charts: `recharts`.

## Non-negotiable product rules

1. **No fake functionality.** If a button is visible it must work, or be visibly
   marked unavailable. Never render a control that silently does nothing.
2. **No invented data.** Every number on screen comes from a query. If a value
   cannot be derived honestly, do not display it.
3. **AI output is labelled** until a human approves it — use `<AiLabel />`.
4. **Estimates are labelled as estimates** — use `<EstimateChip />`.
5. **Never claim success that did not happen.** Surface real failures with a
   cause and a next step.

## Data access

Server Components query the database directly:

```ts
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';

export default async function Page() {
  const user = await requireAuth();
  const rows = await db.select().from(t.rooms)
    .where(eq(t.rooms.institutionId, user.institutionId));  // ALWAYS scope by tenant
  ...
}
```

**Every query must be scoped by `user.institutionId`.** There is no global data.
For student-owned data also scope by `user.studentProfileId`; for faculty-owned
data by `user.facultyProfileId`.

## Authorization

```ts
import { requireAuth, requirePermission, can } from '@/lib/auth/context';

const user = await requirePermission('timetable:publish');   // redirects if missing
if (can(user, 'timetable:edit')) { /* conditionally render */ }
```

Hiding UI is **not** access control. Any page that shows privileged data must
call `requirePermission`. Any mutation route must use `withAuth(permission, ...)`.

The full capability list is in `src/lib/auth/permissions.ts`.

## API routes

```ts
import { withAuth, ok, parseBody, AppError } from '@/lib/api';
import { z } from 'zod';

const Body = z.object({ reason: z.string().min(3) });

export const POST = withAuth('timetable:edit', async (request, { user, params }) => {
  const input = await parseBody(request, Body);
  ...
  return ok({ updated: true });
});
```

`withAuth` handles authentication, capability check, Zod validation errors,
Postgres constraint violations (mapped to friendly messages) and unexpected
errors. Never write a bare try/catch that swallows an error.

## UI

Import everything from the design system — do **not** hand-roll equivalents:

```ts
import {
  Button, Card, CardHeader, CardBody, CardFooter, Badge, Input, Textarea,
  Select, Field, EmptyState, ErrorState, Skeleton, SkeletonRows, PageHeader,
  Section, Table, Th, Td, Avatar, Stat, Alert, Progress, Divider,
  AiLabel, EstimateChip,
} from '@/components/ui';
import { cn, formatDate, formatDateTime, formatTime, relativeTime, humanize, num, percent, pluralize, minutesToHuman } from '@/lib/utils';
```

Colour utilities (defined in `globals.css`): `bg-surface`, `bg-surface-muted`,
`bg-surface-raised`, `bg-surface-sunken`, `text-default`, `text-muted`,
`text-subtle`, `text-brand`, `text-success`, `text-warning`, `text-danger`,
`border-default`, `shadow-xs`. Use `hsl(var(--border))` in arbitrary values.

**Never** use raw Tailwind palette colours (`bg-gray-100`, `text-blue-600`).
They break dark mode and white-labelling.

### Every screen needs

- a **loading** state (`loading.tsx` with skeletons matching the real layout)
- an **empty** state that explains what to do (`<EmptyState />`)
- an **error** state (`error.tsx` client component with a retry)
- correct behaviour on **mobile** (test at 375px — no horizontal overflow)
- keyboard accessibility and visible focus (the base styles provide this)

### Typography scale actually used here

Headings `text-xl font-semibold tracking-[-0.01em]`, section labels
`text-[13px] font-semibold uppercase tracking-wide text-subtle`, body
`text-sm`/`text-[13.5px]`, secondary `text-[12.5px] text-muted`. Numbers use
the `tabular` utility.

## Client components

Mark with `'use client'` only when you need state, effects or event handlers.
Keep them small and leaf-level; fetch data in the server component parent and
pass it down as props.

Mutations from client components: `fetch('/api/...', { method: 'POST', ... })`,
then `router.refresh()`. Handle the `{ ok: false, error: { message, hint } }`
envelope and show `error.message` plus `error.hint`.

## Never

- `localStorage` as a database (theme preference only)
- `any` — use `unknown` and narrow. The one sanctioned exception is
  `src/services/ai/providers.ts`, where the tool-result formatters receive
  genuinely dynamic JSON; it is scoped with an explicit
  `eslint-disable`/`enable` pair around those functions and nowhere else.
- Direct model API calls — go through `src/services/ai`
- Hard-coded institution, user, room or subject ids
- New dependencies without a clear reason
