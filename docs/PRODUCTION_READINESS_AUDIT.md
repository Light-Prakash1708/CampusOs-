# Production readiness and integration audit

This audit was run on top of `7c5c7b3` (Phases 1–9 plus the final audit).

**Method:**

- Code review of every module, assisted by a repository-wide scan.
- A new end-to-end suite, `tests/production-readiness.test.ts`, driving the same services the API routes call.
- A clean-database migration run.
- Environment validation checks.
- A browser crawl of every page for four accounts at 1440, 768 and 390px.
- Both authorization probes.

## Result

**Ready to deploy**, once the environment variables in `DEPLOYMENT.md` are set.

- Nothing high or medium severity is open.
- Remaining items are either product decisions or low-severity improvements; both are listed below.

| Check | Result |
|---|---|
| Typecheck | clean |
| Lint | 0 errors (84 pre-existing warnings, mostly unused imports) |
| Tests | 241, in 16 files; all pass |
| Production build | OK |
| Clean DB: migrate twice | 10 migrations, idempotent, 98 tables; drift check clean |
| Supabase-style roles present | RLS on all 98 tables; `anon` and `authenticated` have no access |
| Browser crawl (1440, 768, 390) | 0 problems: student 27 routes, faculty 18, admin 29, super admin 29 |
| Authorization probes | no leaks (core probe, plus 31 module checks) |
| Production env with **no optional keys** | boots; AI offline, email/SMS/push off, storage explicit |
| Env with providers selected but missing credentials | boot refused, naming the variable (tested for AI, email, S3, feed, error webhook, database) |

## Journeys verified (`tests/production-readiness.test.ts`)

- **Student:** event registration → QR pass → desk check-in (idempotent) →
  certificate → verified XP → tracker check-in → library (reserve while out →
  queue → issue → renew → return) → AI chat → proposal → confirm → executed and
  audited → opportunity saved → applied → tracker → career goal. The data
  export then contains every module's records.
- **Organiser:**
  - A student-created event waits for approval.
  - Concurrent registrations fill capacity exactly: 2 registered, 1 waitlisted.
  - Check-in by code, then a certificate is issued.
  - A check-in volunteer (`event:checkin`) can scan passes but cannot manage the event or issue certificates.
- **Library, AI, career:** covered in the student journey and in each module's own suite.

