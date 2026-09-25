# Verification record

How CampusOS is checked before a release, and the latest results.

## Automated gate (every phase, and CI)

`npm run typecheck` · `npm run lint` (0 errors) · `npm test` · `npm run build`
· `git diff --check` · migrations applied twice (idempotent) · schema drift
check. See `DEPLOYMENT.md` → CI.

## Smoke checks against a production build

Run `next start` with a production-valid configuration (demo mode off, real
secrets, `EMAIL_PROVIDER=none`, `STORAGE_PROVIDER=local` +
`ALLOW_LOCAL_STORAGE=true`) over the demo database, then:

- `scripts/smoke/crawl.mjs` — every non-dynamic route per role, desktop
  (1440) and phone (390): HTTP status, console and page errors (incl.
  hydration), horizontal overflow, and every internal link on each page.
- `scripts/smoke/authz.mjs` — signed-out, student, faculty and admin requests
  to other roles' pages and APIs must be refused or redirected.
- Sign-in/sign-out through the real form (bad password message, return to the
  requested page, protected pages after sign-out).

## Latest run (Phase 4)

| Role | Routes | Links checked | Problems |
|---|---|---|---|
| Student | 25 | 80 | 0 |
| Faculty | 21 | 56 | 0 (after fixes below) |
| Admin | 29 | 56 | 0 |
| Super admin | 27 | 56 | 0 |
| Signed out | 7 | 3 | 0 |

Authorization probe: no leaks. Sign-in/out: correct.

**Found and fixed in Phase 4**
- `/faculty/copilot` crashed on every visit in production: the server page
  imported a constant from a `'use client'` module (it receives a client
  reference, not the array). Moved to `planTypes.ts`.
- Every faculty page prefetched `/faculty/profile`, which didn't exist (404
  in the console). Added the faculty profile page; faculty now also have
  Profile/Settings in the sidebar like students.
- The copilot linked to `/faculty/settings`, which didn't exist. Added faculty
  settings (notifications, how AI is configured, theme) on a role-neutral
  `/api/account/settings/notifications`; removed the unused
  `/api/faculty/settings` route, which read the wrong env var for push.
- Client crash reports no longer carry the server's own stack trace.
- A new test checks every link the app shell builds per portal.
