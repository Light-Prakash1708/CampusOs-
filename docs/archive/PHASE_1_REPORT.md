# CampusOS 2.0 — Phase 1 Report (Foundation)

## Completed

Each item has UI or API, a service, database support, server-side authorization, validation, error handling, tests, audit logging and documentation, except where the Scope column notes otherwise.

| Area | Delivered | Scope |
|---|---|---|
| Versioned migrations | `drizzle/migrations` 0000–0002, `npm run db:migrate` with v1 baselining, `db:reset` (local only) | Full |
| Environment validation | `src/lib/env.ts`, boot check in `src/instrumentation.ts`; production refuses unsafe configs and exits | Full |
| Password reset | forgot → email → reset page → reset; single-use hashed tokens; clears lockout; revokes sessions; "password changed" email | Full |
| Email verification | verify page (POST, scanner-safe), resend; gates sign-in for self-registered accounts | Full |
| Self-registration | public college list and structure, 3-step form, `EMAIL_DOMAIN` / `ADMIN_APPROVAL` / `DISABLED` policies, tenant-validated placement | Full |
| Invitations | admin invite (student/faculty/community roles; staff roles need `role:manage`), resend for imported accounts, accept page | Full |
| Registration approval | Admin → Access & Privacy | Full |
| Change password / sessions | `/account/security`: change password, device list, sign out one or all others; must-change-password enforcement | Full |
| Rate limiting | Postgres-backed fixed window, shared across instances; sign-in, reset, register, verify, invites, uploads, exports, AI (per-user hourly) | Full |
| CSRF defence | Origin check on API mutations in middleware | Full |
| File storage | local / S3-compatible / Supabase adapters, content-type detection, size limits, scanner adapter, authorised reads, 5-min signed URLs; wired into faculty resource uploads | Full (ClamAV adapter not included) |
| Notification providers | Email (Resend), Push (FCM HTTP v1), SMS (MSG91 DLT), WhatsApp (console only); priority planner; delivery queue with retries; delivery log | Email/SMS/FCM adapters built but not tested against live vendor accounts; push device registration UI is Phase 9 (PWA) |
| Privacy foundation | preferences, append-only consent ledger, data catalogue, retention policies, export, erasure (AI memory / tracker immediate; account reviewed + anonymised); `/account/privacy` page | Full. The polished Privacy Center UI is Phase 2 |
| Feature flags | 12 new tenant-aware module flags (all default off), `whatsapp_enabled`; super-admin toggles in Settings | Full |
| Roles | `CLUB_ADMIN`, `EVENT_ORGANIZER`, `CAMPUS_REP` + 10 new capabilities | Capabilities only; their modules arrive in Phases 3–4 |
| SSO preparation | `auth_identities` table + documented flow | Architecture only |
| Security headers | baseline CSP, COOP, HSTS (prod), no-store on APIs | Full |
| CI/CD | GitHub Actions (typecheck, lint, migrate, seed, test, build, audit, gitleaks), `render.yaml`, `Dockerfile` | Full |
| Dependencies | `next` 15.5.26 (critical advisory), postcss override → `npm audit`: 0 vulnerabilities | Full |

### v1 defects fixed
D1 missing `scripts/reset.ts` · D2 404 `/forgot-password` · D3 demo password
inlined into client bundle · D4 TLS detection · D5 advisories · D6 no lint ·
D9 no env validation · D10 proxy trust · **D11 resource search never populated**
· **D12 friendly conflict errors never fired (Drizzle error wrapping)** ·
**D13 cron could not reach the job runner**.

## Database changes (migration 0002)

- Enum values added: `user_role` += `CLUB_ADMIN`, `EVENT_ORGANIZER`, `CAMPUS_REP`; `user_status` += `PENDING`; `notification_channel` += `WHATSAPP`.
- New enums: `auth_token_purpose`, `delivery_status`, `file_scan_status`, `leaderboard_visibility`, `data_request_status`.
- New columns: `users.email_verified_at`, `users.password_changed_at`, `institutions.registration_policy`, `institutions.is_listed`, `notifications.delivery_planned_at`.
- New tables: `auth_tokens`, `auth_identities`, `rate_limit_buckets`, `stored_files`, `notification_deliveries`, `push_subscriptions`, `privacy_preferences`, `consent_records`, `data_retention_policies`, `data_export_requests`, `data_deletion_requests`.
- Constraints: token hash unique; one in-flight export or deletion per user (partial unique indexes); one delivery per notification and channel; checks on counters, sizes, expiries and enum-like text columns; append-only trigger on `consent_records`.
- Backfills: existing notifications marked planned so no email backlog is sent; active accounts marked verified.
- Repair: `resources.search_vector` rebuilt as a generated column.

