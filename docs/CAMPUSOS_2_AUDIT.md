# CampusOS 2.0 — Phase 0 Audit

_Audited: 25 Sep 2026 · codebase imported as commit "Import existing CampusOS v1 codebase"_

This document records what the v1 codebase actually does, verified by running
it against a real PostgreSQL 16 database — not by reading the README. It is the
baseline every CampusOS 2.0 phase builds on.

## 0. Verification run (baseline)

| Check | Result |
|---|---|
| `npm ci` | OK (Node 22) |
| `npm run typecheck` | **0 errors** |
| `npm run db:push` + `0001_hard_constraints.sql` | OK — 69 tables, triggers, partial unique indexes |
| `npm run db:seed` | OK in 6.7 s — 353 students, 22 faculty, 24,588 attendance records, published timetable |
| `npm test` | **46 / 46 passing** (4 files; integration tests hit the real DB) |
| `npm run build` | OK — 55+ routes, 103 kB shared first-load JS |
| `npm audit --omit=dev` | **3 vulnerabilities (1 critical: `next`, 2 high: `postcss`, `sharp`)** — fixable within semver |

## 1. Architecture (preserve)

```
Next.js 15 App Router → Server Components / Route Handlers (withAuth)
  → Services (src/services) → Drizzle ORM (node-postgres) → PostgreSQL
```

The layering is clean and consistently applied. Services take an
`AuthContext` and derive `institutionId` from it; no service accepts a
caller-supplied tenant id. **This is the most valuable property of the
codebase and must not be weakened.**

## 2. What already works (reuse, do not rewrite)

| Area | Where | Notes |
|---|---|---|
| Multi-tenant schema (69 tables) | `src/lib/db/schema/*` | `institution_id` on every tenant table; integration test asserts it |
| DB integrity guarantees | `drizzle/0001_hard_constraints.sql` | no double-booking (partial unique indexes), one published timetable per term, append-only `audit_logs` / `grievance_events` triggers, check constraints, generated `tsvector` |
| Sessions | `src/lib/auth/session.ts` | JWT cookie as transport, `sessions` table as authority, hashed token, `session_epoch` for global revocation |
| Login | `src/app/api/auth/login/route.ts` | uniform failure message, dummy bcrypt for timing, lockout after 8 failures / 15 min, audit on success + failure |
| Capability RBAC | `src/lib/auth/permissions.ts` | ~95 capabilities, 13 roles, implication closure, tested |
| `withAuth` + error envelope | `src/lib/api.ts` | Zod → 422, PG 23505 → friendly 409, no leaked internals |
| Edge middleware | `src/middleware.ts` | cheap JWT check, request id, fail-closed |
| Feature flags | `src/lib/features.ts` | per-tenant JSONB on `institutions`; nav hidden when disabled |
| Timetable CSP solver + conflict engine | `src/services/timetable/*` | real algorithm, tested |
| Communication engine | `src/services/communication.ts` | hierarchy audience resolution, frozen recipients, acknowledgement, change feed |
| Notifications (in-app) | `notifications`, `notification_preferences`, `notification_settings` | grouping, mandatory flag, quiet hours columns |
| Readdressal / grievances | `src/services/grievance.ts` | workflow, SLA, escalation, anonymity |
| Attendance | schema + faculty marking + student view | basis-point precision; student page already shows "classes you can still miss" headroom |
| Assignments / assessments | schema + faculty/student pages | AI suggestion kept separate from human score |
| Skills & employability | `src/services/skills.ts` | evidence-backed profiles, career roles, gap analysis |
| AI assistant | `src/services/ai/*` | provider abstraction (Anthropic / honest offline), 13 permission-gated read-only tools, `<untrusted>` fencing, `ai_generations` metering, monthly budget, `ai_actions` for approval-gated mutations |
| Audit log | `src/services/audit.ts` | append-only at DB level, redaction helper |
| Job runner | `POST /api/jobs/run` | cron-secret or admin; escalation, scheduled publish, expiry |
| Design system | `src/components/ui`, `globals.css` | light/dark tokens, accessible primitives, skeletons, empty/error states |
| Three portals | `src/app/{student,faculty,admin}` | portal enforced in `PortalLayout`; data pages use `requirePermission` |

## 3. Partially implemented

