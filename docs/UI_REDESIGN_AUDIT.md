# CampusOS UI Redesign — Audit

_Baseline: commit "Phase 1: auth completion…" · typecheck 0 errors · 112 tests passing · build OK._

The visual target is the two reference boards (dashboard, events, tracker,
library, AI/career, and the assets pack). This audit records what exists so the
redesign **re-skins and recomposes** rather than rebuilds.

## 1. Existing UI architecture

- Next.js 15 App Router. Three portals (`/student`, `/faculty`, `/admin`) share
  `PortalLayout` (server: auth, portal check, nav filtering by capability and
  feature flag, badge counts) → `AppShell` (client: sidebar, top bar, command
  palette, theme toggle, mobile bottom nav).
- Pages are Server Components that query through `src/app/student/_lib/*`
  and `src/services/*`. Client components are small islands (forms, chat,
  toggles).
- Tailwind v4 with CSS-variable tokens in `src/app/globals.css`
  (`--surface`, `--border`, `--brand`, semantic success/warning/danger/info),
  light and `.dark` sets, per-tenant brand override.
- Navigation data in `src/components/layout/navigation.ts` (string icon keys,
  permission + feature filters). Command palette = global search.

## 2. Reusable components (`src/components/ui/index.tsx`)

Button, Card/CardHeader/CardBody/CardFooter, Badge, Input, Textarea, Select,
Field, EmptyState, ErrorState, Skeleton/SkeletonRows, PageHeader, Section,
Table/Th/Td, Avatar, Stat, Alert, Progress, Divider, AiLabel, EstimateChip.
Every page composes from these — **re-styling them re-skins all ~60 pages**.

## 3. Existing pages

Student (18): dashboard, schedule, attendance, assignments, assessments,
resources, skills, announcements, calendar, notifications, readdressal (+new,
+detail), assistant, profile, settings, more. Faculty (16) and admin (22)
portals. Signed-out: login, register, forgot/reset password, verify email,
invite. Account: security, privacy.

## 4. Existing design tokens

Slate neutrals, indigo brand (`243 75% 59%`), semantic colours, restrained
shadows, radius scale 4–16 px, system font stack. Dark mode via `.dark` class
persisted in localStorage.

## 5. Functionality that must be preserved

Auth/session/RBAC, portal redirects, capability-filtered navigation, feature
flags hiding modules, command palette search, notification badges, theme
toggle, demo badge, every data query (timetable, attendance maths in basis
points, assignments buckets, announcements read/ack, change feed, skills
readiness, grievances, AI assistant with honest offline provider), all
faculty/admin workflows.

## 6. Pages requiring redesign (student-first)

Dashboard (full recomposition), assistant (mobile chat layout + mascot),
resources → Library & Resources, skills → Career Mode, attendance (Attendance
Planner visuals), schedule (timeline), announcements/notifications (Notices
cards), profile, and the new Events, Tracker and Goal screens.

## 7. Components requiring redesign

AppShell (sidebar width, active lavender state, user card with level/XP, top
bar with search/notifications/AI/institution chip/avatar, 5-item bottom nav
with central ＋ sheet), Card (ink outline + offset shadow), Button, Badge
(pastel pills), Progress (rounded coloured bars), EmptyState (illustrated),
Input/Select (ink borders).

## 8. Components reused unchanged in structure

Field, Table, Alert, Skeleton, PageHeader, Section, Stat, CommandPalette,
all form islands, `useMutation`, `useApi`.

## 9. Dependencies NOT to replace

Next.js, React 19, Tailwind v4, Radix primitives, lucide-react, recharts,
Drizzle, pg, jose, bcryptjs, zod. Added: self-hosted fonts via `@fontsource`
(no runtime Google request, works offline in CI).

## 10. Data reality check (no fake numbers)

| Reference element | Real source today | Plan |
|---|---|---|
| Today's schedule | published timetable + exceptions (`occurrencesForDate`) | reuse |
| Attendance % | `attendance_summaries` | reuse |
| Assignments % | submissions vs assignments | compute from `getStudentAssignments` |
| Goals %, streak, XP, level | **no tables** | build Phase 2 backend (goals, logs, streaks, XP ledger); until enabled, show empty state |
| Campus activity % | event registrations | compute; empty state if none |
| Events near you | `events` (institution-internal) | reuse now; Events 2.0 backend adds discovery/registration |
| Notices & updates | announcements + change feed | reuse |
| Library | **no tables** | build library module (feature-flagged) |
| Career mode | skills engine + career roles | reuse |
| AI chat | `/api/ai/ask`, 13 tools | reuse; add tools as modules land |

## 11. Potential regressions

- Heavier card outlines on dense admin tables — mitigated by a `plain`
  card variant and hairline table rows.
- Sidebar narrowing could truncate long admin nav labels — labels checked.
- Fonts: bundle size (+~60 kB woff2, cached) — subset latin only.
- Illustrations: crops from the reference assets pack are low-resolution
  placeholders; replace files in `public/illustrations/` with originals at
  2× without code changes.
- Dark mode: pastel tiles and ink borders need their own dark palette, not an
  inversion.