## New APIs

Public: `POST /api/auth/register`, `POST /api/auth/password/forgot`, `POST /api/auth/password/reset`, `POST /api/auth/verify-email`, `POST /api/auth/verify-email/resend`, `POST /api/auth/invite/accept`, `GET /api/public/institutions`, `GET /api/public/institutions/:slug/structure`.

Authenticated: `POST /api/auth/password/change`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`, `POST /api/auth/sessions/revoke-others`, `GET|PATCH /api/privacy/preferences`, `GET /api/privacy/consents`, `GET /api/privacy/catalogue`, `GET /api/privacy/export`, `POST /api/privacy/deletion`, `POST /api/files`, `GET /api/files/:id`, `POST|DELETE /api/notifications/push-subscriptions`.

Admin: `POST /api/admin/users/invite`, `POST /api/admin/users/:id/resend-invite`, `GET /api/admin/registrations`, `POST /api/admin/registrations/:id`, `PATCH /api/admin/settings/features`, `PATCH /api/admin/settings/registration`, `GET /api/admin/privacy/deletion-requests`, `POST /api/admin/privacy/deletion-requests/:id`.

Extended: `POST /api/jobs/run` now also runs `plan_notifications`, `deliver_notifications` and `sweep` (only with the cron secret). `POST /api/ai/ask` and the teacher copilot are rate-limited per user.

Pages: `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/invite`, `/account/security`, `/account/privacy`, `/admin/access`; Settings gains module toggles and registration policy.

## Tests

The suite grew from 46 to **112 tests**, all passing against real PostgreSQL 16.

- `tests/foundation-unit.test.ts` (37 tests) covers env validation, TLS mode, the CSRF guard, roles and flags, the delivery planner (priority, preferences, mandatory override, throttle, quiet hours, timezone), template escaping, upload validation, scanners, storage key safety, SigV4 presigning, privacy rules, catalogue completeness and Drizzle error mapping.
- `tests/foundation-integration.test.ts` (29 tests) covers the following against the database:
  - registration in each policy
  - domain and cross-tenant rejection
  - uniform duplicate response
  - approval gating, including a foreign admin
  - identical failure responses
  - lockout, and reset clearing it
  - per-IP rate limit and atomic counters
  - reset single use, session revocation and hash-only storage
  - expiry and superseding of tokens
  - change password
  - invitation acceptance and its tenant and role checks
  - the append-only consent ledger
  - AI memory purge
  - own-data-only export
  - anonymising deletion, including a foreign admin
  - upload type rejection
  - cross-tenant and owner-only file reads
  - private resource files
  - notification planning (priority, preference, idempotence), delivery, and tenant channel gating

A manual smoke test against the running app exercised each end to end: register → verify → admin approve → sign in; forgot → reset → token reuse refused; cross-site POST blocked; privacy toggle; export download; invite → accept; file upload and read; cron job runner with the secret (401 without it).

## Remaining work (next phases)

- **Phase 2:** student home redesign on the new visual system, onboarding, goals/habits, streaks, XP ledger, achievements, leaderboards, a polished Privacy Center, and the Attendance Planner. These now merge with the UI redesign brief.
- Push device registration (service worker, FCM web token) arrives with the PWA in Phase 9.
- A ClamAV scanner adapter.
- Live verification of the Resend, MSG91 and FCM adapters with real credentials.
- An SSO provider.
- Nonce-based CSP.
- 88 ESLint warnings remain, mostly unused imports in v1 files; there are no errors.

## Potential regressions to watch

- Sign-in now returns 429 after 30 attempts per IP in 15 minutes. A campus behind a single NAT IP could reach this at peak. It is tunable in `RATE_LIMITS.loginPerIp`, and the per-account limit is the real protection.
- The Origin check rejects API mutations from other origins. A separately hosted front end would need to be added to the allowed set.
- `npm start` now binds `$PORT`. Anything that assumed port 3000 while `PORT` is set will behave differently.
- The `db:constraints` script is now a no-op message. Use `db:migrate`.
- `mustChangePassword` accounts are redirected to `/account/security` until they change their password. Previously they could use the app with a temporary password.
