# CampusOS Product Audit — "Student Operating System" brief

- **Date:** 25 Sep 2026
- **Audited state:** `main` at `ca89ffd` (Phase 3: Events 2.0)
- **Brief:** the 58-section "fully functional student operating system" brief, with its Tools & Utilities mockup as the visual reference.
- **Method:** I read the repository (routes, schema, services, APIs, permissions, flags, tests) and ran the checks below. Nothing has been changed for this audit.

## 0. Verification run (clean tree)

| Check | Result |
|---|---|
| `npm run typecheck` | passes (0 errors) |
| `npm test` | 7 files, 130 tests, all passing (needs local Postgres running) |
| `npm run build` | passes (one benign `jose` Edge-runtime warning) |
| `npm run lint` | 0 errors, 87 warnings |
| `npm audit` | 0 vulnerabilities |

**Paused work.** Before this brief arrived, the earlier roadmap's Phase 4
(tracker and gamification) had been started. Only the schema had been
written: 6 tables plus a generated migration 0004, never committed. That work
is stashed (`git stash list` → "wip: phase 4 tracker/gamification schema"),
not deleted. It maps onto Phase 7 of this brief and can be restored then.

---

## 1. Current architecture

```
Browser ──> Next.js 15 App Router (React 19, Tailwind v4)
             ├─ Server Components: pages read data server-side (auth via AuthContext)
             ├─ Client components only for interactivity (forms, toggles, QR, scanner)
             ├─ Route Handlers /api/**: withAuth / publicRoute → zod → service → ok()
             └─ middleware.ts: session gate, CSRF Origin check, public-path list
Services (src/services/**) ── business logic, authorization, audit, rate limits
Drizzle ORM 0.45 ── PostgreSQL 16, versioned migrations 0000–0003 (+ v1 baselining)
Cross-cutting:
  auth      DB-authoritative sessions (JWT cookie + sessions table, epoch revocation)
  RBAC      capability permissions with implication closure (src/lib/auth/permissions.ts)
  tenancy   every row carries institution_id; derived from AuthContext, never from input
  flags     tenant-aware feature flags (src/lib/features.ts), enforced in UI and API
  audit     append-only audit_logs (DB trigger)
  limits    Postgres fixed-window rate limiter
  storage   local / S3 / Supabase adapters, signed URLs, magic-byte validation
  notify    priority planner → delivery queue → Resend / FCM / MSG91 / console
  AI        provider abstraction: Anthropic, or a deterministic offline provider (no key needed),
            13 read-only tools + approval-gated actions
  jobs      /api/jobs/run (cron-secret) → plan/deliver notifications, escalations, sweeps
Deploy: render.yaml (web + cron + Postgres), Dockerfile, GitHub Actions CI
```

The architecture already matches the brief's §29 and §36. Pages call
services, routes validate and authorize, and the AI calls authorized tools,
with mutations going through approval. **No re-platforming is needed.**

## 2–5. Feature inventory against the brief

**Status legend:**

- ✅ **Implemented:** UI, API, service, database, authorization and tests.
- 🟡 **Partial:** some layers exist; the gaps are listed.
- 🔴 **Missing.**
- ⚠️ **Mock or placeholder** exists that must not stay.

