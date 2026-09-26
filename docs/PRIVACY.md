# Privacy & Data Governance

CampusOS is built privacy-by-design around India's **Digital Personal Data
Protection Act, 2023 (DPDP)**. The institution is the *Data Fiduciary* for
academic records; CampusOS processes them on its behalf. Students are *Data
Principals* with rights of access, correction and erasure (subject to the
institution's legal retention obligations).

> This document describes what the software does. It is not legal advice; each
> institution should review its own notices and retention periods.

## Commitments

- CampusOS does not sell personal data and does not use it for advertising.
- Nothing optional is visible to other students until the student opts in.
- Attendance, grades, private goals, personal tracking and library history are
  **never** shown on leaderboards or public profiles, whatever the settings
  (`NEVER_PUBLIC` in `src/services/privacy/rules.ts`).
- Every privacy change is audited; every consent-bearing change is appended to
  an append-only consent ledger.

## Data catalogue

`src/services/privacy/catalogue.ts` is the single source for what is stored,
why, who can see it, whether it can be disabled, how long it is kept and what
happens on deletion. The Privacy page (`/account/privacy`) renders it, and
`ensureRetentionPolicies()` seeds `data_retention_policies` per institution from
it. A unit test fails if a category is incomplete.

Categories: Account · Academic · Attendance · Personal tracking · Goals ·
Events · AI · Notifications · Leaderboard & gamification · Library. Categories
tied to a module appear only when that module is enabled for the institution.

## Tables

| Table | Purpose |
|---|---|
| `privacy_preferences` | One row per user; absence = defaults. Leaderboard visibility (`PRIVATE` default), profile visibility, public streaks/badges/event participation, personalised recommendations, AI memory (off), AI Coach data scopes (none). |
| `consent_records` | **Append-only** (trigger). Purpose, granted/withdrawn, notice version, source, IP. Current state = latest row per purpose. |
| `data_retention_policies` | Per-tenant category policy: purpose, owner, retention days, visibility, deletion and export policy. |
| `data_export_requests` | Record of each export. |
| `data_deletion_requests` | Erasure requests; at most one in flight per user and scope (partial unique index). |

## Defaults

| Setting | Default |
|---|---|
| Leaderboard | Private (only you see your position) |
| Profile | Visible to your college |
| Streaks / event participation on profile | Hidden |
| Badges on profile | Shown |
| Personalised recommendations | On (switchable; consent recorded) |
| AI memory | Off — turning it off deletes what was remembered |
| AI Coach data access | None until ticked per scope |

## Rights

| Right | How | Behaviour |
|---|---|---|
| Access / portability | `GET /api/privacy/export` (“Download my data”) | JSON of everything held about the caller — and only the caller. Password hash and token hashes excluded. Rate-limited to 3/day. Audited. |
| Erase AI memory | `POST /api/privacy/deletion {scope:"AI_MEMORY"}` | Immediate. |
| Erase personal tracker | `POST /api/privacy/deletion {scope:"PERSONAL_TRACKER"}` | Immediate. Phase 2 registers its tables in `PERSONAL_TRACKER_ERASERS`. |
| Delete account | `POST /api/privacy/deletion {scope:"ACCOUNT", confirm:"DELETE"}` | Reviewed by the institution (**Admin → Access & Privacy**). Approval **anonymises**: personal data (AI history, memory, devices, preferences, tokens, tracker) is deleted, the account can no longer sign in, and academic records the institution must keep stay attached to an anonymous identity. |

## Notifications and overrides

Students choose channels, categories and quiet hours. The one exception is a
notice an administrator marks **mandatory** (emergency broadcasts): it reaches
every channel the institution has enabled, including ones the student turned
off. This is disclosed on the Privacy page.

## Audit

Audited: preference changes (before/after), exports, export downloads, deletion
requests and decisions, registration approvals, invitations, password events,
administrator settings changes.

## Pilot-readiness additions (CAMPUSOS-005, 006, 007, 019)

> **Owner action before public launch:** have a lawyer review `/privacy` (the notice text in `src/app/privacy/page.tsx`) and the age-gate approach against the DPDP Rules, 2025. The Rules were notified 14 Nov 2025 with an 18-month phased timeline. The software is built conservatively, but it is not legal advice.

### Age gate (CAMPUSOS-005)

- **Personal sign-up asks one question: "Are you 18 or older?"** CampusOS stores the answer as a consent row (`age_18_or_over`), **never a date of birth**.
- **Under-18s are refused before anything is stored.** They are pointed to their college, which handles consent for its own students.
- **No guardian-consent flow is built.** Verifiable parental consent under the DPDP Rules needs legal review of the acceptable mechanisms first, so it stays **BLOCKED** until then.

### Privacy notice and consent records (CAMPUSOS-006)

- **Public notice:** `/privacy`, versioned by `PRIVACY_NOTICE_VERSION` in `src/lib/privacy-notice.ts`.
- **At personal sign-up:** accepting the notice is required, and is recorded as `privacy_notice` with the version, source `onboarding` and IP.
- **Everyone else** (invited staff, college students, and anyone after a version bump) sees a **non-blocking** banner in their portal. It never blocks notices, attendance or anything else. Accepting records `privacy_notice` with source `notice_banner`. The action is audited as `PRIVACY_NOTICE_ACCEPTED`.
- **Contact address:** set `PRIVACY_CONTACT_EMAIL` to show one on the notice.

### Export and erasure (CAMPUSOS-007)

- **Export:** already built. `/account/privacy` → Download returns everything about the caller and nobody else.
- **Tracker data and AI memory:** erased immediately.
- **College accounts:** deletion is reviewed by the college (`privacy:handle_requests`), because academic records may carry retention duties. On approval the account is anonymised.
- **Personal workspaces:** there is no college to review, so deletion is **immediate**. The flow:
  1. The student types DELETE.
  2. The account is anonymised.
  3. Notifications, files (database rows and storage objects), open join requests, campus interest and pseudonymous usage rows are deleted.
  4. The workspace is closed, and the student is signed out.
- **What remains after a personal deletion:** consent and audit rows stay, because they are append-only legal evidence. They are attached to the anonymised identity.

### External AI processing (CAMPUSOS-019)

- **The module flag `ai_external_processing_enabled`** (Settings → Modules) is **off by default**.
- **While it is off:** even when `AI_PROVIDER=anthropic` is configured, the assistant and Teacher Copilot use the built-in offline provider, so no campus data leaves CampusOS.
- **When a college turns it on:** only data the asking user is already permitted to see is sent, via the permission-scoped tools.
- **Where it's enforced:** `aiProviderFor()` in `src/services/ai/providers.ts`.
