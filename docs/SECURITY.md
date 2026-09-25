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
