# CampusOS

**The academic operating system for an institution.**

One platform connecting students, faculty, classrooms, academic resources and
institutional communication — built so a college can actually rely on it for
operational information.

---

## What problem it solves

Institutions do not lose time because they lack software. They lose it to the
**coordination tax**: information is fragmented across WhatsApp groups,
spreadsheets and notice boards; decisions get made in chats nobody can search;
two people book the same room; a student says "I didn't know"; a complaint
disappears into a conversation.

CampusOS turns each of those into a tracked transition:

```
MESSAGE → CONTEXT → VALIDATION → DECISION → ACTION → NOTIFICATION → AUDIT
```

## What makes it different

| | |
|---|---|
| **Conflict prevention, not conflict reporting** | A room, faculty member or section can never be double-booked — enforced by partial unique indexes in PostgreSQL, not by frontend checks. Two admins clicking simultaneously: one succeeds, the other gets a clear conflict with workable alternatives. |
| **A real constraint solver** | Timetables are produced by a CSP solver (AC-3 style propagation, MRV backtracking, simulated-annealing refinement) — not by a language model. When no feasible schedule exists it says so and explains what to relax. |
| **Addressed communication** | A notice targets a department, year, section or class; the audience is computed from the academic hierarchy, frozen at publish time, and acknowledgement is tracked per person. You can see exactly who has not read it. |
| **Explained changes** | Every change records BEFORE → AFTER, the reason, who approved it and who it affects. "Why did this change?" has an answer. |
| **AI that proposes, humans that decide** | The assistant answers only from institutional records, cites what it used, and cannot write. Anything that changes state becomes a proposal requiring human approval. |
| **History that cannot be rewritten** | `audit_logs` and `grievance_events` reject UPDATE and DELETE at the database level. A complaint cannot be quietly deleted, even by an administrator. |

## Running it

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET
npm install
npm run db:migrate            # versioned migrations (schema + integrity guarantees)
npm run db:seed               # demo institution: 353 students, 22 faculty, live timetable
npm run dev
```

In development, emails (password reset, verification, invitations) are printed
to the server console so you can click the links.

Open <http://localhost:3000>. Demo accounts appear on the sign-in screen when
`DEMO_MODE=true` (development builds only).

| Account | Who |
|---|---|
| `student@demo.campusos.local` | Ananya Iyer — BBA Finance, Section A |
| `faculty@demo.campusos.local` | Dr. Meera Sharma — Management |
| `admin@demo.campusos.local` | Rajesh Nair — Academic Office |
| `registrar@demo.campusos.local` | Dr. Vandana Krishnan — Registrar (super admin) |

**No AI API key is required.** With `AI_PROVIDER=local` the assistant runs an
offline, rule-based provider that answers from the database. It is labelled as
such in the interface — it never pretends to be a language model. Set
`AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` for the full assistant.

## Verifying it works

```bash
npm run typecheck   # zero errors
npm run lint        # zero errors
npm test            # 112 tests (unit + integration against real PostgreSQL)
npm run build       # production build
```

The test suite asserts the guarantees above rather than restating the code:
the database really does refuse a double-booking, the audit log really does
reject an UPDATE, audience resolution really does walk the hierarchy, and the
solver really does produce a clash-free 90-session week.

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System shape, module boundaries, technology decisions and their rationale |
| [DATABASE.md](docs/DATABASE.md) | Schema, multi-tenancy, integrity guarantees, concurrency |
| [AUTH.md](docs/AUTH.md) | Sessions, capability-based authorization, tenant scoping |
| [TIMETABLE.md](docs/TIMETABLE.md) | The solver: algorithm, constraints, replacing it with OR-Tools |
| [COMMUNICATION.md](docs/COMMUNICATION.md) | Audience resolution, acknowledgement, the change feed |
| [GRIEVANCE.md](docs/GRIEVANCE.md) | Case workflow, SLA, escalation, anonymity |
| [AI.md](docs/AI.md) | Grounding, tool permissions, injection defence, cost control |
| [SECURITY.md](docs/SECURITY.md) | Threat model and the controls for each threat |
| [API.md](docs/API.md) | Endpoints, envelopes, error codes |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment and operations |
| [LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) | Getting set up |
| [PRODUCT_ROADMAP.md](docs/PRODUCT_ROADMAP.md) | What is built, what is scaffolded, what is next |
| [CAMPUSOS_2_AUDIT.md](docs/CAMPUSOS_2_AUDIT.md) | 2.0 audit: what worked, defects found, migration plan, phase roadmap |
| [PRIVACY.md](docs/PRIVACY.md) | Data catalogue, consent ledger, export and erasure (DPDP-aligned) |
| [PHASE_1_REPORT.md](docs/PHASE_1_REPORT.md) | 2.0 Phase 1: what changed, APIs, tests, remaining work |
| [CONVENTIONS.md](docs/CONVENTIONS.md) | Engineering conventions for contributors |

## Honest status

This is a working system with a real database, real algorithms and real
workflows — not a demo shell. It is also not a finished ERP.
[PRODUCT_ROADMAP.md](docs/PRODUCT_ROADMAP.md) states plainly which modules are
complete, which are deliberately scaffolded, and what a college would still
need before replacing an incumbent system. Nothing in the interface pretends to
work when it does not.

---

Built for Smart India Hackathon 2026 · combines problem statements
**SIH-2026-13-009** (timetable & classroom utilisation),
**SIH-2026-13-011** (skill-gap & employability),
**SIH-2026-13-012** (teacher workload & academic resources),
with the communication and readdressal layers that make them usable together.