| Area | State | Gap |
|---|---|---|
| Auth completion | login/logout/lockout/revocation done | **no password reset, no email verification, no self-registration, no invitations, no change-password UI, no "sign out other devices"**; `/forgot-password` is whitelisted in middleware but the page does not exist (404) |
| Notification delivery | in-app only | channel model exists, **no provider adapters** (email/push/SMS/WhatsApp), no delivery log, no priority-based routing |
| Events | `events`, `event_registrations`, admin list page | institution-internal only: no discovery, categories, capacity enforcement, waitlist, QR pass, check-in, certificates, organizers, verification |
| Settings | admin settings render read-only | no write UI for flags/branding |
| Attendance planner | headroom per subject exists | no "what if I miss", recovery target, trend, semester view |
| PWA | manifest route | **no icons in `/public`, no service worker**, no offline shell |
| Roles | 13 roles in enum | **missing `CLUB_ADMIN`, `EVENT_ORGANIZER`, `CAMPUS_REP`**; only 4 roles have portals |
| Rate limiting | login lockout only | nothing on other endpoints |
| Migrations | `db:push --force` + idempotent constraints SQL | **no versioned migration history**; `db:push --force` is unsafe for production |

## 4. Scaffolded (declared, not built)

- File storage: `STORAGE_AVAILABLE = false`; uploads refused with 501 (honest).
- Virtual lab: flag only.
- SSO / MFA / impersonation: capability declared, no implementation.
- Billing / plans: tiers in `features.ts`, no tables.

## 5. Broken / defects found

| # | Defect | Severity | Fix phase |
|---|---|---|---|
| D1 | `npm run db:reset` calls `scripts/reset.ts`, which does not exist | Low | 1 |
| D2 | `/forgot-password` linked from login error hint + whitelisted, but 404s | Medium | 1 |
| D3 | `NEXT_PUBLIC_DEMO_PASSWORD` is inlined into the client bundle at build time; if set in a production build it ships to every browser | Medium (security) | 1 |
| D4 | `db.ts` disables TLS only for `localhost`; `127.0.0.1` / docker hosts try TLS and fail; `rejectUnauthorized:false` for all remote hosts | Low | 1 |
| D5 | Critical/high advisories in `next`, `postcss`, `sharp` | High | 1 |
| D6 | No ESLint config although `eslint` is a dependency; no `lint` script | Low | 1 (CI) |
| D7 | `manifest.webmanifest` references `/icons/*.png` which do not exist | Low | 9 (PWA) |
| D8 | Some admin pages (`/admin/events`, `/admin/communications/[id]`) only rely on the portal check, not a capability — any admin-portal role (e.g. FINANCE) can view them | Low | 3 |
| D9 | No environment validation at boot: a missing `AUTH_SECRET` surfaces only on first request | Low | 1 |
| D10 | `x-forwarded-for` trusted unconditionally for IP (affects audit + any future rate limit) | Low | 1 (documented; trust proxy setting) |

## 6. What must NOT be rewritten

