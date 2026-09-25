# Events

Discovery, registration, passes, check-in, certificates and moderation.
The feature is gated by the `events_enabled` flag. Seeing other colleges'
public events also needs `event_discovery_enabled` on the **viewer's** college.

## Model

| Table | Purpose |
|---|---|
| `events` | The event. Its `institution_id` is always the organising college. |
| `event_registrations` | One row per person per event. `status` ∈ `REGISTERED`, `WAITLISTED`, `PENDING_APPROVAL`, `REJECTED`, `CANCELLED`. `attendee_institution_id` records the attendee's own college for cross-college events. `code` is the 6-character pass code. |
| `event_saves` | Bookmarks. A saved event counts as "followed", so its updates reach you. |
| `event_checkins` | At most one per registration (unique index), so check-in is idempotent. |
| `event_certificates` | Issued only to checked-in attendees. Each has a public `verification_code` (`XXXXX-XXXXX`); unique per registration and kind. |
| `event_updates` | Organiser announcements. These fan out as notifications. |
| `event_reports` | One report per event per reporter, with a moderation outcome. |

Enum-like text columns carry `CHECK` constraints (migration 0003).

## Visibility

| `visibility` | Who can see and register |
|---|---|
| `INSTITUTION` | Only members of the organising college. Anyone else gets a 404, never a 403, so an event's existence is not leaked. |
| `PUBLIC` | Everyone at the organising college, plus students of any college whose `event_discovery_enabled` flag is on. |

Only `SCHEDULED` events are listed. Drafts, events awaiting approval,
rejected events and suspended events are visible only to their organiser
and to moderators.

## Registration

`decideRegistration()` (pure) returns one of:

- `REGISTERED`
- `WAITLISTED` (the event is full and the waitlist is on)
- `PENDING_APPROVAL` (the `APPROVAL` registration mode)
- a refusal: `FULL`, `CLOSED`, `ENDED`, `NOT_OPEN` or `INVITE_ONLY`

**Race safety.** The service locks the event row before counting. The
database trigger `campusos_event_registration_guard` repeats the capacity and
deadline check on every insert or promotion. If two requests race, the loser
gets `23514` and is placed on the waitlist; it never over-fills the event.
A test fires 12 simultaneous registrations at a 5-seat event: exactly 5 are
registered and 7 waitlisted.

**Cancellation.** Cancelling promotes the earliest waitlisted person in the
same transaction and sends them an `IMPORTANT` notification. Registering
twice is a no-op that returns the existing pass code.

## Passes and check-in

- `GET /api/events/:id/pass` returns a short-lived token and a QR SVG. The token is `base64url(registrationId.expiry).HMAC`, keyed from `AUTH_SECRET` and valid for 10 minutes. The pass page refreshes it every 4 minutes, so a screenshot stops working.
- `POST /api/events/:id/checkin` takes `{ token }` (QR) or `{ code }` (typed). It returns one of `CHECKED_IN`, `ALREADY_CHECKED_IN`, `WRONG_EVENT`, `NOT_REGISTERED`, `EXPIRED` or `INVALID`. On Android Chrome the organiser console can scan with the camera (BarcodeDetector); other browsers use the code field.
- Who may check people in: the organiser, holders of `event:checkin`, and moderators (`event:approve`). All of them must be at the organising college.

## Certificates

`POST /api/events/:id/certificates` issues certificates to checked-in
attendees who don't have one yet, so it is safe to run twice. Students find
them under **Certificates** and can print or save them as PDF.
`/verify/:code` is public. It shows the event, the organiser, the college,
the dates, and the recipient as first name plus last initial. It never shows
an email, a roll number or other private details.

## Creating and moderating

| Who | Can create? | Goes live |
|---|---|---|
| Admin or holder of `event:approve` | yes | immediately, verified as `VERIFIED_COLLEGE` |
| `CLUB_ADMIN` | yes | after approval, as `VERIFIED_CLUB` |
| Student, `EVENT_ORGANIZER`, `CAMPUS_REP` | yes | after approval, as `COMMUNITY` |

Creation limits:

- Rate limit: 10 events per person per day.
- An event with the same normalised title starting within a day of an existing one at the same college is rejected as a duplicate (409).

Moderators use **Admin → Events**:

- For pending events: approve, reject, or request changes, with an optional note.
- For reports: dismiss, or suspend the event.

Every moderation action is written to the audit log (`EVENT_APPROVED`,
`EVENT_REJECTED`, `EVENT_SUSPENDED`, and so on).

## Editing and cancelling

`PATCH /api/events/:id` (same body as create) edits an event. Only the organiser,
or a holder of `event:approve` at the host college, can edit. Guard rails:

- Cancelled or ended events can't be edited (409).
- Capacity can't go below the number already registered (409). The check runs
  inside a transaction that locks the event row, so it can't race a sign-up.
- Raising capacity (or removing the limit) moves people off the waitlist in
  sign-up order, and each one is notified that a place opened up.
- A non-moderator editing a returned (`DRAFT`) event resubmits it for approval.
  Opening a live college-only event to all colleges sends it back to
  `PENDING_APPROVAL` with verification `PENDING`, so other colleges never see
  an unverified cross-college event.
- A changed time or venue on a live event is announced automatically to
  registrants and followers as an **important** update (`TIME_CHANGED` or
  `VENUE_CHANGED`), and appears in the event's updates list. Edits that change
  neither are silent.
- Audit: `EVENT_EDITED`, with before and after values.

`POST /api/events/:id/cancel` with `{ reason }` (5+ characters) cancels. A live
event notifies everyone registered or following, with the reason, and records a
`CANCELLED` update. Audit: `EVENT_CANCELLED`. A cancelled event cannot be
edited or re-opened.

In the UI: **Edit** and **Cancel event** sit on `/organize/[id]`; cancelling
asks for a reason and a second confirmation.

## Calendar export

`GET /api/events/:id/ics` returns an RFC 5545 calendar file for any event the
caller can see (the same visibility check as the event page). Times are in UTC;
text is escaped and long lines folded. The online joining link is included only
for registered attendees. `SEQUENCE` follows the last edit, so re-importing
after a change replaces the old entry. Built with no dependency (`src/lib/ics.ts`).

## Updates

`POST /api/events/:id/updates` accepts `kind`, `title`, `body` and `audience`.

- `audience` is `FOLLOWERS` (registered plus saved) or `REGISTERED`.
- Priority follows `kind`: `EMERGENCY` → critical; `VENUE_CHANGED` and `TIME_CHANGED` → important; everything else → normal.
- Delivery follows each recipient's own notification preferences.
- Limit: 12 updates per event per day.

## API summary

| Method and path | Purpose |
|---|---|
| `GET /api/events` | List, with filters: `tab`, `q`, `city`, `area`, `college`, `when`, `mode`, `free`, `certificate`, `mine`, `radiusKm`, `sort` |
| `POST /api/events` | Create (validated with zod) |
| `GET`, `PATCH /api/events/:id` | Read (visibility rules) or edit (organiser/moderator) |
| `POST /api/events/:id/cancel` | Cancel with a reason |
| `GET /api/events/:id/ics` | Calendar file |
| `POST`, `DELETE /api/events/:id/register` | Register or cancel |
| `POST`, `DELETE /api/events/:id/save` | Save or unsave |
| `POST /api/events/:id/report` | Report an event (20 per day) |
| `GET /api/events/:id/pass` | QR pass |
| `POST /api/events/:id/checkin` | Check someone in |
| `POST /api/events/:id/attendees/:registrationId` | Approve or decline an attendee (`APPROVAL` mode) |
| `POST /api/events/:id/certificates` | Issue certificates |
| `POST /api/events/:id/updates` | Post an update |
| `POST /api/events/:id/moderate` | `APPROVE`, `REJECT`, `REQUEST_CHANGES` or `SUSPEND` |
| `POST /api/events/reports/:id` | Resolve a report |

## Screens

| Path | Screen |
|---|---|
| `/student/events` | Discovery: tabs, search, filters (city, area and host college built from events you can see), sort, "My events" |
| `/student/events/[id]` | Event detail |
| `/student/events/[id]/pass` | QR pass |
| `/student/certificates` | Certificate wallet |
| `/student/certificates/[id]` | Certificate, printable |
| `/organize` | Organiser console: your events |
| `/organize/new` | Create an event |
| `/organize/[id]` | Manage an event: stats, attendees, check-in, updates, certificates, edit, cancel |
| `/organize/[id]/edit` | Edit an event |
| `/events`, `/events/[id]` | Stable share links: students go to discovery or the event page; organisers and moderators to their console |
| `/admin/events` | Admin: at-a-glance numbers, moderation queue, reports, all events |
| `/verify/[code]` | Public certificate check |

## Demo data

`scripts/seed-events.ts` creates three fictional partner colleges in and
around Kolkata and 12 events. Every one of them has
`source_name = 'CampusOS demo data'` and shows a **Demo event** badge.
None of these events is real.

## Known limits

- Paid events show a price, but there is no checkout yet; billing arrives in a later phase.
- Team registration records a team name only. Team member invites come with the Clubs phase.
- `attendanceHooks()` is the integration point for XP and streaks. It is a no-op until gamification ships.
