# Authentication & Authorization

## Sessions

**Transport:** an httpOnly, SameSite=Lax, Secure-in-production cookie holding a
signed JWT.
**Authority:** the `sessions` table.

The JWT alone is never sufficient. Every request re-checks that the session row
exists, is unrevoked, is unexpired, and that the user's `session_epoch` still
matches the value baked into the token.

That means revoking a session, changing a role, or forcing a logout takes effect
on the **next request** — not whenever the token happens to expire.

```
cookie → verify signature → look up session row → check revoked / expired
       → compare token hash → check user active → compare session epoch → AuthContext
```

The raw session token is never stored. The table holds a SHA-256 hash; the token
itself lives only in the cookie.

### Edge middleware is not the boundary

`src/middleware.ts` runs on the Edge runtime and cannot reach PostgreSQL. It
does a cheap signature-and-expiry check so unauthenticated traffic never reaches
a server component, and stamps a request id.

It is explicitly **not** the authorization boundary. A valid-but-revoked token
passes middleware and is rejected immediately afterwards by `getCurrentUser()`.
Middleware fails closed: if `AUTH_SECRET` is missing it refuses everything
rather than letting traffic through.

## Passwords

bcrypt, cost 12, configurable via `BCRYPT_COST`. Chosen over argon2 because it
has no native build step, which keeps `npm install` portable across whatever
the college's IT team deploys on.

- Failed logins increment a counter; 8 failures locks the account for 15 minutes.
- A missing account still performs a dummy bcrypt comparison, so response timing
  does not reveal which emails exist.
- The failure message is identical for "no such user" and "wrong password".
- Imported accounts are created `INVITED` with `must_change_password`.

## Capability-based authorization

Code never asks *"is this user an ADMIN?"*. It asks *"may this user publish
official notices?"*.

```ts
const user = await requirePermission('timetable:publish');   // server component
export const POST = withAuth('timetable:edit', handler);      // route handler
if (can(user, 'grievance:assign')) { … }                      // conditional UI
```

There are 70 capabilities in `src/lib/auth/permissions.ts`. Roles are lists of
capabilities. Adding a role (HOD, EXAM_CELL, COUNSELLOR, LIBRARY…) is a data
change in one file, not a refactor of every call site.

### Implication closure

A broad capability grants the narrower ones it obviously implies:

```
workload:view_all → workload:view_department → workload:view_own
attendance:view_all → attendance:view_section → attendance:view_own
grievance:view_all → grievance:view_assigned → grievance:view_own
```

`permissionsForRoles()` closes the granted set under these implications. This
exists because of a real bug: an administrator holding `workload:view_all` was
denied a tool that checked `workload:view_own`. The closure makes that class of
bug impossible, and a test asserts it.

### Hiding UI is not access control

Every page showing privileged data calls `requirePermission`. Every mutating
route is wrapped in `withAuth`. Navigation filtering is a convenience on top of
that, never instead of it.

Verified by test: a student session receives `403` from
`POST /api/announcements`, `POST /api/timetable/generate` and
`/api/reports/attendance`, and `307` away from `/admin`.

### Deliberately withheld capabilities

`grievance:reveal_anonymous` is **not** granted to `ADMIN`. Only `SUPER_ADMIN`
holds it, and every use writes a `GRIEVANCE_ANONYMITY_REVEALED` audit record.
Anonymity that an administrator can casually undo is not anonymity — see
[GRIEVANCE.md](GRIEVANCE.md).

## Tenant scoping

`AuthContext` carries `institutionId`, and every service derives the tenant from
it. **No service function accepts a caller-supplied institution id.** There is
no code path where a request body can select which college's data to read.

## What is not implemented

Stated plainly rather than implied:

- **Password reset by email** — needs an email provider; the flow is designed
  but the `/forgot-password` route is not built.
- **MFA** — the schema has room for it; no implementation.
- **SSO / SAML / Google Workspace** — the intended path for most colleges, and
  the reason `users.password_hash` is nullable.
- **Impersonation** — `user:impersonate` is declared for support workflows but
  no UI exists.
