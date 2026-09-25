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
