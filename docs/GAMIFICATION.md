# Tracker and gamification

Phase 8 adds a private **personal tracker** (goals, habits, steps, to-dos) and
**gamification** (XP, levels, badges, weekly challenges, opt-in leaderboards).
Both are built from real records only: nothing is seeded, and no number is
shown unless the student earned it.

| Flag | Default | Turns on |
|---|---|---|
| `personal_tracker_enabled` | off | `/student/tracker`, tracker APIs, "Your Day" tasks and habits, the Goals & Habits tool, quick-create "Create goal" and "Add task" |
| `gamification_enabled` | off | XP, levels (the sidebar level chip), badges, weekly challenges, `/student/progress` |
| `leaderboards_enabled` | off | The leaderboard on `/student/progress` |

Like every CampusOS 2.0 module, each college opts in (Admin → Settings). The
demo college has all three on.

## Personal tracker

| Kind | What counts |
|---|---|
| **Daily habit** | A day is met when its check-ins reach the per-day target (usually 1). |
| **Weekly habit** | A Monday–Sunday week is met when enough *different days* have a check-in (1–7). |
| **Goal with steps** | A checklist. It can be completed once every step is ticked. |
| **To-do** | A task with an optional due date, optionally linked to a goal. |

- **Dates** are the student's local calendar date in the college's timezone
  (`institutions.timezone`), computed on the server. A check-in at 00:30 counts
  for the right day, and streaks never break at UTC midnight.
- **Streaks** (`src/lib/tracker.ts#goalState`, pure and tested) are the run of
  met periods ending today. If today isn't met yet, the run ending yesterday
  is still "alive".
- **Check-ins** can be logged for today or yesterday, with an optional amount
  (minutes, pages …) and a note. Undo removes the last one.
- **Limits:** 30 active goals, 300 open tasks, 30 steps per goal; rate limits on
  creating goals (40/day), tasks (200/day) and check-ins (300/hour).
- **Privacy:** only the student can see this data. Every query is filtered by
  the session's user; an id in a URL only selects among the caller's own rows
  (other students and other colleges get 404). Staff have no screen that reads
  it, and it is deliberately **not** written to the audit log. Faculty and admin
  accounts get 403 from the tracker APIs.

## XP

XP is an **append-only ledger** (`xp_events`). A database trigger rejects
UPDATE; corrections are new negative `REVERSAL` rows. Every award has an
idempotency key that is unique per user, so retries, double scans and re-runs
never pay twice.

| Source | XP | Verified | Key | When |
|---|---|---|---|---|
| `EVENT_ATTENDED` | 40 | yes | `event:<eventId>` | An organiser checks you in |
| `CERTIFICATE_EARNED` | 25 | yes | `cert:<certificateId>` | A certificate is issued to you |
| `GOAL_CHECKIN` | 5 | no | `checkin:<goalId>:<date>` | First check-in of a goal on a day; at most 3 goals a day earn it |
| `STREAK_MILESTONE` | 20 / 60 / 150 | no | `streak:<goalId>:<length>:<runStart>` | A run reaches 7, 30 or 100 periods (again only after a break) |
| `GOAL_COMPLETED` | 30 | no | `goal:<goalId>` | Completing a goal with real progress (all steps ticked, or at least one check-in) |
| `CHALLENGE_COMPLETED` | 20–30 | no | `challenge:<code>:<weekStart>` | A weekly challenge is met |
| `REVERSAL` | negative | no | `reversal:…` | Undoing the only check-in of a day reverses its XP. Checking in again that day earns nothing, so undo/redo can't farm XP. |

**Verified XP** is activity CampusOS itself confirmed, and is the only XP that
can rank a student. Self-reported XP counts towards the student's own level.

- **Levels:** reaching level L needs `50 × L × (L − 1)` XP in total: 0, 100,
  300, 600, 1000, … (`src/lib/gamification.ts#levelFor`).
- **Badges** are defined in code (`ACHIEVEMENTS`) with a stat and a threshold.
  Locked badges show honest progress (for example "3 / 7"). Earning one sends a
  normal-priority notification.
- **Weekly challenges** are the same three every week: check in on 5 different
  days, finish 5 tasks, get checked in at an event. They are measured Monday to
  Sunday in the college's timezone, and the XP is added automatically.

Event check-ins and certificates call `onEventAttended` and
`onCertificateIssued`. If gamification fails there, it is logged and the
check-in still succeeds.

`npm run xp:backfill` awards verified XP for check-ins and certificates that
were recorded before gamification was switched on, dated when they happened.
It uses the same keys as the live path, so it's safe to re-run.

## Leaderboards

Leaderboards rank **verified XP only**, within the viewer's college or their
own section (both taken from the session), for this week, the last 30 days or
all time. Visibility follows the student's choice in Privacy & your data
(`services/privacy/rules#leaderboardIdentity`):

| Setting | Others see | You see |
|---|---|---|
| `PUBLIC` | Your name ("Ananya I.") | Your position |
| `ANONYMOUS` | A stable pseudonym ("Student 4F2A") | Your position |
| `PRIVATE` (the default) | Nothing: you aren't ranked for anyone else | Where you would place |
| `OPT_OUT` | Nothing | Nothing |

Ties share a rank (1, 2, 2, 4). No other student's user id leaves the server.

## Privacy and erasure

- **Data export** (`/account/privacy`) includes goals, steps, check-ins
  (amounts and notes), tasks, the full XP ledger and badges.
- **"Delete my tracker data"** (the `PERSONAL_TRACKER` scope) erases goals,
  steps, check-ins, tasks, self-reported XP and self-reported badges
  immediately. Verified XP and badges stay, because they belong to event
  records.
- **Account deletion** removes everything, verified XP included.

## API

| Method and path | Purpose |
|---|---|
| `GET /api/tracker` | Goals with streaks, rates and heatmaps; tasks; summary |
| `POST /api/tracker/goals` | Create a goal (with steps for a goal with steps) |
| `PATCH`, `DELETE /api/tracker/goals/:id` | Edit, pause, resume, archive, or delete with its history |
| `POST /api/tracker/goals/:id/complete` | Complete |
| `POST`, `DELETE /api/tracker/goals/:id/checkin` | Check in (`{ amount?, note?, day? }`) or undo (`?day=yesterday`) |
| `POST /api/tracker/goals/:id/steps` | Add a step |
| `PATCH`, `DELETE /api/tracker/steps/:id` | Tick or untick, or delete |
| `POST /api/tracker/tasks` | Add a task |
| `PATCH`, `DELETE /api/tracker/tasks/:id` | Edit, complete, reopen, or delete |
| `GET /api/progress` | Level, XP split, stats, badges, challenges, recent ledger |
| `GET /api/leaderboard?scope=college\|section&period=week\|month\|all` | Leaderboard |

## Screens

| Path | Screen |
|---|---|
| `/student/tracker` | Summary, habits with one-tap check-in, goals with steps, a 5-week heatmap, to-do list (`?add=task` focuses it) |
| `/student/tracker/goals/new` | Create a goal |
| `/student/tracker/[goalId]` | Streaks, 30-day rate, heatmap or steps; pause, archive, complete, delete |
| `/student/progress` | Level, verified versus tracker XP, challenges, stats, badges, leaderboard, recent XP |

The dashboard's **Your Day** lists due tasks and unchecked daily habits. **My
Progress** shows today's habit completion and the level with the XP to the
next one.

## Not built (by design or later)

- Study Planner (a separate tool) and AI coaching on goals (`ai_coach_enabled`) are later phases.
- Friends-only leaderboards: there is no friends graph yet.
