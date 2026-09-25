# Product Status & Roadmap

An honest inventory. If something is scaffolded rather than finished, it says so
here and the interface says so too.

## Built and working

| Area | State |
|---|---|
| Multi-tenant schema (69 tables) | Complete, with database-level integrity guarantees |
| Authentication, sessions, capability RBAC | Complete; server-side revocation; 70 capabilities with implication closure |
| Timetable solver | Complete; CSP + annealing; 119 sessions placed with 0 conflicts on demo data |
| Conflict engine | Complete; room/faculty/section/capacity/type/exam/event/holiday, with verified alternatives |
| Natural-language constraints | Rule-based; reports what it did *and did not* understand |
| Communication engine | Complete; hierarchy audience resolution, frozen recipients, acknowledgement tracking |
| Change feed | Complete; before/after, reason, approver, affected people |
| Redressal | Complete; workflow, working-hours SLA, automatic escalation, real anonymity |
| Faculty workload | Complete; derived from timetable + recorded duties, traceable to components |
| Skill & employability | Complete; evidence-backed profiles, role gap analysis, cohort readiness |
| Attendance | Complete; marking, non-destructive correction, summaries, risk detection |
| Assignments | Complete; rubrics, submissions, grading with AI suggestion separated from score |
| Analytics | Complete; utilisation, workload balance, attendance, communication, cases |
| Data import | Complete; validate-then-commit with per-row errors |
| CSV exports | Complete; five reports, audited |
| AI assistant | Complete; grounded, cited, permission-scoped, budgeted; works with no API key |
| Teacher copilot | Complete; structured lesson plans, labelled until approved |
| Audit log | Complete; append-only at the database level |
| Design system | Complete; light/dark, responsive, accessible, tenant-themeable |
| Three portals | Complete; 55 routes verified rendering against real data |

## Deliberately scaffolded

Interfaces exist and are documented; implementations are stubs. Where a stub is
user-visible, the UI says so rather than pretending.

| Area | What exists | What is missing |
|---|---|---|
| File storage | Adapter interface; local path config | S3/Supabase adapter, signed URLs, virus scanning |
| Email / push / SMS | Channel model, per-user preferences, mandatory-override logic | Provider adapters. Currently in-app notifications only |
| Settings editor | Settings render read-only, and say so | Write UI for institution, flags, SLA configuration |
| Virtual laboratory | Feature flag, hidden by default | Everything. Flagged off rather than shown as a dead link |
| Password reset | Nullable password hash, `must_change_password` | Token flow (needs email) |
| Approval execution | Generic engine; handlers for leave and announcements | Handlers for the remaining approval kinds; unknown kinds fail loudly rather than silently |

## Known limitations

- **Analytics run against the primary.** Fine at demo scale; a large institution
  should move heavy aggregates to a replica or materialised views.
- **Resource search is keyword-based**, not semantic. The `ResourceSearchProvider`
  seam exists for a vector backend. The documentation does not claim semantic
  search.
- **The offline AI provider is not a language model.** It matches intents and
  formats real data. Labelled as such everywhere it appears.
- **The timetable solver is in-process.** Correct and fast at college scale;
  a multi-campus university would want the OR-Tools path.
- **No rate limiting beyond login lockout.** Needs a shared store to be correct
  across instances.

## Next

**Immediate (weeks)** — email adapter and password reset; settings write UI; S3
storage; rate limiting.

**Near (months)** — SSO (Google Workspace / Microsoft 365), which is how most
colleges want authentication; exam seating allocation; parent portal for
attendance and results; mobile push via PWA; Hindi and regional-language UI (the
architecture avoids hard-coded strings for this reason).

**Later** — ERP connectors for common Indian systems; OR-Tools solver service;
predictive analytics (dropout risk from the attendance and assessment data
already collected); accreditation reporting (NAAC/NBA formats).

## Commercial architecture

Subscription tiers are declared in `src/lib/features.ts` and enforced by
per-tenant feature flags. White-labelling (logo, colour, terminology, grievance
categories, SLA) is configuration, not a fork. Adding a tenant is inserting a
row.

Not built: billing, self-service signup, a tenant-provisioning UI. These are
deliberate — they are the easiest part and the least useful to demonstrate.

## The productivity metric

The "Campus Productivity Score" is an **internal product metric, not an
accreditation standard**, and the interface states that. Each dimension is
displayed with the data it came from so the number can be interrogated rather
than trusted.

"Time saved" figures are **estimates** against configured manual baselines,
labelled as estimates everywhere, with the basis shown on hover. They are not
measured timings and are not presented as such.
