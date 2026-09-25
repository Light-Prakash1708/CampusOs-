# Communication Engine

The product claim is: **a notice reaches exactly the right people, and you can
prove who has seen it.** Everything here exists to make that literally true.

## Why this is not an announcements page

A message board post is broadcast and forgotten. An institutional notice is an
addressed record with an audience, an expiry, an acknowledgement requirement, an
approval gate and an audit trail. Conflating the two is why colleges fall back
to WhatsApp — and then cannot answer "did everyone see it?".

## Audience resolution

Targeting rules describe *who*, not *which user ids*:

```ts
[{ scope: 'SECTION', sectionId }]                       // one cohort
[{ scope: 'YEAR', year: 2 }]                            // a whole year
[{ scope: 'ROLE', role: 'FACULTY' }]                    // all faculty
[{ scope: 'PROGRAM', programId },
 { scope: 'SECTION', sectionId, isExclusion: true }]    // a programme except one section
```

`resolveAudience()` walks the academic hierarchy to produce concrete recipients.
Inclusions are unioned, then exclusions subtracted.

**`SECTION` includes the faculty who teach that section**, not just its students.
A room change affects the lecturer too. On the demo data, targeting `BCA-3A`
resolves to 45 students + 5 faculty = 50 recipients — asserted by test.

The composer shows this reach live, before sending, so nobody interrupts 1,400
people by accident.

## Freezing the audience

At publish time the resolved set is written to `announcement_recipients`, one
row per person.

This is deliberate. If the audience were recomputed on read, a student who
changed section next week would silently appear as a recipient of last week's
notice, and read-tracking would drift. Freezing means "who was addressed" is a
fact, and `WHERE announcement_id = ? AND acknowledged_at IS NULL` is both exact
and cheap.

## Acknowledgement

`requiresAcknowledgement` adds an explicit **"I've read this"** action.

- The recipient row records `read_at` and `acknowledged_at` separately — opening
  a notice is not the same as confirming it.
- Denormalised counters on the announcement are updated in the same transaction.
- The notice page lists **who has not acknowledged**, by name and section.

That list is the point. It replaces re-broadcasting to everyone with following
up with the eleven people who actually haven't responded.

## Priority and mandatory delivery

| Priority | Behaviour |
|---|---|
| `CRITICAL` | Immediate; marked mandatory; bypasses preferences and quiet hours |
| `IMPORTANT` | Dashboard + configured channels |
| `NORMAL` | Dashboard + notification centre |
| `INFORMATIONAL` | Notification centre only |

Users control channels and quiet hours per category. Administrators can mark a
notice mandatory, and mandatory notices cannot be silently suppressed by a
preference — a genuine emergency must not be defeated by a settings toggle.

## Official vs informational

`OFFICIAL` notices carry institutional authority and require
`announcement:create_official`. An author without it can still write one, but it
is saved `PENDING_APPROVAL` rather than published.

This distinction is what lets CampusOS replace WhatsApp as the source of truth:
"official" means something, and the badge is backed by a capability check rather
than convention.

## Emergency broadcast

Requires the separate `announcement:emergency_broadcast` capability, is recorded
in the audit log, and the composer states plainly how many people it will
interrupt regardless of their settings.

## Grouped notifications

Notifications carry a `group_key`, so fifteen related updates render as
*"5 Academic Updates"* rather than fifteen rows. Notification fatigue is how a
communication system stops working; grouping is a correctness feature, not
decoration.

## The change feed

Every mutation that affects someone's plans writes a `change_events` row through
`recordChange()`:

```
Financial Management — BBAF-3A
Tuesday 13:50 · Room LAB-B  →  Wednesday 11:00 · Room 303
Reason: Projector failure in the original room
Changed by Rajesh Nair · 50 people affected
```

It carries before/after payloads, the reason, who made and approved it, and the
affected sections and users. This single record powers the campus change feed,
the per-user "what changed" view, and the assistant's answer to *"why did this
change?"* — all from the same source, so they can never disagree.

Verified end to end: a valid timetable move produced the change event above,
created 51 notifications and one audit entry.

## Discussion, deliberately constrained

Notices can allow comments, and administrators can close the thread. The goal is
a question-and-answer trail attached to the notice, not another chat to monitor.
Official responses are flagged and pinned.


## External delivery (CampusOS 2.0)

In-app notification rows are unchanged. External channels are added by a
two-stage pipeline in `src/services/notifications/`, driven by the job runner:

1. **Plan** (`planPendingNotifications`) — every notification with
   `delivery_planned_at IS NULL` gets a decision per channel from the pure
   planner (`planner.ts`). Because it scans the table, every existing insert
   site (announcements, grievances, approvals) is covered without change.
   Notifications older than 24 h when first seen are closed without sending.
2. **Deliver** (`processDeliveryQueue`) — `QUEUED` rows are claimed with
   `FOR UPDATE SKIP LOCKED`, sent through the configured provider, and marked
   `SENT` / `FAILED` with exponential backoff (3 attempts). Dead push tokens are
   revoked.

| Priority | Channels | Quiet hours |
|---|---|---|
| CRITICAL | email, push, SMS, WhatsApp (opt-in) | ignored |
| IMPORTANT | email, push, WhatsApp (opt-in) | push deferred |
| NORMAL | push | deferred |
| INFORMATIONAL | in-app only | — |

A channel is used only if the institution enabled it (`email_enabled`,
`push_enabled`, `sms_enabled`, `whatsapp_enabled`), a provider is configured,
the recipient has the contact detail (verified email, phone, push token), the
student has not switched it off globally or for the category, and the per-hour
throttle (email 6, push 12, SMS 2, WhatsApp 3) is not exceeded. **Mandatory**
notices bypass the student's switches and throttles — only the institution's
switches and provider availability apply. Skips caused by the student's
choices, missing contact details or throttling are recorded with a reason in
`notification_deliveries`.

Providers (`providers.ts`): email `console | resend | none`; push
`none | console | fcm` (FCM HTTP v1 with service-account JWT); SMS
`none | console | msg91` (DLT template); WhatsApp `none | console`
(architecture only). Transactional mail (reset, verification, invitation) is
sent immediately and also recorded as a delivery.
