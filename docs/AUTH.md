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

## Account lifecycle (CampusOS 2.0)

All rules live in `src/services/auth/accounts.ts`; routes only validate and
translate. Every credential change bumps `session_epoch`, so sessions issued
before it stop working on the next request.

| Flow | Endpoint(s) | Notes |
|---|---|---|
| Sign in | `POST /api/auth/login` | Rate-limited per IP (30/15 min) and per account (10/15 min) on top of the 8-failure lockout. Correct password + unverified email → `EMAIL_NOT_VERIFIED`; pending approval → `REGISTRATION_PENDING`. |
| Forgot password | `POST /api/auth/password/forgot` → email → `/reset-password?token=` → `POST /api/auth/password/reset` | Uniform response whether or not the account exists. Token: 32 random bytes, SHA-256 hash stored, 30-minute TTL, single use, superseded by newer requests. A reset clears lockout, revokes every session and emails a "password changed" notice. |
| Change password | `POST /api/auth/password/change` | Requires the current password; revokes every session, then re-issues one for this device. |
| Must-change password | `users.must_change_password` | Imported / temporary accounts are redirected to `/account/security?required=1` before any portal page renders. |
| Email verification | email → `/verify-email?token=` → `POST /api/auth/verify-email`; `POST /api/auth/verify-email/resend` | The page POSTs the token, so mail scanners that prefetch links cannot confirm on the user's behalf. |
| Self-registration | `GET /api/public/institutions`, `GET /api/public/institutions/:slug/structure`, `POST /api/auth/register` | See below. |
| Invitations | `POST /api/admin/users/invite`, `POST /api/admin/users/:id/resend-invite` → `/invite?token=` → `POST /api/auth/invite/accept` | 7-day single-use token. Accepting sets the password, activates and verifies the account, and signs in. Imported `INVITED` accounts can be sent an invitation from **Admin → Access & Privacy**. |
| Registration approval | `GET /api/admin/registrations`, `POST /api/admin/registrations/:id` | Only verified addresses can be approved. |
| Sessions | `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`, `POST /api/auth/sessions/revoke-others` | Shown at `/account/security`. |

### Registration

Each institution chooses a policy (`institutions.registration_policy`), editable
by a super administrator in **Settings → Registration**:

| Mode | Behaviour |
|---|---|
| `DISABLED` (default) | Accounts only via invitation or CSV import. |
| `EMAIL_DOMAIN` | Anyone with an address on `allowedDomains` may register; confirming the email activates the account. |
| `ADMIN_APPROVAL` | Anyone may apply; after confirming the email an administrator activates it. |

The student picks a college from the public list (only colleges with
`is_listed = true` and a non-disabled policy appear) and supplies name, email,
department, programme, year, section and student ID. The chosen programme and
section are re-validated server-side against **that** college — an id from
another tenant is rejected. Registration never reveals whether an email is
already registered.

### Roles added in 2.0

`CLUB_ADMIN`, `EVENT_ORGANIZER`, `CAMPUS_REP` — intended as **secondary** roles
on student accounts (`users.secondary_roles`), adding community capabilities
(`club:manage`, `event:manage_own`, `event:checkin`, `campus_rep:act`) without
removing any student capability. Every account also holds `privacy:manage_own`.

### SSO preparation

`auth_identities` links a provider subject (`google`, `microsoft`,
`saml:<entity>`) to a user; `users.password_hash` is nullable so an SSO-only
account has no password. No provider is wired yet — the next step is an
OAuth/OIDC callback that looks up `auth_identities` by `(provider, subject)`
and calls `startSession()`.

## What is not implemented

- **MFA** — schema has room; not built.
- **SSO login** — architecture above; no provider wired.
- **Impersonation** — `user:impersonate` is declared for support workflows but
  no UI exists.
