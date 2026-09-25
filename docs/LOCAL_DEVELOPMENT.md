# Local Development

## Requirements

- Node 20+ (developed on 22)
- PostgreSQL 16
- No AI API key required

## Setup

```bash
git clone <repo> && cd campusos
npm install
cp .env.example .env
```

Set at minimum:

```bash
DATABASE_URL="postgresql://postgres:password@localhost:5432/campusos"
AUTH_SECRET="$(openssl rand -base64 48)"
```

Then:

```bash
createdb campusos
npm run db:push          # schema
npm run db:constraints    # integrity guarantees, triggers, search index
npm run db:seed           # demo institution
npm run dev
```

`db:constraints` matters. Without it the schema exists but the guarantees —
no-double-booking, append-only history, full-text search — do not.

## Demo data

`npm run db:seed` builds "CampusOS Demo University": 5 departments, 5
programmes, 8 sections, 353 students, 22 faculty, 15 rooms, 22 subjects, 40
course offerings, a solver-generated timetable (119 sessions, 0 conflicts), five
weeks of attendance (~24,500 records), assignments and submissions, notices with
partial acknowledgement, 7 grievance cases including one past SLA, skill
profiles and workload records.

Deterministic — the same seed produces the same institution every time. Safe to
re-run; it purges the demo tenant first.

## Commands

```bash
npm run dev          # development server
npm run build        # production build
npm start            # serve the build
npm run typecheck    # tsc --noEmit, must be clean
npm test             # vitest — 46 tests
npm run db:push      # sync schema
npm run db:seed      # rebuild demo data
npm run db:reset     # wipe and reseed
```

## Tests

- `tests/timetable-solver.test.ts` — solver guarantees, no database needed
- `tests/permissions.test.ts` — capability matrix properties
- `tests/import-validation.test.ts` — CSV parsing and column detection
- `tests/integration.test.ts` — requires a seeded database

## Working with AI locally

Default `AI_PROVIDER=local` runs the offline provider — no key, no network,
deterministic, and everything remains testable. For the full assistant:

```bash
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sk-ant-…"
```

## Common problems

**"DATABASE_URL is not set"** — scripts load `.env` via a side-effect import
that must come first; check `.env` exists.

**"relation does not exist"** — run `npm run db:push`.

**Double-booking is allowed** — `npm run db:constraints` was not run.

**`Module not found: '@/…'`** — the alias is declared in both `tsconfig.json`
and `next.config.mjs`; both are required.

**TypeScript version error from Next.js** — Next 15 does not support the
TypeScript 7 preview. Use `typescript@^6`.
