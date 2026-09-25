# Attendance

Faculty mark registers; students see their own attendance, risk, trend,
history and advice. Official records can only be changed by the college,
through a correction with approval.

## Model (unchanged, extended — no new attendance tables)

| Table | Role |
|---|---|
| `attendance_sessions` | One class meeting. Only `SUBMITTED`/`LOCKED` registers count. |
| `attendance_records` | One per student per session; corrections keep `original_status`. |
| `attendance_summaries` | Cache per student per class (held, attended, %, below-minimum, headroom), recomputed on every submission/correction. |
| `course_offerings.min_attendance_percentage` | Minimum per class (authoritative). |
| `institutions.attendance_policy` (0005) | College rules: default minimum, warning margin, optional overall minimum. |

## Counting rules (one definition, `services/attendance`)

| Status | Held | Attended |
|---|---|---|
| PRESENT, LATE | ✓ | ✓ |
| ABSENT, MEDICAL | ✓ | — |
| EXCUSED | — | — (removed from the denominator) |

Cancelled classes are never held. A draft register never moves a number.

## Student screens

| Path | What |
|---|---|
| `/student/attendance` | Attendance Tracker: overall ring with the minimum tick, total/attended/missed (+excused), status strip, 8-week trend, advisor ("What should I do?"), subject-wise breakdown (table on desktop, cards on phones; Overall/Subject-wise tabs on phones), CSV export, how it's calculated, dispute links. |
| `/student/attendance/[offeringId]` | Subject: ring, held/attended/missed/excused, buffer or classes-to-recover, remaining scheduled classes and best possible %, 10-week trend, advice, full history (with corrections), plan/dispute actions. 404 if not enrolled. |
| `/tools/attendance-planner` | Attendance Planner — see `BUNK_CALCULATOR.md`. |

## Risk states (`riskState`)

| State | Meaning |
|---|---|
| `NO_DATA` | Nothing marked yet |
| `SAFE` | Above the minimum by more than the warning margin |
| `WATCH` | Above the minimum, within the margin (policy `warningMarginPct`, default 5 points) |
| `AT_RISK` | At/above the minimum, but the next absence drops below |
| `BELOW` | Below the minimum; recoverable |
| `CRITICAL` | Below, and can't reach the minimum even attending every remaining scheduled class this term |

`CRITICAL` needs a known schedule; with no published timetable (or a subject
not on it) the remaining count is unknown and the state stays `BELOW` — it is
never guessed. Every state is shown with an icon and a label, not colour alone.

## Remaining classes

From the published timetable for the student's section: today's classes not
yet started, then each day to the term's teaching end (or end) date, skipping
holidays and cancellations and adding extra classes. Labelled an estimate.

## Advisor

`advise()` ranks: CRITICAL (lowest % first) → BELOW (most classes needed
first) → overall rule → AT_RISK → WATCH (smallest buffer first). It never
suggests skipping; headroom is described as a buffer for illness and
emergencies. CRITICAL items link to Redressal so the student can raise it
with the college.

## College rules (Admin → Settings → Attendance rules)

Needs `attendance:configure` (admins, super admins). Fields: default
minimum, warning margin, optional overall minimum. "Also apply the default
minimum to every class this term" updates all current-term classes and
recomputes every affected summary in one transaction; audited as
`ATTENDANCE_POLICY_UPDATED`. The planner can be switched off with the
`attendance_planner_enabled` flag.

## API (students: own data only, `attendance:view_own`)

| Method & path | Purpose |
|---|---|
| `GET /api/attendance` | Overview: subjects, overall, trend, advice, policy |
| `GET /api/attendance/subjects/:offeringId` | One subject with history (404 if not enrolled) |
| `POST /api/attendance/simulate` | Planner maths on my own numbers (`targetPct`, `miss`, `attend`, optional `offeringId`) |
| `GET /api/attendance/export` | My history as CSV (formula-injection safe) |
| `GET/PUT /api/admin/settings/attendance` | College rules (`attendance:configure`) |

The student profile always comes from the session; no endpoint accepts a
student id.

## Fixed in this phase

`recomputeAttendanceSummaries` interpolated a JS array as `${ids}::uuid[]`,
which Drizzle renders as a row `($1, $2)` — Postgres rejects the cast, so
**every faculty register submission and correction failed** (the demo only
looked right because the seed writes summaries directly). Fixed with
`uuidArray()` (`src/lib/db/sql-helpers.ts`); the same bug on the faculty class
page's submissions query is fixed too. Regression tests cover both paths.
