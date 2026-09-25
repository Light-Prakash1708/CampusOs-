# Architecture

## Shape

A single Next.js 15 application (App Router) over PostgreSQL. One deployable
unit, one database, no message broker, no separate services.

That is a deliberate choice. The buyer is a college IT department with a small
team and, frequently, a single VM. Every additional runtime is a thing that can
be down at 9am on a Monday. The architecture is therefore boring on purpose,
with clean seams where distribution can be introduced later.

```
┌──────────────────────────────────────────────────────────────┐
│  Browser — three portals (student / faculty / admin)         │
│  React Server Components + small client islands              │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  Next.js server                                              │
│                                                              │
│  Edge middleware ── cheap JWT check, request id              │
│         │                                                    │
│  Server Components ── query the database directly            │
│  Route handlers ──── withAuth(permission, handler)           │
│         │                                                    │
│  ┌──────▼──────────────────────────────────────────────┐     │
│  │ Services (src/services)                             │     │
│  │  timetable/  solver · conflicts · generate · nl     │     │
│  │  communication  audience · publish · change feed    │     │
│  │  grievance      workflow · SLA · escalation         │     │
│  │  skills         evidence · gaps · cohort readiness  │     │
│  │  analytics      utilisation · workload · health     │     │
│  │  import         validate → commit                   │     │
│  │  ai             providers · tools · orchestrator    │     │
│  │  audit          append-only record                  │     │
│  └──────┬──────────────────────────────────────────────┘     │
└─────────┼────────────────────────────────────────────────────┘
          │  Drizzle ORM
┌─────────▼────────────────────────────────────────────────────┐
│  PostgreSQL 16                                               │
│  69 tables · partial unique indexes · check constraints      │
│  append-only triggers · generated tsvector + GIN index       │
└──────────────────────────────────────────────────────────────┘
```

## Layers and what belongs in each

| Layer | Responsibility | Rule |
|---|---|---|
| **Pages** (`src/app/**/page.tsx`) | Fetch and present. Server Components query the database directly. | Never contain business rules. |
| **Route handlers** (`src/app/api/**`) | Validate input, call a service, shape the response. | Always wrapped in `withAuth`. |
| **Services** (`src/services/**`) | All business logic, transactions, invariants. | Take an `AuthContext`; never accept a caller-supplied tenant id. |
| **Data** (`src/lib/db/**`) | Schema and connection only. | No logic. |
| **Auth** (`src/lib/auth/**`) | Identity, capabilities, session lifetime. | The single source of "who is asking and what may they do". |

The important invariant: **a service function derives the tenant from the
`AuthContext`, never from an argument**. There is no `getStudents(institutionId)`
that a route could call with the wrong id.

## Technology decisions

### Drizzle rather than Prisma

Prisma's query engine ships as a platform-specific native binary downloaded at
install time. In the target environment that download was unavailable, and more
generally it is a deployment dependency a college's IT team should not have to
debug. Drizzle is plain TypeScript over `pg`: no binary, no codegen step at
deploy, no cold-start penalty. The schema is expressed in TypeScript and the
generated SQL is inspectable.

### A hand-written CSP solver rather than OR-Tools

OR-Tools would mean running Python alongside Node. For a product whose buyer
may deploy on one VM, that doubles the runtime surface. The solver in
`src/services/timetable/solver.ts` is a genuine constraint solver — domain
construction with unary-constraint filtering, MRV backtracking with forward
checking, then simulated-annealing refinement of soft constraints. It is pure
(no I/O), deterministic (seeded PRNG), and unit-tested against a 90-session
week.

`TimetableSolver` is an interface. Swapping in an OR-Tools microservice later
means implementing one method — see [TIMETABLE.md](TIMETABLE.md).

### Rule-based natural-language parsing

Scheduling constraints decide where hundreds of students sit for a semester. A
misparse is expensive and silent. `src/services/timetable/nl.ts` parses with
explicit patterns, resolves every person and room against real rows, and
**reports back both what it understood and what it did not**. A language model
may later rewrite free text into these canonical forms, but the constraint
objects that reach the solver are produced by code a human can read.

### Server Components by default

Most screens are reads. Rendering them on the server means no client-side data
fetching, no loading waterfalls, and no API surface to secure for read paths.
Client components are small islands: the attendance marker, the timetable move
dialog, the notice composer, the assistant chat.

### DB-backed jobs rather than a broker

`POST /api/jobs/run` is driven by ordinary cron with a shared secret. SLA
escalation, scheduled publishing and expiry are pure functions of the clock, so
a missed run self-corrects on the next one. No Redis, no queue to operate.

## Multi-tenancy

Every table except `institutions`, `sessions` and `job_queue` carries
`institution_id`, and an integration test asserts that continuously. The first
college is simply the first tenant — there is no hard-coded institution
anywhere. Branding, terminology, feature flags and grievance SLAs are per-tenant
columns, so white-labelling is configuration rather than a fork.

## Where this would need to change at scale

Honestly stated:

- **Read replicas.** Analytics currently run against the primary. At tens of
  thousands of students the heavier aggregates should move to a replica or a
  materialised view refreshed by the job runner.
- **Attendance write volume.** Marking is transactional per session, which is
  correct but chatty. Batch endpoints exist; a very large institution would want
  them batched further.
- **Search.** Postgres full-text is right for a few thousand resources. Beyond
  that, an external index (or pgvector for semantic search) behind the existing
  `ResourceSearchProvider` seam.
- **File storage.** The storage adapter is an interface with a local
  implementation. Production needs S3 or equivalent with signed URLs.