| # | Brief feature | Status | What exists | What's missing |
|---|---|---|---|---|
| 7 | **Tools & Utilities hub** `/tools` | 🔴 | — | Page, nav item, per-tool status, usage-based ordering |
| 8 | **Attendance Tracker** | 🟡 | Sessions and records marked by faculty; `attendance_summaries` (held, attended, % in basis points, below-threshold flag, absence headroom) recomputed on submit; per-offering `min_attendance_percentage`; student `/student/attendance` with per-subject rows and "attend next N" recovery (`sessionsToRecover`, tested); faculty corrections with approval; AI `get_attendance` tool | Overall ring and stat hero; trend chart (weekly series); per-subject **detail page** with history; semester scoping (by `term`); export report (PDF/CSV) |
| 9 | Attendance input: A. faculty | ✅ | `/faculty/attendance`, `POST /api/faculty/attendance`, lock and correct flow | — |
| 9 | B. student self-mark (if permitted) | 🔴 | — | Institution rule, pending→approved records, which never overwrite official ones |
| 9 | C. QR attendance | 🔴 | HMAC pass infrastructure exists for events and is reusable | Session QR, rotating token, geofence-free by design |
| 9 | D. import | 🟡 | Importer handles students, faculty, subjects, rooms and sections | An attendance importer |
| 9 | Permissions `attendance:read/record/approve/override` | 🟡 | `attendance:view_own/view_section/view_all/mark/correct/approve_correction` | **Recommendation:** map the brief's names to the existing capabilities instead of adding duplicates (read→view_*, record→mark, approve→approve_correction, override→correct). Add only `attendance:self_mark` |
| 10 | **Bunk Calculator / Attendance Planner** | 🟡 | Recovery maths (`sessionsToRecover`) and stored headroom | Pure calculator module (safe absences, projections after N absences or attendances, impossible targets, 0 and 100% edge cases); target slider; simulation table; `/tools/bunk-calculator`; `/api/attendance/simulate` |
| 11 | Smart attendance advisor | 🟡 | "Attend the next N classes" text on the dashboard and attendance page | "What should I do?" card per subject; AI "Why is it falling?" that reads real records (the tool exists; it needs trend data) |
| 12 | **Timetable Viewer** | 🟡 | Mature timetable engine (solver, conflicts, versions, publish, schedule exceptions); `/student/schedule` (week and day); change feed; the dashboard timeline shows ongoing and next | Month view; per-slot status (ongoing, upcoming, completed, cancelled, rescheduled) as a single computed field; a "Next class" card; redesign to the mockup |
| 13 | **Room Finder** | 🟡 | `rooms` table (code, name, type, capacity, **building, floor**, facilities, bookable, unavailable window); admin `/admin/rooms`; AI `get_room_availability`; search returns rooms | Student `/tools/rooms` with search, current status (free, in use, next class) derived from the published timetable, room detail. No map data exists, so show structured location only (as the brief requires) |
| 14–15 | **Internships & Jobs** | 🔴 | Flag `opportunity_hub_enabled`; nav item (flag off, so the page would 404) | Everything: tables, verification workflow, source and expiry, saves and applications, `/opportunities` UI, "why this matches me" from skills |
| 16–17 | **Events** | ✅ | Phase 3: discovery (search, filters, tabs, distance), detail, registration with a race-safe DB capacity trigger, waitlist, QR pass, check-in, certificates, public verification, organiser console, moderation, reports, rate limits, 18 tests | `/events` alias (today it's `/student/events`); eligibility and college filters; "Career fair" category; calendar (.ics) export |
| 18 | **Campus Channels** | 🔴 | `announcements` with targets, priorities, acknowledgements; `event_updates`; flag `campus_channels_enabled` | `channels`, follows, channel posts (structured kinds: announcement, venue change, schedule change, reminder, results, certificates). Built on the announcement and notification pipeline, not a chat |
| 19 | **Smart notifications** | 🟡 | Priority planner (CRITICAL, IMPORTANT, NORMAL, LOW) with preferences, quiet hours, throttling and mandatory override; delivery queue; email, SMS and push providers; in-app inbox | Map the brief's OPTIONAL tier to LOW; per-category mute and snooze; push device registration UI (PWA) |
| 20 | **Document Storage** | 🟡 | `stored_files` + storage service (adapters, validation, scanner hook, authorised reads, 5-minute signed URLs, `/api/files`) | A "My Documents" layer: folders, categories, tags, rename, soft delete, search, expiring share links, quota. Reuse `stored_files` for the bytes; don't duplicate it |
| 21 | **Notes & PYQs** | 🟡 | `resources` (kinds include NOTES and QUESTION_BANK; subject, semester, topic, department, status DRAFT→PUBLISHED, visibility, view and download counts), `resource_tags`; faculty upload; `/student/resources`; AI `search_resources`; search | PYQ kind (add a `PYQ` enum value and an exam year); student contributions going through moderation; save and report; filters by semester and subject; the redesign. `/student/library` currently redirects here ⚠️ |
| 22 | **Study Planner** | 🔴 | Inputs exist: timetable, assessments with dates, assignments with due dates, subjects | Deterministic scheduler (pure, tested), plan and session tables, complete, skip and reschedule, AI "optimise" as an enhancement |
| 23 | **CGPA Calculator** | 🔴 | `subjects.credits`; `enrollments.final_grade`; `assessment_results.grade` | Configurable grading scale per institution; semester records (official where available, otherwise student-entered what-if); SGPA and CGPA maths; target projection |
| 24 | **Smart Reminders** | 🟡 | Notification pipeline and job runner | Reminder **generators**: class starts in N minutes, assignment due tomorrow, attendance nearing threshold, event registration closing. Each is idempotent per (user, source, occasion). Snooze and mute |
| 25 | **Personal tracker** | 🔴 ⚠️ | Flag, nav item, quick-create entries and a dashboard row all exist but point to routes that don't exist (hidden because the flag defaults off) | Goals, habits, tasks, focus sessions (the paused stash covers most of the schema) |
| 26–27 | **Gamification and leaderboards** | 🔴 ⚠️ | Privacy rules are ready and tested (`leaderboardIdentity`, anonymous handles, NEVER_PUBLIC); the event `attendanceHooks` extension point; the dashboard shows an "Earn XP" CTA linking to the missing tracker (hidden while the flag is off) | XP ledger (idempotent, append-only), levels, streaks, badges, challenges, leaderboards |
| 28 | **Career Mode** | 🟡 | Skills engine: skills, subject↔skill mapping, evidence, career roles and required skills, career goals, gap plans, certifications; `/student/skills`; AI `get_skill_profile` | A Career Mode hub combining explore, build, opportunities, portfolio and progress; links to events and opportunities |
| 29 | **AI across modules** | 🟡 | Assistant with 13 read-only tools, permission-checked; approval-gated actions; offline provider works with no API key | Tools for events, opportunities, bunk simulation, CGPA, study plan, rooms, documents; contextual "Ask AI" entry points |
| 30 | **Global search** | 🟡 | `/api/search` filtered at query level: classes, people, notices, resources, rooms, cases | Events, opportunities, channels, documents (own only) |
| 31, 46 | **Home "Your Day"** | 🟡 | Dashboard: greeting, today's schedule, progress (real), quick actions, upcoming events, notices, attention strip | A merged "Your Day" feed (classes, tasks, events, deadlines, attendance, goals). The events card still uses the v1 query ⚠️ (see §8) |
| 32 | Tools personalisation | 🔴 | — | Usage counters per tool per user (privacy: own data only) |
| 34 | PWA / offline | 🔴 | `manifest.webmanifest` exists | Service worker, read-only caches; no offline writes until sync and conflict handling exist |
| 38 | **Privacy Center** | ✅/🟡 | `/account/privacy`: preferences (leaderboard, profile, streaks, achievements, event participation, recommendations, AI memory, AI coach scopes), consent ledger, data catalogue, export, deletion | Goal and habit visibility settings (the privacy rules already classify private goals as never public); certificate visibility |
| 39–40 | **Admin control and flags** | 🟡 | 30+ tenant-aware flags with super-admin toggles; registration policy editor | Attendance rules (self-mark, QR, default target), grading scale, enabled tools, opportunity moderation. The brief's flag names mostly exist under other names (see §10) |
| 41 | **Analytics** | 🟡 | `/admin/analytics` and reports for attendance, workload and grievances; the events dashboard | Student analytics page; event, communication and resource engagement for institutions |

## 6. Existing tables relevant to the tools

| Tool | Tables already present (reuse) |
|---|---|
| Attendance, Bunk Calculator, Subject view | `attendance_sessions`, `attendance_records`, `attendance_summaries`, `course_offerings.min_attendance_percentage`, `enrollments`, `terms` |
| Timetable, Room Finder | `timetable_versions`, `timetable_entries`, `time_slots`, `schedule_exceptions`, `rooms` (with `building`, `floor`), `campuses`, `holidays` |
| Events | `events`, `event_registrations`, `event_saves`, `event_checkins`, `event_certificates`, `event_updates`, `event_reports` |
| Notes & PYQs | `resources`, `resource_tags`, `resource_shares` |
| Documents | `stored_files` (bytes, owner, purpose, scan status) |
| CGPA | `subjects.credits`, `enrollments.final_grade`, `assessment_results.grade`, `terms` |
| Reminders and notifications | `notifications`, `notification_preferences`, `notification_settings`, `notification_deliveries`, `push_subscriptions`, `job_queue` |
| Career | `skills`, `subject_skills`, `student_skills`, `skill_evidence`, `career_roles`, `career_role_skills`, `career_goals`, `skill_gap_plans`, `student_certifications` |
| Privacy | `privacy_preferences`, `consent_records`, `data_*_requests`, `data_retention_policies` |
| AI | `ai_conversations`, `ai_messages`, `ai_actions`, `ai_generations`, `ai_preferences` |

## 7. Existing APIs relevant to the tools

- **Attendance:** `POST /api/faculty/attendance`, `POST /api/faculty/attendance/correct`, `/api/approvals`.
- **Timetable:** `/api/timetable/{check,entry,generate,publish}`.
- **Events:** `/api/events` plus 10 sub-routes (register, save, report, pass, checkin, attendees, certificates, updates, moderate, reports).
- **Files:** `/api/files`, `/api/files/[id]`.
- **Resources:** `/api/faculty/resources`.
- **Search:** `/api/search`.
- **AI:** `/api/ai/ask`, `/api/faculty/copilot`.
- **Notifications:** `/api/student/notifications/read`, `/api/student/settings/notifications`, `/api/notifications/push-subscriptions`.
- **Privacy:** `/api/privacy/*`.
- **Admin:** `/api/admin/settings/features`.
- **Jobs:** `/api/jobs/run`.

**Gap:** student attendance data is read server-side in pages. There is no
`GET /api/attendance` for client tools or AI, and no simulate endpoint.

## 8. Reusable components

- **Design system (`src/components/campus`):** `CampusCard`, `CampusSectionHeader`, `CampusPill`, `CampusIconTile`, `CampusProgressBar` / `ProgressRow`, `CampusXPBar`, `CampusStreak`, `CampusTimeline`, `CampusQuickAction`, `CampusNotice`, `CampusIllustration`, `CampusEmptyState`, `CampusSpeech`, `CampusTabs`, `CampusLinkRow`, `CampusEventCard`, `EventCover`, `VerificationBadge`.
- **Pixel sprites:** `PixelAvatar`, `PixelRobot`, `PixelFlame`, `PixelBadge`.
- **UI primitives:** `Button`, `Card`, `Badge`, `Input`, `Select`, `Textarea`, `Field`, `Table`, `EmptyState`, `PageHeader`, `Alert`, `Progress`, `Stat`.
- **Shell:** `AppShell` (sidebar, top bar, palette search, mobile drawer, 5-slot bottom nav with a quick-create sheet), `PortalLayout`, navigation config with feature and permission filtering.
- **Hooks and helpers:** `useApi` / `ErrorBox`, `withAuth`, `publicRoute`, `requireFeatureEnabled`, the rate limiter, the storage service, the notification planner, the HMAC token pattern (events → QR attendance).

## 9. Components that need redesign or rework

| Item | Why |
|---|---|
| Sidebar IA | The brief adds **Tools & Utilities**, and the mockup shows the Lv/XP chip in the user card. Today "Tracker" sits in the main group. |
| Quick-create sheet | The brief wants: Create goal, Add task, Save resource, Upload document, Ask AI, Create event. Several of those targets don't exist yet; only offer what works. |
| `/student/attendance` | Rebuild as the mockup's overall ring, stat trio, trend, and subject table (with safe-bunk column and View →), plus a subject detail page. |
| `/student/schedule` | Mockup week and day strip with ongoing highlight, room, and "View full week". Add a month view. |
| `/student/resources` (and the `/student/library` redirect) | Becomes Notes & PYQs with filters. Library proper (books and loans) is a separate, later module (`library_enabled`). |
| Dashboard events card | Uses the v1 `getCampusEvents` query, so it misses cross-college events and the registration state from Events 2.0. Switch to `listEvents`. |
| Missing reusable parts from §5 | `CampusStat`, `CampusRing` (donut), `CampusSlider`, `CampusModal` / `Drawer` / `BottomSheet` as shared primitives (the sheet exists only inside AppShell), `CampusFilter`, `CampusSearch`, `CampusJobCard`, `CampusTask`, `CampusGoal`, `CampusToolCard`. |

## 10. New tables required (checked against existing ones; no duplicates)

| Table | Why it's new (and what it reuses) |
|---|---|
| `attendance_self_marks` | Student-submitted marks awaiting approval. Kept separate so official `attendance_records` can never be overwritten by a student. |
| `attendance_qr_tokens` *(or stateless HMAC like event passes; preferred, so no table)* | Only if server-side revocation is needed. |
| `grading_scales`, `grading_scale_bands` | Configurable per institution (10-point default; letter→point bands). |
| `semester_results`, `semester_result_courses` | Student CGPA history. Rows are `OFFICIAL` (derived from `enrollments.final_grade`) or `SELF_REPORTED` (what-if). |
| `opportunities`, `opportunity_saves`, `opportunity_applications`, `opportunity_reports` | Nothing equivalent exists. Includes source, source URL, last verified, verification status and expiry. |
| `document_folders`, `documents` | Metadata layer over `stored_files`: folder, category, tags, display name, share token. |
| `channels`, `channel_follows`, `channel_posts` | Structured campus channels; posts fan out through the existing notification pipeline. |
| `reminder_rules` / `reminders` | Per-user settings and a sent-log with an idempotency key (user, source, occasion); delivery reuses `notifications`. |
| `study_plans`, `study_sessions` | Planner output plus complete, skip and reschedule state. |
| `tracker_goals`, `tracker_goal_steps`, `tracker_checkins`, `tracker_tasks` | Already drafted (stashed). Add `focus_sessions` later. |
| `xp_events`, `user_achievements` | Already drafted (stashed). Challenges come later. |
| `tool_usage` | Per-user counters for tools personalisation. |
| Enum additions, not tables | `resource_kind += 'PYQ'`; event category `CAREER_FAIR`. |

**Flags.** Most of the brief's flag names already exist under other names,
so map them rather than duplicate:

| Brief's flag | Existing flag |
|---|---|
| `opportunities_enabled` | `opportunity_hub_enabled` |
| `ai_enabled` | `ai_assistant_enabled` |
| `community_enabled` | `clubs_enabled` / `campus_channels_enabled` |
| `library_enabled` | `library_enabled` (exists) |

**New:** `bunk_calculator_enabled`, `cgpa_enabled`, `study_planner_enabled`,
`room_finder_enabled`, `documents_enabled`, `attendance_self_mark_enabled`,
`attendance_qr_enabled`.

## 11. New APIs required

- **Tools:** `GET /api/tools` (enabled tools, status, personal ordering), `POST /api/tools/usage`.
- **Attendance:**
  - `GET /api/attendance` (own summary and subjects)
  - `GET /api/attendance/subjects/[offeringId]` (history and trend)
  - `POST /api/attendance/simulate` (pure calculator; also usable by AI)
  - `POST /api/attendance/self-mark`, `POST /api/attendance/qr/[sessionId]`
  - faculty `POST /api/faculty/attendance/qr` (open or close a QR window)
  - `POST /api/import/attendance`
  - `GET /api/attendance/export`
- **Timetable and rooms:** `GET /api/timetable` (week, day, month with computed status), `GET /api/rooms?q=`, `GET /api/rooms/[id]` (status plus next class).
- **Reminders:** `GET/PUT /api/reminders/settings`, `POST /api/reminders/[id]/snooze`, and a `generate_reminders` job in `/api/jobs/run`.
- **Opportunities:** `GET/POST /api/opportunities`, `GET /api/opportunities/[id]`, save, apply, report, moderate, `…/[id]/match`.
- **Documents:** `GET/POST /api/documents`, `PATCH/DELETE /api/documents/[id]`, `POST /api/documents/[id]/share`, `GET/POST /api/documents/folders`.
- **Resources (student-facing):** `GET /api/resources`, `POST /api/resources` (contribute, moderated), `…/[id]/save`, `…/[id]/report`.
- **Study planner:** `POST /api/study-planner/generate`, `GET /api/study-planner`, `PATCH /api/study-planner/sessions/[id]`.
- **CGPA:** `GET/PUT /api/cgpa`, `POST /api/cgpa/project`, admin `PUT /api/admin/settings/grading`.
- **Tracker and gamification:** `/api/goals…`, `/api/tasks…`, `/api/gamification/me`, `/api/gamification/leaderboard`.
- **Channels:** `/api/channels…`.
- **Search:** extend `/api/search` with events, opportunities, channels and own documents.

## 12. UX problems found

1. **Fixed in Phase 1.** Feature flags revealed nav items and quick-create entries for pages that don't exist yet. With the flag on, **Tracker, Communities and Opportunities return 404**. The flags are off by default, so the problem is latent, but an admin toggle exposes broken routes. **Fix in Phase 1:** a route registry, so a flag can't be switched on for a module that isn't built.
2. `/student/library` silently redirects to resources, which is confusing once a real library exists.
3. There's no single "Tools" entry point; the calculators are buried in the attendance page.
4. The dashboard events card and the events module disagree (v1 versus 2.0 data).
5. ~~The "Readdressal" label is a misspelling of "Redressal" in 10+ places.~~ **Fixed in Phase 1:** renamed everywhere (routes, labels, AI tool, docs). Old `/…/readdressal` URLs return a 308 redirect, and stored notification links were rewritten by migration 0004.
6. The timetable has no "next class" card and no month view.
7. Attendance has no trend or history, only current totals.

## 13. Security, privacy and performance findings

| Finding | Severity | Plan |
|---|---|---|
| **Personal-data export misses cross-college event registrations.** `buildPersonalDataExport` filters `event_registrations` by the student's own `institution_id`, but those rows carry the organiser's. Saves and certificates are also missing from the export. | Medium (DPDP completeness) | Fix in Phase 1: filter by `user_id` only, and add saves and certificates |
| Attendance-summary recomputation lives in `src/app/api/faculty/_lib/attendance.ts` (route layer), not a service. | Low (architecture) | Move it to `services/attendance` in Phase 2 so QR, self-mark and import reuse it |
| `event:checkin` holders can check in at any event of their college, not only ones they're assigned to. | Low | Acceptable for now (college staff); consider per-event check-in staff later |
| Student self-marking must never touch `attendance_records`. | Design constraint | Separate table plus approval (see §10) |
| Document share links | Design constraint | Random 32-byte token, expiry, revocable, served via short-lived signed URL; never a public bucket |
| Opportunity fabrication risk | Design constraint | No scraping or fake seed data presented as real; every row has a source, URL and verification status; seeded rows are labelled "Demo" like events |
| Dashboard makes about 10 sequential and parallel queries per load. | Low (performance) | Fine at current scale; the "Your Day" aggregator should be one service with parallel queries plus indexes |
| No caching or service worker | — | PWA phase; read-only caches only |

## 14. Recommended implementation sequence

This follows the brief's §53 order, adjusted for what already exists.
Each phase ends with typecheck, test, build, UI screenshots, commit and push.

| Phase | Scope | Notes |
|---|---|---|
| **1** | Design system additions (Ring, Stat, Slider, Modal/Drawer/BottomSheet, Filter, Search, ToolCard); IA update (Tools & Utilities in the sidebar, Lv chip, quick-create limited to real actions); **route registry** so flags can't expose missing pages; `/tools` hub (cards for built tools show "Open", unbuilt ones show "Coming in phase N", never a dead CTA); tool usage counters; export fix; `docs/CAMPUSOS_UI_SYSTEM.md`, `docs/CAMPUSOS_TOOLS.md` | Small DB change: `tool_usage` |
| **2** | Attendance service extraction; pure attendance maths module (safe absences, projections, edge cases) with tests; redesigned tracker (ring, stats, trend, subject table); subject detail page; Bunk Calculator (target slider, simulations, disclaimer); advisor card; `/api/attendance*`; self-mark (institution rule plus approval); QR attendance; attendance import; CSV/PDF export | Brief's Phase 2 |
| **3** | Timetable viewer (week, day, month, computed status, next class); Room Finder; reminder generators, settings, snooze | |
| **4** | Events gap-fill: `/events` alias, eligibility and college filters, career fair, .ics; Campus Channels | Most of this phase is done |
| **5** | Opportunities with verification and moderation; match explanation | |
| **6** | Documents; Notes & PYQs (PYQ kind, contributions, moderation, save, report) | |
| **7** | Tracker and gamification (restore the stash), study planner | |
| **8** | CGPA with grading scales | |
| **9–12** | AI tools for every module; "Your Day" cross-module feed; mobile pass; PWA read caches; production QA | |

## 15. Risks

1. **Scope.** The brief spans about 15 modules. Each must meet the full quality standard (UI, API, service, database, validation, authorization, states, tests, docs), so phases take real time. Shipping many modules half-done would violate the brief's own rule, so the plan keeps it one phase at a time.
2. **Opportunity data.** A real feed needs a source: admin or placement-cell entry, community submissions with moderation, or partner feeds. Scraping job boards raises terms-of-service and accuracy problems. The recommendation is manual entry plus moderated submissions first, with a feed adapter interface for later.
3. **Attendance authority.** Self-marking and QR change who is trusted. Both stay behind institution flags, and official records remain faculty-controlled.
4. **CGPA correctness.** Indian universities differ: 10-point scales, relative grading, grace rules. The calculator must use a configurable scale and label estimates clearly.
5. **GitHub push.** This session still receives HTTP 403 from the git proxy for `Light-Prakash1708/CampusOs-`. Pulls work; pushes don't. Commits will be made locally per phase, and each push is retried. The repository needs to be added to the session's authorized sources for pushes to go through.
6. **Migrations.** All new migrations are additive, and v1 baselining stays intact. No migration drops data.
7. **Brand of the mockup.** The mockup shows "SNU, Kolkata" and named students. The seed keeps fictional West Bengal institutions and clearly labelled demo data.


---

## Phase 1 status (student OS brief)

Delivered in the Phase 1 commit:

- **Design system additions:**
  - `CampusRing`, `CampusStat`, `CampusSearch`, `CampusFilter`, `CampusComingSoon`, `CampusLevelChip`;
  - overlays `CampusModal`, `CampusDrawer`, `CampusBottomSheet`, `CampusSlider`;
  - `CampusToolCard`.
- **App shell:**
  - "Tools & Utilities" in the sidebar;
  - level/XP chip in the student user card (planned state until Phase 7);
  - a desktop **Create** button;
  - a quick-create menu with working actions first and planned ones labelled.
- **The `/tools` hub:** registry-driven, real per-student highlights, usage-based ordering (`tool_usage`), and loading, error and empty states.
- **Flags:** a module-availability guard (`UNBUILT_MODULES`), enforced in `isEnabled`, the settings API (422) and the settings UI.
- **Fixes:**
  - The privacy export now includes cross-college registrations, saved events, certificates, filed reports and tool usage.
  - Home events use the Events 2.0 service, and Campus Activity counts cross-college events.
  - "Redressal" rename.

Also fixed after being found during Phase 1:

- The admin sidebar linked to `/admin/assessments`, a page that never existed (a v1 404). The link is removed, and a test now guards every nav link.
- `Permissions-Policy: camera=()` blocked the organiser's QR scanner. Changed to `camera=(self)`.

**Note for Phase 7.** The stashed tracker schema was generated as migration
0004, before this phase took that number. When it's restored, it must be
regenerated (it becomes 0005).