## Issues found and fixed

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | High | Grievance assignment accepted any user id: another college, or a student. The assignee got handler access and a cross-tenant notification. | The assignee must be an active user at the same college holding `grievance:resolve`. |
| 2 | Medium | **Open redirect** after sign-in (`/\evil.com` passed the check) | `safeReturnPath`: same-origin paths only (tested) |
| 3 | Medium | Rate limits keyed on the **left-most** `X-Forwarded-For` entry, which the client controls | The IP is read from the right. `TRUSTED_PROXY_HOPS` (default 1) is documented. |
| 4 | Medium | Resource search (⌘K) and the AI `search_resources` tool ignored visibility: private, other-department and section material leaked | One role-aware rule, `resourceVisibilityFor()`, is used by search, AI and file downloads |
| 5 | Medium | File downloads: section and draft resources were readable college-wide, and any evaluator could read every submission | Resources use the same visibility rule. Submissions: the owner, `assignment:view_all`, or the faculty teaching that class. |
| 6 | Medium | Upload purpose wasn't tied to role (a student could upload college-readable "announcement" files), and chunked bodies skipped the size check | Each purpose needs its permission; `Content-Length` is required (411) |
| 7 | Medium | `GET /api/events/:id` returned the whole row: the joining link to everyone, moderation notes, organiser id | Joining link only for registrants and managers; notes and ids only for managers |
| 8 | Medium | **Scheduled or approved notices reached no one** (the status flipped, but no recipients or notifications were created) | `publishAnnouncement()` resolves the audience at publish time and delivers; used by approvals and the scheduler (tested) |
| 9 | Medium | Anyone who could post an informational notice could mark it CRITICAL, which bypasses everyone's preferences | CRITICAL needs `announcement:create_official` or emergency broadcast |
| 10 | Medium | The notification dispatcher didn't check that a recipient belongs to the notification's college | Guard added; per-user preference lookup is no longer O(n·m) |
| 11 | Medium | Feature flags not enforced on many routes | Segment guards (`FeatureGate` layouts) on events, redressal, resources, analytics, assistant, certificates, copilot, tracker, progress, opportunities and library pages. Service/API checks on grievances, faculty resources, copilot, lesson plans, timetable generation, event moderation and reports, AI actions and the leaderboard. AI tools check flags. The mobile "Cases" tab is flag-aware. |
| 12 | Medium | AI `get_at_risk_students` let staff with no faculty profile see the whole college; `get_schedule` did the same for users with no section | Scoped to own classes; college-wide only with the `view_all` permission |
| 13 | Medium | Missing rate limits | Added to search, password change, grievances and messages, notices, timetable generation, event check-in, certificates and save, resource creation, invite acceptance, and email verification |
| 14 | Medium | Registered students of online events **never saw the joining link** (a functional gap) | A "Join online" button for registrants |
| 15 | Medium | **Tablet (768px): every page overflowed by 73px.** The old crawl only tested 1440 and 390. | The college chip shows from 1280px and search can shrink. The crawler now also tests 768px. |
| 16 | Low | Event covers accepted any https image, so an external host could see every viewer's IP | Covers must be uploaded to CampusOS; old external covers are ignored |
| 17 | Low | Event and resource links accepted `javascript:` or `data:` URLs (React blocks them, but data was stored) | Only http(s) links are accepted |
| 18 | Low | Student organisers saw every attendee's email, including other colleges' students | Other colleges' emails are shown only to staff |
| 19 | Low | Check-in volunteers (`event:checkin`) were always refused | They can check people in at their own college's events |
| 20 | Low | `GET /api/progress` wrote to the database (XP awards) | Read-only; awards happen on the earning activity |
| 21 | Low | `levelOf` ran twice per dashboard render; library queue positions were N+1; dispatcher preference scan was quadratic | `React.cache`, a single window-function query, grouped preferences |
| 22 | Low | Missing indexes | Migration `0009_audit_indexes`: `resources(file_url)`, `event_certificates(event_id)`, `library_loans(institution_id, returned_at, due_at)`, `library_reservations(institution_id, status)`, `resource_saves(resource_id)` |
| 23 | Low | Raw route ids caused 500s on bad input; `/verify/%` caused a 500 | `idParam()` everywhere; safe decoding |
| 24 | Low | Dead links: notification `/announcements/:id` and `/changes/:id` (also sent in emails); search `/…/resources/:id` and `/admin/students/:id` | Role-aware redirect routes; search points at real pages |
| 25 | Low | LIKE wildcards not escaped in search | Escaped |
| 26 | Low | Library lock query took the row lock before the tenant check | Tenant check inside the lock |
| 27 | Low | New module pages had no loading state | `PageSkeleton` loading states for the library, opportunities, progress, tracker and assistant pages, student and admin |

## Remaining items and decisions

- **Decision needed: re-approving edited live events.** A non-moderator
  organiser can edit the title and description of an approved, live event
  without re-approval. Only widening it to all colleges re-queues it.
  - Safe current behaviour: every edit is audited (`EVENT_EDITED`), and
    time/venue changes are announced.
  - Options: re-queue on any content edit, or notify moderators.
- **Decision needed: account lockout.** After repeated failures, login returns
  423 `ACCOUNT_LOCKED`, which confirms the account exists and lets anyone lock
  a user out for a while. The alternative is a silent per-account throttle.
  The current behaviour is kept until a decision is made.
- **Malware scanning.** `MALWARE_SCANNER` defaults to `none`; files are served
  as `NOT_SCANNED`. Set it to `signature` in production, or add a ClamAV
  adapter behind the existing scanner interface.
- **Grievance SLA hours** use the server clock (UTC on Render). Deadlines are
  about 5.5 hours off for IST colleges. This is low severity; fixing it needs a
  timezone-aware working-hours function.
- **Grievance case numbers** use `count()+1`: a rare race, and collisions after
  deletes. Move to a sequence in a later migration.
- **Performance, low:** `issueCertificates` and `getEvent` run sequentially per
  attendee (fine at event scale); the dashboard makes about 20 queries.
- **HTTP status of flagged pages.** Turned-off pages render Next's not-found
  UI, but with status 200 while streaming under a `loading.tsx` boundary. The
  module content is never sent. APIs return real 404s.
- **One intermittent hydration warning** was seen once, on a first load after
  sign-in. It was not reproduced in 10 fresh loads or a full crawl. Watch the
  error reporter after launch.
- **No CSP `script-src` nonce yet.** The baseline CSP is in place; a
  nonce-based script policy is still to do.
