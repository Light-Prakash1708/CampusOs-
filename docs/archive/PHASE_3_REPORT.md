# CampusOS 2.0 — Phase 3 Report (Events)

Numbering follows the 2.0 spec. Phase 2 (the UI system foundation) is covered
in `UI_REDESIGN_AUDIT.md`. Full reference: `docs/EVENTS.md`.

## Completed

| Area | Delivered |
|---|---|
| Discovery | Tabs (For you, This weekend, Near me, Free, Certificates, Online, Hackathons, …), search, filters, sort by relevance or date, distance from your college, cross-college public events behind `event_discovery_enabled` |
| Detail | Cover, facts, organiser updates, agenda, rules, prizes, eligibility, FAQs, verification badge, report flow, sticky mobile action bar |
| Registration | Instant, approval and invite-only modes; capacity; deadline; waitlist with automatic promotion; idempotent; race-safe through a DB trigger |
| Save / follow | Bookmarks. Saved events receive organiser updates. |
| QR pass | HMAC-signed pass that expires after 10 minutes and refreshes itself; typed code fallback |
| Check-in | Organiser console with code entry and camera scan; idempotent; refuses other events' passes and forged passes |
| Certificates | Issued to checked-in attendees only; wallet; printable view; public `/verify/[code]` that exposes first name and initial only |
| Organiser console | `/organize`: create an event, manage attendees, approve or decline attendees, send updates, issue certificates |
| Moderation | Admin → Events: at-a-glance numbers, approval queue (approve, reject, request changes), reports (dismiss, suspend); every action audited |
| Anti-spam | Per-user rate limits (create, register, report, updates); duplicate detection; one report per person per event |
| Demo data | 3 fictional West Bengal partner colleges and 12 events, all labelled **Demo event** |

## Changed files

- **Schema**
  - `src/lib/db/schema/communication.ts` (events and registrations extended)
  - `src/lib/db/schema/events.ts` (new)
- **Migration:** `drizzle/migrations/0003_events_discovery.sql`
- **Services:** `src/services/events/{rules,index,organizer}.ts`
- **API**
  - `src/app/api/events/**` (11 route files)
- **Pages**
  - `src/app/student/events/**`
  - `src/app/student/certificates/**`
  - `src/app/organize/**`
  - `src/app/admin/events/**`
  - `src/app/verify/[code]/page.tsx`
- **UI and navigation**
  - `src/components/campus/events.tsx`
  - `src/components/campus/EventActions.tsx`
  - `src/components/layout/navigation.ts`
- **App shell and middleware**
  - `src/app/icon.svg` (app icon; previously a 404 on every page)
  - `src/middleware.ts` (icon made public)
- **Seed:** `scripts/seed-events.ts`, `scripts/seed.ts`
- **Tests:** `tests/events.test.ts`
- **Docs:** `docs/EVENTS.md`, `docs/DATABASE.md`

## Database changes

Migration `0003_events_discovery` is additive only. No columns are dropped,
and v1 rows are backfilled: existing registrations become `REGISTERED`, and
existing events get defaults. It adds:

- 5 tables
- about 30 columns
- check constraints
- the capacity and deadline trigger
- `updated_at` touch triggers

## New APIs

The API table is in `docs/EVENTS.md`. There are 11 route files and
13 handlers. Every route:

- requires a session and the `events_enabled` flag;
- is scoped to the tenant;
- validates its input with zod.

## Tests

`tests/events.test.ts` has 18 tests.

**Unit tests** cover:

- the registration decision table;
- pass token round-trip, expiry and forgery;
- code formats;
- distances around Kolkata;
- date windows;
- update priority.

**Integration tests** cover:

- **Visibility:** an event restricted to one college never leaks to another; public events appear only when discovery is on; moderation gates student events; duplicates are refused.
- **Registration:** 12 concurrent registrations for 5 seats give exactly 5 registered; the database itself refuses over-capacity and past-deadline inserts; waitlist promotion sends a notification; cross-college registration records both colleges; registered counts are correct.
- **Check-in:** idempotent; forged, other-event and foreign-organiser passes are refused.
- **Certificates:** issued to attendees only, with no duplicates; the verification page stays private.
- **Updates:** fan-out and priority are correct.

Full suite: 7 files, 130 tests passing. Typecheck: clean. Lint: 0 errors.
Production build: passes.

## Bug found during visual QA

The registered and checked-in counts in the admin table read 0 for an
event with 37 registrations. Drizzle renders `${t.events.id}` inside a raw
`sql` subquery as a bare `"id"`, which bound to the inner table. I fixed it in
three places and added a regression test, which fails against the old code.

## Remaining work

- Checkout for paid events, which depends on billing.
- Team member invites, which come with Clubs.
- XP for attendance through `attendanceHooks()`, which comes with gamification.
- Map view.
- Calendar (.ics) export.
- Push delivery of updates depends on PWA device registration. Updates are stored and emailed now.

## Potential regressions

- `/admin/events` changed from v1's simple list to the moderation dashboard, and now requires `event:approve` or `event:create` (v1 checked nothing). Room-booking conflict checks are unchanged.
- v1 events that had no `category` are shown as "Event".
