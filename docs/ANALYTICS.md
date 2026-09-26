# Product analytics

CAMPUSOS-003 (analytics) and CAMPUSOS-012 (campus demand).

Analytics are CampusOS's learning system. They answer three questions: which features people actually use, where students drop off, and whether colleges get value. They are built so that CampusOS *works for* students and does not *watch* them.

## Privacy rules

These are enforced in `src/services/product-events.ts` and covered by `tests/product-analytics.test.ts`.

| Rule | How |
|---|---|
| **No identity** | Events store `actor_hash`, a keyed HMAC of the user id, never the id, name, email or IP. The key is derived from `ANALYTICS_HASH_KEY`, or from `AUTH_SECRET` when that isn't set. |
| **No content** | Event names and property keys and values come from an allowlist (`EVENTS`). Anything else is dropped. There is no free text. |
| **No page-view tracking** | Presence is one row per person per day (`product_active_days`). |
| **No behavioural surveillance** | No keystrokes, no scroll or time-on-page, no sentiment. |
| **Retention** | Rows older than 400 days are purged by the `sweep` job. |
| **Who can see it** | Only platform operators (`PLATFORM_OPERATOR_EMAILS` plus an active `SUPER_ADMIN`) at `/admin/metrics`. Colleges never see product analytics. |

**Key rotation.** Changing `ANALYTICS_HASH_KEY` (or `AUTH_SECRET` when no explicit key is set) starts new actor hashes, which breaks retention continuity. Set `ANALYTICS_HASH_KEY` once in production and leave it alone.

## Events

| Event | Where it is recorded | Properties |
|---|---|---|
| `student_signup` | Personal sign-up succeeded | — |
| `college_join_requested` | Join request sent | `with_id` |
| `college_verified` | College approved the request | — |
| `invite_accepted` | Invitation accepted | `role` (STUDENT / FACULTY / ADMIN / OTHER) |
| `invite_link_copied` | Student copied the "share with classmates" link (browser) | — |
| `career_goal_set` | Student chose a career goal | — |
| `notice_viewed` | First read of a notice | — |
| `notice_acknowledged` | First acknowledgement | `on_time` |
| `attendance_viewed` | Student opened Attendance | — |
| `attendance_planner_used` | Planner opened from Tools | `surface` |
| `attention_signal_viewed` | (reserved for CAMPUSOS-013) | `kind` |
| `grievance_created` | Grievance filed | `anonymous` |
| `grievance_resolved` | Case marked resolved | `within_sla` |
| `grievance_escalated` | (reserved for CAMPUSOS-011) | `level` |
| `opportunity_opened` | "Apply on their site" clicked (browser) | — |
| `opportunity_saved` | Saved to the tracker | — |
| `tracker_goal_created` | Goal created | — |
| `ai_query` | Assistant answered | `provider` |
| `notice_created` | Notice created | `requires_ack`, `emergency` |
| `attendance_marked` | Faculty submitted a register | — |
| `evidence_pack_generated` | (reserved for CAMPUSOS-014) | `individual` |

**Browser events.** Only `opportunity_opened`, `attention_signal_viewed` and `invite_link_copied` are accepted from the browser, via `POST /api/product-events`. That route requires a session and is rate-limited. Every other event is recorded on the server, at the point where the action succeeds.

**Adding an event:**

1. Add it to `EVENTS` with its allowed properties.
2. Call `track()` where the action succeeds.
3. Add a row to the table above.

## Metric definitions (`/admin/metrics`)

| Metric | Definition |
|---|---|
| **Activation rate** | Sign-ups at least 7 days old in the window who did an activation event within 7 days: `notice_acknowledged`, `attendance_viewed`, `attendance_planner_used`, `opportunity_saved`, `tracker_goal_created`, `grievance_created` or `career_goal_set`. |
| **Median time to first action** | Median hours from sign-up to the first activation event, among activated sign-ups. |
| **DAU / WAU / MAU** | Distinct people with an active day today / in the last 7 days / in the last 30 days (Asia/Kolkata calendar). |
| **Weekly active students** | Distinct students active in the last 7 days ÷ all active student accounts. |
| **Active colleges** | COLLEGE tenants with anyone active in the last 7 days. |
| **Acknowledgement rate** | Acknowledgements received ÷ recipients, over notices that required acknowledgement and were published in the window. Taken from the `announcements` counters, so it matches what senders see. |
| **Retention (week 1 / week 4 / month 1)** | Among people first seen 60–150 days ago, the share active on days 7–13, 28–34 and 30–59 after their first day. |
| **Feature adoption** | Distinct people using a feature in the last 30 days ÷ monthly actives. |

**Use it to decide, not to decorate.**

- Keep, fix or remove features according to adoption and retention.
- Don't claim causation. "Colleges with high acknowledgement rates retain better" is a correlation to investigate with interviews.

## Campus demand (the referral loop)

1. A student in a personal workspace searches for their college on **Join your college**.
2. If it isn't listed, they can say which college they attend (name plus optional city).
3. Names are normalised: "St. Xavier's College, Kolkata" and "st xaviers college" count as the same college. Each student counts once; their latest answer wins.
4. Operators see a **warm campus** once `CAMPUS_DEMAND_THRESHOLD` students (default 25, minimum 5) have named the same college. No college with fewer than 5 is ever shown.
5. The student can copy a plain link to share with classmates. **CampusOS never messages anyone and never reads contacts.**
6. When the student is verified at a college, their interest row is deleted.

**Configuration:**

| Variable | Default | Purpose |
|---|---|---|
| `ANALYTICS_HASH_KEY` | derived from `AUTH_SECRET` | Key for actor hashes (≥ 32 characters) |
| `CAMPUS_DEMAND_THRESHOLD` | `25` | Students needed for a warm campus (≥ 5) |
