# Tools & Utilities

`/tools` is the hub for everyday student tools. It is linked from the student
sidebar ("Tools & Utilities") and styled on the Tools mockup. Other portals
are redirected to their own home, because every current tool is a student tool.

## Registry

`src/lib/tools.ts` is the single source of truth, shared by the page, the API
and the tests. Each tool has a key, a title, and a description of what it
does **today**. Optionally it also has:

- an `href` and a `cta` label;
- a `feature` flag;
- `permissions`;
- a `plannedPhase`.

`resolveTool(tool, viewer)` gives each tool one of these states:

| Status | When | Shown as |
|---|---|---|
| `AVAILABLE` | Built, enabled for the college, and permitted | Card with a working CTA |
| `PLANNED` | `plannedPhase` is set, or its flag is an unbuilt module | "Coming in Phase N", with no link |
| `DISABLED` | Built, but the college turned the module off | "Off at your college", with no link |
| hidden | The user lacks every listed permission | not rendered |

## Current tools

| Tool | Status | Goes to / arrives in |
|---|---|---|
| Attendance Tracker | available | `/student/attendance` |
| Timetable Viewer | available | `/student/schedule` |
| Events | available (`events_enabled`) | `/student/events` |
| Subject-wise View | available | `/student/attendance?view=subjects` |
| Notes & Resources | available (`resource_hub_enabled`) | `/student/resources` |
| AI Assistant | available (`ai_assistant_enabled`, `ai:use_assistant`) | `/student/assistant` |
| Certificates | available (`events_enabled`) | `/student/certificates` |
| Host an Event | available (`event:create`) | `/organize/new` |
| Attendance Planner (Bunk Calculator) | available (`attendance_planner_enabled`) | `/tools/attendance-planner` |
| Goals & Habits | available (`personal_tracker_enabled`) | `/student/tracker` (see `GAMIFICATION.md`) |
| Smart Reminders, Room Finder | planned | Phase 3 |
| Internships & Jobs | planned (`opportunity_hub_enabled`) | Phase 5 |
| PYQs, Document Storage | planned | Phase 6 |
| Study Planner | planned | Phase 7 |
| CGPA Calculator | planned | Phase 8 |

## Live highlights (real data)

Each featured card carries a highlight computed from the signed-in student's records.

| Card | What it shows | Source |
|---|---|---|
| Attendance | Overall ring; *attended of held*; the number of subjects below their minimum | `attendance_summaries` |
| Timetable | The next class (subject, day, time, room), with holidays and schedule exceptions applied | The published timetable |
| Events | Upcoming events the student can see, and how many they're registered for | Events 2.0, `listEvents` |
| **Attendance banner** ("Know exactly how many classes you can skip") | Current % and the stored **absence headroom**: summed across subjects, the number of future absences that keep each subject at or above its own minimum (`floor(attended × 100 / min%) − held`) | `attendance_summaries` |

If there's no data, the card says so ("No classes marked yet", "No classes in
the next week").

When some subjects are already below their minimum, the banner says the
headroom applies only to subjects still above it. It also shows how many
subjects need recovery first. The banner's primary action opens the Attendance Planner.

## Personal ordering

- `tool_usage` stores one counter per (student, tool). `ToolOpenLink` posts to `POST /api/tools/usage` on click; it never counts prefetch or render.
- `orderTools()` sorts tools in this order:
  1. Available tools, by open count (most used first), with ties falling back to registry order.
  2. Planned tools, by phase.
  3. College-disabled tools.
- "Your most used" shows available tools opened at least twice, up to four.
- Planned tools can't be counted (409), so they can't be ranked up.

**Privacy.** The counter is visible only to its owner. It appears in the
privacy data catalogue ("Tool usage"), is included in the data export
(`tools.usage`), and is deleted with the account.

## API

| Method and path | Purpose |
|---|---|
| `GET /api/tools` | The resolved and ordered tools for the signed-in user |
| `POST /api/tools/usage` `{ tool }` | Count one open. The key must be in the registry and AVAILABLE to the user; rate limit 300 per hour. |

Both routes require a session. The user and college always come from the
session, never from the request body.

## Adding or shipping a tool

1. Add or edit its entry in `TOOLS`.
2. When it ships, set its `href` and `cta` and remove `plannedPhase`. If it has a flag, delete that flag's line from `UNBUILT_MODULES` in the same commit that adds the page.
3. `tests/phase1-tools.test.ts` checks the result:
   - every non-planned tool has a page on disk;
   - no planned tool carries a link.