- The Next.js → services → Drizzle → Postgres layering. No new ORM, no Firebase, no MongoDB, no microservices.
- `AuthContext` / `getCurrentUser` / `withAuth` / `requirePermission`.
- The capability matrix and implication closure (extend, don't replace).
- The session model (DB-authoritative, epoch-based revocation).
- DB constraints file and append-only audit triggers.
- AI provider abstraction, tool permission re-check, offline provider honesty.
- Communication audience resolution.
- The existing `events` / `event_registrations` tables — Phase 3 **extends** them rather than creating a parallel `campus_events` table.
- `notifications` table — Phase 1 adds delivery tracking beside it rather than replacing it.
- `ai_preferences` — Phase 6 AI memory builds on it.

## 7. What should be refactored

- Move login business logic from the route handler into `src/services/auth.ts` so registration, reset, verification and login share lockout/audit code.
- Replace `db:push --force` in the production path with versioned migrations (drizzle-kit `generate` + `migrate`).
- Centralise env access in a validated module (`src/lib/env.ts`).
- Client IP extraction duplicated in 3 places → `src/lib/http.ts`.

## 8. Gaps by layer

**Frontend** — student home is an ERP-style dashboard (not the calm hierarchy
in the brief); no onboarding; no Track / Explore / Inbox IA; no bottom-sheet
patterns; no Privacy Center; no forgot/reset/verify/register/invite screens.

**Backend** — no registration/invite/reset/verify services; no rate limiter;
no storage adapter; no notification provider adapters or delivery log; no
privacy/consent tables; no gamification, goals, clubs, channels, library,
opportunities, billing modules.

**AI** — no agent registry (per-agent tool scopes, call limits, budgets); no
per-user rate limit (only tenant monthly budget); no AI Coach, Study Planner,
Event Scout; `ai_preferences` exists but no user-facing memory controls.

**Deployment** — no CI, no Dockerfile/Render blueprint, no migration runner,
no env validation, no Sentry hook, `.env.example` missing several 2.0 keys.

## 9. Database migration plan

Principle: **additive, versioned, reversible-by-design.** No destructive
changes to v1 tables; new columns are nullable or defaulted.

| Migration | Contents | Phase |
|---|---|---|
| `0000_baseline` | Generated from the v1 schema. Existing databases created with `db:push` are **baselined** (marked applied) by `scripts/migrate.ts` instead of re-run. | 1 |
| `0001_hard_constraints` | The existing constraints file, moved into the journal (idempotent). | 1 |
| `0002_auth_privacy_foundation` | `user_role` += `CLUB_ADMIN`, `EVENT_ORGANIZER`, `CAMPUS_REP`; `notification_channel` += `WHATSAPP`; `users.email_verified_at`, `users.password_changed_at`; `auth_tokens` (hashed, single-use, typed: reset / verify / invite); `rate_limit_buckets`; `notification_deliveries`; `privacy_preferences`; `consent_records`; `data_retention_policies`; `data_export_requests`; `stored_files`; append-only trigger on `consent_records` | 1 |
| `0003_student_experience` | `user_interests`, `goals`, `goal_logs` (habits are goals with a schedule), `streaks`, `xp_transactions` (unique idempotency key), `user_gamification_profiles`, `achievements`, `user_achievements`, onboarding state | 2 |
| `0004_events_2` | extend `events` (category, visibility, verification level, organizer type, city/geo, pricing, certificate, team size, registration mode) + `event_organizers`, `event_categories`, `event_waitlist` (or status on registrations), `event_checkins`, `event_certificates`, `event_communications`, `event_reports`, `event_sources`, `event_follows`; capacity + deadline enforced by constraint/trigger | 3 |
| `0005_community` | `clubs`, `club_members`, `club_posts`, `channels`, `channel_members`, `channel_posts`, campus rep tables | 4 |
| `0006_library` | `library_books`, `library_copies`, `library_loans` (partial unique: one active loan per copy), `library_reservations`, `library_fines` | 5 |
| `0007_ai_agents` | `ai_agents` registry, `ai_memory_items`, per-user usage counters | 6 |
| `0008_opportunities` | `opportunities`, `opportunity_applications`, `opportunity_sources` | 7 |
| `0009_billing` | `plans`, `subscriptions`, `entitlements`, `usage_records`, `payments`, `invoices` | 8 |

Rollback consideration: each migration ships with a matching `down` note in
`docs/DATABASE.md`; enum value additions are forward-only in PostgreSQL and are
therefore listed explicitly.

## 10. Implementation roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Audit (this document) | **Done** |
| 1 | Versioned migrations, env validation, auth completion (register, invite, verify, reset, change password, sign out everywhere), rate limiting, storage adapters (local / S3-compatible / Supabase) with signed URLs + scan interface, notification provider adapters + delivery log + priority routing, privacy foundation tables + service, 12 new tenant-aware flags, new roles, security headers, dependency advisories, CI, Render blueprint | In progress |
| 2 | Student home redesign, onboarding, My Progress (goals/habits), streak engine, XP ledger, achievements, leaderboards, Privacy Center UI, Attendance Planner | Next |
| 3 | Events 2.0 (discovery, registration modes, QR, check-in, certificates, organizer dashboard, verification, moderation, WB geography) | |
| 4 | Clubs, channels, campus reps | |
| 5 | Library add-on | |
| 6 | AI agents, Coach, Study Planner, Event Scout, memory | |
| 7 | Opportunity hub | |
| 8 | Billing (Razorpay behind an adapter) | |
| 9 | PWA, observability, performance, accessibility audit | |
