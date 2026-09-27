# Security

A threat model and the specific control for each threat, rather than a list of
good intentions.

## Threats and controls

### A student reads another student's records

- Every service derives the tenant and subject from the server-side
  `AuthContext`; **no function accepts a caller-supplied institution or student
  id**.
- AI tools scope to the caller: `get_attendance` reads
  `user.studentProfileId`, which the model cannot influence.
- Global search filters at the query level, so unauthorised rows are never
  fetched and then hidden.
- *Verified:* a student session gets `403` from admin APIs and `307` away from
  `/admin`.

### An administrator quietly deletes a complaint

- `grievances` has no `deleted_at`; `WITHDRAWN`/`CLOSED` retain the record.
- `grievance_events` and `audit_logs` reject UPDATE and DELETE via database
  triggers.
- *Verified:* integration tests assert both rejections.

### An administrator unmasks an anonymous reporter

- `grievance:reveal_anonymous` is withheld from `ADMIN`; only `SUPER_ADMIN`
  holds it, and use is audited.
- Anonymous cases record no actor on their timeline events.
- CSV exports omit raiser identity entirely.

### Two administrators corrupt the timetable simultaneously

- Partial unique indexes make the invalid state unrepresentable.
- `timetable_entries.version` provides optimistic locking; a stale write
  affects zero rows and reports the conflict.
- *Verified:* a direct conflicting INSERT is rejected by PostgreSQL.

### A stolen or stale session token is replayed

- Sessions are server-side and revocable; the token hash is stored, never the
  token.
- `session_epoch` invalidates every issued token on role change or forced
  logout.
- Cookies are httpOnly, SameSite=Lax, Secure in production.
- Middleware fails closed when `AUTH_SECRET` is absent.

### Credential stuffing / brute force

- Database-backed rate limits (shared across instances): 30 sign-ins per IP
  and 10 per account per 15 minutes; limits on password reset, registration,
  verification resends, uploads, exports and AI calls (`src/services/rate-limit.ts`).
  Keys are hashed, so the counter table holds no emails or IPs in clear.

- bcrypt cost 12; 8 failures locks the account for 15 minutes.
- Uniform failure message and dummy bcrypt work for unknown emails, so timing
  and wording do not enumerate accounts.
- Every failed attempt is audited.

### Prompt injection through an uploaded document or complaint

- Untrusted content is fenced in `<untrusted>` tags and the system prompt
  designates it as data.
- No mutating tools exist.
- Tool permissions are re-checked server-side, so a successful injection still
  cannot reach data the caller could not already see.

### SQL injection

- All queries go through Drizzle's parameterised builder. Raw `sql` templates
  interpolate values as bind parameters, never string concatenation.

### XSS

- React escapes by default. `dangerouslySetInnerHTML` appears exactly once — the
  inline theme script in the root layout, which contains no user data.
- Notice bodies, complaint text and submissions render as plain text.

### Clickjacking / MIME sniffing

- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy`
  disabling camera, microphone and geolocation.

### Secrets leaking to the browser

- Only `NEXT_PUBLIC_*` variables reach the client, and the sole one is the demo
  password, which is empty in production builds.
- Server-only modules import `server-only`, making a client import a build
  error.
- Audit payloads redact `passwordHash`, `token`, `secret`, `apiKey`.

### Runaway AI spend

- Per-institution monthly ceiling; at the limit the assistant declines and the
  rest of the product is unaffected.

## Error handling

Errors never leak internals. `src/lib/api.ts` maps Postgres codes to product
language (`23505` on `timetable_room_slot_uq` → *"That room is already booked
for this period."*). Unexpected errors return a UUID reference, log the detail
server-side, and never return a stack trace.

## Data protection posture

- Student data is tenant-isolated and role-scoped.
- Every consequential action is attributable and permanently recorded.
- Exports are audited (`DATA_EXPORTED`).
- Soft deletion preserves records a college may be required to produce.

Toward India's DPDP Act, the schema supports purpose limitation (capability
scoping), storage limitation (soft deletion and retention columns) and
accountability (audit log). A production deployment would still need a documented
retention policy, a consent record for guardians of minors, and a defined breach
process — these are institutional decisions the software supports rather than
makes.

## Not yet implemented

- Rate limiting on API routes beyond login lockout (needs a shared store).
- File upload virus scanning; the storage adapter is an interface with a local
  implementation.
- Row-Level Security as defence in depth (schema is shaped for it).
- MFA and SSO.
- Automated dependency scanning in CI.


## CampusOS 2.0 additions

### Cross-site request forgery
Session cookies are `SameSite=Lax`. In addition, middleware rejects any
state-changing `/api/*` request whose `Origin` header is present and is not
this site (`isCrossSiteMutation`, unit-tested). Non-browser clients (cron,
mobile apps) send no Origin and carry no ambient cookie.

### Account takeover via reset / invite links
Tokens are 256-bit random, stored only as SHA-256, single-use (consumed in the
same transaction as the change), short-lived (reset 30 min, verify 48 h, invite
7 days), bound to the email they were sent to, and superseded when a new one is
issued. Reset responses are identical whether or not the account exists.
Links are built from `APP_URL`, never from the request's Host header.

### Malicious uploads
Type is detected from file content (magic bytes) and must match the extension;
the client's MIME type is ignored. Size is capped (`STORAGE_MAX_FILE_MB`). A
scanner adapter runs before storage (`MALWARE_SCANNER`); with none configured,
files are recorded `NOT_SCANNED`, never `CLEAN`. Objects are private: reads go
through `GET /api/files/:id`, which authorises per purpose and tenant, then
streams with `Content-Security-Policy: sandbox` and `nosniff`, or redirects to a
5-minute pre-signed URL. Storage keys are generated server-side and validated
against traversal.

### Secrets
`src/lib/env.ts` validates configuration at boot; production refuses demo mode,
placeholder secrets, console email and ephemeral local storage. No secret uses
the `NEXT_PUBLIC_` prefix. (v1 inlined `NEXT_PUBLIC_DEMO_PASSWORD` into the
client bundle; it is now passed server-side only in non-production demo mode.)

### Headers
`X-Frame-Options: DENY`, `nosniff`, strict referrer, a baseline CSP
(`frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`),
COOP `same-origin`, HSTS in production, `Cache-Control: no-store` on APIs. A
nonce-based `script-src` is planned for Phase 9.

### Client IP trust
`TRUST_PROXY` (default true for proxied hosts) governs whether
`x-forwarded-for` is honoured for audit and rate limiting. Clients can
pre-fill that header, so the address is read from the right:
`TRUSTED_PROXY_HOPS` (default 1) is the number of proxies that append to it
(Render alone = 1; Cloudflare in front of Render = 2).

## Two-step sign-in (CAMPUSOS-018)

- **Method:** TOTP (RFC 6238; 6 digits, 30 s, SHA-1), which works with any authenticator app. It is implemented with `node:crypto` in `src/lib/auth/totp.ts`, and the RFC test vector is covered by a test.
- **Storage:**
  - The secret is encrypted at rest with AES-256-GCM. The key is `MFA_ENCRYPTION_KEY`, or is derived from `AUTH_SECRET` when that isn't set.
  - Ten recovery codes are stored as SHA-256 hashes, and each works once.
  - The table is `user_mfa`.
- **Replay protection:** a TOTP time-step is accepted once (`last_used_step`), with ±1 step of clock drift.
- **Login:**
  1. A correct password returns a signed challenge that is valid for 5 minutes. It is bound to the user, the tenant and the session epoch. No session is started yet.
  2. `POST /api/auth/mfa` with a code or a recovery code starts the session.
  3. Attempts are rate-limited per user (10 per 15 minutes) and failures are audited.
- **Policy:**
  - `MFA_REQUIRED_ROLES` defaults to `SUPER_ADMIN`.
  - `MFA_ENFORCE` defaults to on in production and off elsewhere.
  - A required user without MFA is redirected to `/account/security` by every portal, and every API returns `403 MFA_SETUP_REQUIRED` except the account, auth and notice endpoints.
  - Platform operators **must** have MFA wherever it is enforced.
  - Required roles cannot switch it off.
  - Demo accounts cannot enrol.
- **Recovery:**
  - Users regenerate recovery codes with a current code.
  - An administrator with `institution:manage` can reset someone else's MFA in the same college, never their own. The reset is audited as `MFA_RESET` and ends that person's sessions.
- **Audit actions:** `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_RECOVERY_USED`, `MFA_RESET`.
- **Owner step:** set `MFA_ENCRYPTION_KEY` (32+ characters) in production, and don't rotate it; rotating it makes enrolled secrets unreadable. Enrol the first operator right after provisioning.
