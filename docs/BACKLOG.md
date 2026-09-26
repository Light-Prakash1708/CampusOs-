# CampusOS master build backlog

- **Derived from:** [`CAMPUSOS_STRATEGY_AUDIT.md`](CAMPUSOS_STRATEGY_AUDIT.md). The strategy audit explains *why* each item is here.
- **Baseline:** `main` at `5ef88c3`.

## Priorities and delivery windows

| Priority | Meaning | Window |
|---|---|---|
| **P0** | Blocks a paid pilot, or a legal/safety requirement | V1, first |
| **P1** | Needed for the pilot to succeed or be measured | V1 |
| **P2** | Pilot-semester improvements, driven by pilot data | V1.5 |
| **P3** | After pilots convert | V2 / V3 |

## Status board

Statuses are DONE, IN PROGRESS, BLOCKED, DEFERRED and TODO. Completion notes are in the log at the end of this file.

| Item | Status | Note |
|---|---|---|
| 001 | IN PROGRESS | Verification round 1 done (strategy §10a). Remaining: AISHE college split, private share, Indian ERP per-student prices (need demo calls) |
| 002 | DONE | Interview kit ready. The interviews themselves need the founder |
| 003 | DONE | Operator metrics at /admin/metrics |
| 004 | TODO | |
| 005 | DONE (adult-only) | Guardian-consent flow BLOCKED on legal review |
| 006 | DONE | Notice text needs legal review before public launch |
| 007 | DONE | Export existed; personal-workspace erasure added |
| 008 | TODO | |
| 009 | TODO | |
| 010 | DONE | Receipts, CSV, reminders, faculty view |
| 011 | TODO | |
| 012 | DONE | Built with 003; warm campuses on /admin/metrics |
| 013 | DONE | `get_at_risk_students` removed; student card + staff scoping |
| 014 | TODO | |
| 015 | TODO | |
| 016 | TODO | |
| 017 | TODO | |
| 018 | TODO | |
| 019 | DONE | `ai_external_processing_enabled`, off by default |
| 020 | TODO | |
| 021 | TODO | |
| 022 | TODO | |
| 030 | TODO | |
| 023–029 | DEFERRED | V1.5, only after pilot evidence |
| 031–039 | DEFERRED | V2/V3 |

## Rules that apply to every item

- Migrations are additive only.
- Identity, role and tenant always come from the session.
- No secrets in the repo or in client bundles, and no sensitive data in logs.
- Existing UI is kept. Components are extended, not redesigned.
- Every item needs:
  - Vitest coverage for service logic and authorization, including a cross-tenant denial case;
  - `npm run typecheck && npm run lint && npm test` passing.

---

## Research and validation (no code)

### CAMPUSOS-001: Complete competitor and pricing verification (P0)

- **Objective:** Replace every `UNKNOWN — REQUIRES VERIFICATION` in strategy §10–12 and §26 with sourced data.
- **Business reason:** Pricing and positioning must not rest on guesses.
- **User:** Founder.
- **Affected files:** `docs/CAMPUSOS_STRATEGY_AUDIT.md`.
- **DB / API / frontend:** None.
- **Dependencies:** None.
- **Risk:** Vendors hide prices. Mitigate with demo calls, IndiaMART/GeM listings and customer conversations.
- **Acceptance criteria:**
  - Public or quoted price ranges for ≥5 Indian ERPs.
  - Hands-on demo notes for Camu and Linways student apps.
  - AISHE 2023–24 counts of colleges and the private share.
  - Review-site complaint themes (G2, Capterra, Play Store).
- **Testing:** Every figure has a source URL, or is marked as a quote with its date.

### CAMPUSOS-002: Customer discovery interviews (P0)

- **Objective:** Run ≥10 principal/IQAC and ≥30 student interviews to validate the "Why pay?" test.
- **Business reason:** A wedge built without validation is the main business risk.
- **User:** Founder.
- **Affected files:** `docs/research/interviews/*.md` (anonymised).
- **DB / API / frontend:** None.
- **Dependencies:** None.
- **Risk:** Interviews may leak interviewees' personal data. Store notes anonymised only.
- **Acceptance criteria:**
  - A synthesis doc ranking pains.
  - Willingness-to-pay ranges.
  - 3 pilot commitments, or a documented pivot decision.
- **Testing:** No PII in the repository (manual review).

---

## Foundations

### CAMPUSOS-003: Privacy-safe product analytics (P0)

- **Objective:** Record product events (sign-up, first notice acknowledged, attendance viewed, grievance filed, AI query) so that activation and retention can be measured.
- **Business reason:** There is currently no way to learn from usage.
- **User:** Founder, operator.
- **Affected files:**
  - new `src/services/product-events.ts`;
  - new schema `product_events`;
  - `src/lib/api.ts` (helper);
  - an admin/operator metrics page.
- **DB:** additive table `(id, institution_id, user_id_hash, event, props jsonb, created_at)`.
- **API:** internal only.
- **Frontend:** operator metrics page.
- **Dependencies:** None.
- **Risk:** PII in `props`. Mitigate with an allowlisted event names and property keys, a hashed user id, and no free text.
- **Acceptance criteria:**
  - 10 core events recorded.
  - A weekly-actives-per-tenant view for operators only.
  - Rows purged after 400 days.
- **Testing:** Unit tests reject unknown keys; operator-only access; no email or name ever stored.

### CAMPUSOS-004: Production hosting hardening (P0)

- **Objective:**
  - A paid instance with no cold starts.
  - Migrations as a pre-deploy step.
  - Backups with PITR and a documented restore drill.
  - An error-report sink.
  - An uptime monitor.
  - Deployment docs consolidated.
- **Business reason:** A pilot cannot run on the free tier.
- **User:** Operator.
- **Affected files:** `render.yaml`, `Dockerfile`, `DEPLOYMENT.md`, `docs/DEPLOYMENT.md`.
- **DB / API / frontend:** None.
- **Dependencies:** Budget decision by the founder.
- **Risk:** Moving the migration step. Mitigate by keeping the migration runner idempotent (it already is).
- **Acceptance criteria:**
  - `/api/health` monitored.
  - A restore drill has been performed and documented.
  - The region is recorded consistently across docs.
- **Testing:** The existing render-blueprint test is updated.

### CAMPUSOS-008: Secret scan of git history (P1)

- **Objective:** Run gitleaks (or similar) over the full history and in CI.
- **Business reason:** Acquisition and security diligence.
- **User:** Operator.
- **Affected files:** `.github/workflows/ci.yml`.
- **DB / API / frontend:** None.
- **Dependencies:** None.
- **Risk:** False positives in test fixtures. Mitigate with an allowlist file.
- **Acceptance criteria:** CI fails on new secrets; the history scan is clean or remediated.
- **Testing:** CI run.

### CAMPUSOS-009: E2E smoke tests in CI (P1)

- **Objective:** Playwright tests for login, notice acknowledgement, attendance view, grievance filing and the join-college flow.
- **Business reason:** Regressions in the core flows would lose pilots.
- **User:** Team.
- **Affected files:** `e2e/*`, `ci.yml`.
- **DB / API / frontend:** None.
- **Dependencies:** CAMPUSOS-010, CAMPUSOS-015.
- **Risk:** Flaky tests. Mitigate with a seeded test DB and no external providers.
- **Acceptance criteria:** 5 flows pass in CI in under 5 minutes.
- **Testing:** —

---

## Privacy and compliance (DPDP)

### CAMPUSOS-005: Age gate and guardian consent for self-registration (P0)

- **Objective:**
  - Collect a date-of-birth band at personal sign-up.
  - Under-18s need a verifiable guardian consent step before any processing beyond account creation.
  - Otherwise, direct them to their college invitation route.
- **Business reason:** DPDP obligations for children's data.
- **User:** Student, guardian.
- **Affected files:**
  - `src/app/register/StudentSignupForm.tsx`;
  - `src/services/auth/accounts.ts` (`registerIndependentStudent`);
  - `src/app/api/auth/register/student/route.ts`.
- **DB:** additive `users.age_band` (or on `student_profiles`) plus a `guardian_consents` table.
- **API:** register route plus a consent endpoint.
- **Frontend:** a form step.
- **Dependencies:** Legal review of the exact DPDP Rules mechanism. The mechanism is UNKNOWN — REQUIRES VERIFICATION.
- **Risk:**
  - Friction at sign-up. Mitigate by adding only a single question for adults.
  - Storing the exact DOB unnecessarily. Mitigate by storing the age band only.
- **Acceptance criteria:**
  - Under-18s cannot complete personal sign-up without consent.
  - Adults see one extra field.
  - Audited.
- **Testing:** Service tests for both paths; a band cannot be forged into an adult by any client field beyond the form's declared value; rate-limited.

### CAMPUSOS-006: Consent and notice records (P0)

- **Objective:** Store which privacy-notice version each user accepted, when, and for what purposes (including external AI processing).
- **Business reason:** DPDP evidence, and college DPAs.
- **User:** All users.
- **Affected files:**
  - new `src/services/consent.ts`;
  - the login/first-run interstitial;
  - `docs/PRIVACY.md`.
- **DB:** additive `consent_records`.
- **API:** `POST /api/account/consent`.
- **Frontend:** a first-run notice modal using existing UI primitives.
- **Dependencies:** None.
- **Risk:** Blocking logins if the modal breaks. Mitigate so the modal never blocks read-only access to notices.
- **Acceptance criteria:**
  - Version bumps re-prompt.
  - Records are immutable.
  - An admin sees aggregate acceptance only.
- **Testing:** Tenant isolation; a user can't write consent for another user.

### CAMPUSOS-007: Data export and erasure requests (P0)

- **Objective:**
  - Students can export their data (JSON plus files) and request erasure.
  - Personal-workspace data is erased directly.
  - College-held academic records follow the college's retention policy, and a reviewer queue handles them.
- **Business reason:** DPDP data-principal rights.
- **User:** Student, admin.
- **Affected files:**
  - `src/services/membership.ts` (the MOVE/KEEP classification is reused to enumerate tables);
  - new `src/services/data-rights.ts`;
  - `/student/settings`;
  - an admin queue.
- **DB:** additive `data_requests`.
- **API:** student and admin routes.
- **Frontend:** a settings section plus an admin tab under Verifications.
- **Dependencies:** CAMPUSOS-006.
- **Risk:** Erasing records the college must retain. Mitigate with a per-table policy and a test that every tenant table is classified.
- **Acceptance criteria:**
  - Export completes within 24 hours through the jobs sweep.
  - Erasure of a personal workspace is complete and verified.
  - Every action audited.
- **Testing:** A classification-completeness test; cross-tenant denial; an export contains no other user's data.

### CAMPUSOS-019: Per-tenant external AI processing control (P0)

- **Objective:**
  - A tenant setting "Allow external AI provider".
  - When it is off, only `LocalProvider` is used.
  - The disclosure appears in the privacy notice.
- **Business reason:** Colleges must control data egress.
- **User:** Admin.
- **Affected files:** `src/services/ai/providers.ts`, admin settings, `src/lib/features.ts`.
- **DB:** uses existing `feature_flags` jsonb (no migration).
- **API:** settings route.
- **Frontend:** settings toggle.
- **Dependencies:** CAMPUSOS-006.
- **Risk:** Low.
- **Acceptance criteria:** With the toggle off, no network call is made to any AI provider.
- **Testing:** A provider-selection unit test.

### CAMPUSOS-018: TOTP MFA for SUPER_ADMIN and ADMIN (P1)

- **Objective:** Optional TOTP for all users; mandatory for operators and super admins.
- **Business reason:** Operator compromise would affect every tenant.
- **User:** Admins.
- **Affected files:** `src/services/auth/*`, login flow, account settings.
- **DB:** additive `user_mfa` (secret encrypted with a key from env).
- **API:** enrol, verify and recovery-code routes.
- **Frontend:** account security page plus a login step.
- **Dependencies:** None.
- **Risk:**
  - Lockout. Mitigate with recovery codes and an operator reset (audited).
  - Leaking secrets. Mitigate by never logging them.
- **Acceptance criteria:**
  - Operators cannot create institutions without MFA.
  - Recovery codes are hashed.
- **Testing:** Replay window, rate limits, and recovery codes working once only.

### CAMPUSOS-021: Nonce-based CSP `script-src` (P1)

- **Objective:** Add `script-src 'self' 'nonce-…' 'strict-dynamic'` via middleware.
- **Business reason:** XSS containment.
- **User:** All users.
- **Affected files:** `src/middleware.ts`, `next.config.mjs`, `src/app/layout.tsx` (theme bootstrap script gets the nonce).
- **DB / API / frontend:** None.
- **Dependencies:** None.
- **Risk:** Breaking hydration. Mitigate by staging it with a report-only header first.
- **Acceptance criteria:** No CSP violations across the E2E suite.
- **Testing:** CAMPUSOS-009 suite plus a header test.

---

## The wedge (college value)

### CAMPUSOS-010: Required notices with acknowledgement and delivery (P0)

- **Objective:**
  - Admins and faculty can mark an announcement "acknowledgement required".
  - Students see it pinned until they acknowledge it.
  - Senders see delivered, read and acknowledged counts, plus the list of students who have not acknowledged.
  - Email and push delivery are configured and enabled for pilot tenants.
- **Business reason:** This is the #1 "why pay": proof that notices reached students, replacing WhatsApp.
- **User:** Admin, faculty, student.
- **Affected files:**
  - `src/services/announcements*` / `notifications` services;
  - `/admin/communications`;
  - `/faculty/announcements`;
  - `/student/announcements`;
  - the student home;
  - `src/services/notifications/providers`.
- **DB:** additive columns `announcements.requires_ack` and `ack_deadline`; a table `announcement_receipts (announcement_id, user_id, delivered_at, read_at, acked_at)`.
- **API:** `POST /api/.../announcements/[id]/ack`; a receipt summary route (sender or permission-holder only).
- **Frontend:** an ack button, a pinned banner, and a sender stats panel, all built from existing UI primitives.
- **Dependencies:** CAMPUSOS-004 (email sender domain).
- **Risk:**
  - Receipt table growth. Mitigate with an index and partition by created month later.
  - Privacy. Only the sender and admins see individual non-ack lists.
- **Acceptance criteria:**
  - A student acknowledges once; the action is idempotent.
  - Counts are correct.
  - The non-ack list is exportable to CSV.
  - Reminders go out through the jobs sweep before the deadline.
- **Testing:** Idempotency; cross-tenant; a student cannot see others' receipts; a faculty member sees only their own announcements' receipts.

### CAMPUSOS-011: SGRC-aligned grievance workflow (P0)

- **Objective:**
  - Map the existing Redressal Centre to the UGC 2023 regulations: committee membership (SGRC), the ombudsperson escalation step, statutory timelines as SLA presets, and a public-facing grievance policy page per college.
  - Timelines, verified from the regulation text (strategy §10a):
    - SGRC report preferably within 15 working days;
    - student appeal to the ombudsperson within 15 days;
    - ombudsperson resolution within 30 days.
- **Business reason:** A compliance "why pay" for principals.
- **User:** Student, grievance committee, admin.
- **Affected files:** `src/services/grievance*`, `/admin/redressal`, `/student/redressal`, `docs/GRIEVANCE.md`.
- **DB:** additive `grievance_committees` / `committee_members` (if not already covered by existing role assignments; check first); an `escalation_level` enum value `OMBUDSPERSON`.
- **API:** committee-management routes.
- **Frontend:** a committee setup section plus the escalation step in the existing timeline.
- **Dependencies:** CAMPUSOS-001 (regulation text).
- **Risk:** Legal over-claim. Mitigate by describing it as "supports", never "certifies compliance".
- **Acceptance criteria:**
  - Resolution time and SLA breaches are reportable per term.
  - Anonymous grievances stay anonymous to committee members.
- **Testing:** Anonymity (reporter identity is never returned to reviewers); escalation permissions; audit.

### CAMPUSOS-013: Attention signals replace the at-risk tool (P0)

- **Objective:**
  - Replace `get_at_risk_students` with `get_attention_signals`: transparent rules (attendance below the course threshold, projected shortage, missing submissions over N days, overdue grievances), each returned with its reason.
  - No composite score.
  - Students see their own signals first.
  - Mentor or faculty visibility is scoped to their own classes, and is subject to the college setting.
- **Business reason:** Fairness, trust and DPDP. It keeps the useful part without "predicting failure".
- **User:** Student, faculty, admin.
- **Affected files:** `src/services/ai/tools.ts`, new `src/services/attention-signals.ts`, the student home, faculty class view.
- **DB:** none (computed); an optional additive `attention_signal_dismissals`.
- **API:** `/api/student/signals`, `/api/faculty/signals`.
- **Frontend:** a "Needs attention" card using the existing Card component.
- **Dependencies:** None.
- **Risk:** Alert fatigue. Mitigate with thresholds from college settings and dismissal.
- **Acceptance criteria:**
  - Every signal shows its rule and data.
  - The words "risk" and "predict" do not appear in UI copy or tool names.
  - The old tool is removed.
- **Testing:** Rule unit tests; faculty scoping (only own sections); a grep test that the old tool name is gone.

### CAMPUSOS-014: Accreditation evidence pack v1 (P1)

- **Objective:**
  - Admins and IQAC export a term's evidence as a ZIP of CSVs plus a summary PDF/HTML: notices and acknowledgement rates, grievance log and resolution times, attendance summaries by programme, events and participation, student-support activities, and skill/opportunity participation.
  - Mapping to the new NAAC criteria is UNKNOWN — REQUIRES VERIFICATION. Label sections generically until verified.
- **Business reason:** The IQAC champion's main pain.
- **User:** IQAC, principal.
- **Affected files:** `src/services/reports*`, `/admin/reports`.
- **DB:** none.
- **API:** `GET /api/admin/reports/evidence?term=` (permission `reports:export`, or the existing equivalent).
- **Frontend:** an export card on the reports page.
- **Dependencies:** CAMPUSOS-010, CAMPUSOS-011.
- **Risk:**
  - Leaking PII in exports. Mitigate with aggregates by default; individual-level data only with an explicit permission, and audited.
- **Acceptance criteria:**
  - Export works for a term with 5k students in under 60 seconds.
  - Every number reconciles with in-app screens.
- **Testing:** Permission and tenant tests; a reconciliation test on seeded data.

### CAMPUSOS-022: Remove or relabel heuristic metrics (P1)

- **Objective:** Remove "productivity score" and "time saved" from admin UI, or relabel them as "estimate" with the method shown. Every analytics number links to its underlying records.
- **Business reason:** Credibility with skeptical buyers.
- **User:** Admin.
- **Affected files:** `src/services/analytics.ts`, admin analytics pages.
- **DB / API / frontend:** None beyond those pages.
- **Dependencies:** None.
- **Risk:** Low.
- **Acceptance criteria:** No unexplained score remains in the admin UI.
- **Testing:** Existing analytics tests updated.

---

## Go-to-market enablers

### CAMPUSOS-015: Demo tenant for sales (P0)

- **Objective:**
  - A read-only-reset demo college in production, isolated.
  - Populated by a dedicated demo seeder (not `db:seed`).
  - Reset nightly by a job.
  - Accessed through "Try the demo" role buttons.
- **Business reason:** Prospects must see it working in 60 seconds.
- **User:** Prospects.
- **Affected files:** `scripts/provision-demo.ts`, jobs, a login-page link.
- **DB:** data only, in its own tenant.
- **API:** a demo sign-in route with rate limits, which issues sessions only for demo accounts.
- **Frontend:** a landing CTA link (copy only).
- **Dependencies:** CAMPUSOS-004.
- **Risk:**
  - Demo accounts are abused or reach real tenants. Mitigate with a hard `institutions.kind = COLLEGE` plus a `is_demo` check, no email sending, uploads disabled, and a nightly reset.
- **Acceptance criteria:**
  - Demo sessions cannot access any other tenant.
  - Outbound email and AI calls are disabled in the demo.
- **Testing:** Tenant isolation; a provider-disabled assertion.

### CAMPUSOS-016: Hide non-core modules by default (P1)

- **Objective:**
  - New tenants default to the core set: communication, attendance, redressal, events, resources, skills, opportunities, tracker.
  - Library, room utilisation, the timetable optimizer, leaderboards and gamification default to off, but remain available.
  - Renumber `UNBUILT_MODULES` labels to "Planned".
- **Business reason:** Focus and clarity.
- **User:** Admin.
- **Affected files:** `src/lib/features.ts`, `src/services/institutions.ts` (`ONBOARDING_MODULES`).
- **DB / API / frontend:** None.
- **Dependencies:** None.
- **Risk:** Existing tenants change. Mitigate: defaults apply only to *new* tenants, because stored flags override defaults.
- **Acceptance criteria:** Existing tenants are unchanged; new tenants get the core set.
- **Testing:** A flag-default test.

### CAMPUSOS-030: Landing positioning copy (P1)

- **Objective:**
  - Update the hero subtitle, the Fragmentation line, module order and CTA copy to the positioning in strategy §14.
  - Add "Works alongside your ERP".
  - **No layout, art or component redesign.**
- **Business reason:** A prospect should understand the product in 60 seconds.
- **User:** Prospects.
- **Affected files:** `src/components/landing/HeroSection.tsx`, `Fragmentation.tsx`, `ProductModules.tsx`, `FinalCTA`.
- **DB / API / frontend:** Copy only.
- **Dependencies:** CAMPUSOS-002 (message testing), CAMPUSOS-015.
- **Risk:** Low.
- **Acceptance criteria:**
  - A screenshot diff shows only copy changes.
  - No claims beyond shipped features.
- **Testing:** Visual check at 375, 768, 1024 and 1440 px.

### CAMPUSOS-012: Warm-lead demand signal (P1)

- **Objective:** Aggregate personal-workspace students by the college name they typed or searched (unlisted colleges). The operator dashboard shows colleges with ≥N students.
- **Business reason:** This makes the bottom-up loop measurable.
- **User:** Operator.
- **Affected files:** `src/services/membership.ts` (search logging), a new operator page.
- **DB:** additive `college_interest (normalized_name, count, last_seen)`. Counts only; no user ids.
- **API:** operator route.
- **Frontend:** operator table.
- **Dependencies:** CAMPUSOS-003.
- **Risk:** Privacy. Mitigate by aggregating only, with a minimum count of 5 before display.
- **Acceptance criteria:** No individual is identifiable from the view.
- **Testing:** Operator-only access; k-threshold test.

### CAMPUSOS-020: Billing records and manual invoicing (P1)

- **Objective:**
  - Operators set a plan, seat count, term and price per tenant.
  - The system generates a PDF invoice (GST fields) and records payment status manually.
  - Remove `billing_enabled` from `UNBUILT_MODULES`.
- **Business reason:** CampusOS needs to be able to charge.
- **User:** Operator, college finance.
- **Affected files:** new `src/services/billing.ts`, `/admin/institutions` (operator), a read-only admin billing page.
- **DB:** additive `subscriptions` and `invoices`.
- **API:** operator routes.
- **Frontend:** operator form plus admin view.
- **Dependencies:** A GST registration decision. The GST treatment of education SaaS is UNKNOWN — REQUIRES VERIFICATION by an accountant.
- **Risk:** Tax errors. Mitigate with accountant review; no payment gateway yet.
- **Acceptance criteria:**
  - Only operators write billing data.
  - Admins read their own tenant's invoices.
  - Invoices are numbered sequentially.
- **Testing:** Permission and tenant tests; numbering concurrency test.

### CAMPUSOS-017: Installable PWA (P1)

- **Objective:** Manifest, icons, a service worker with offline shell and cached schedule, and web push via FCM. Remove `pwa_enabled` from `UNBUILT_MODULES`.
- **Business reason:** Indian students are mobile-first.
- **User:** Student.
- **Affected files:** `public/manifest.webmanifest`, `src/app/layout.tsx`, a service worker file.
- **DB / API / frontend:** None beyond the push subscription store (check whether it exists; likely yes, under notifications).
- **Dependencies:** CAMPUSOS-021 (the CSP must allow the worker).
- **Risk:** Stale caches. Mitigate by versioning the cache and never caching API responses containing personal data beyond the schedule.
- **Acceptance criteria:** Lighthouse PWA installable; push received on Android Chrome.
- **Testing:** Manual device test plus a unit test for the cache-key policy.

---

## Pilot-semester improvements (P2, V1.5)

### CAMPUSOS-023: Admin weekly digest

- **What:** An email and in-app digest built from CAMPUSOS-010, 011, 013 and 014 data. Every number links to its underlying list.
- **Affected files:** jobs, notifications.
- **Acceptance criterion:** Sent Monday 8am IST, with opt-out.

### CAMPUSOS-024: Campus Pulse

- **What:** 1–3-question pulse surveys. Results show only once there are 10 or more responses; no individual free text is shown.
- **DB:** additive `pulse_surveys` and `pulse_responses`. Responses store the respondent only in a separate hashed dedupe key.
- **Acceptance criterion:** The k-threshold is enforced server-side.

### CAMPUSOS-025: ERP import templates

- **What:** CSV mappings for the two ERPs found in pilots, plus scheduled SFTP/HTTPS pull under overlay mode.
- **Dependencies:** CAMPUSOS-002.

### CAMPUSOS-026: Student Growth Profile v1

- **What:** An evidence-based profile with verification levels per item, section-level visibility controls, and export. No composite score.
- **Affected files:** `src/services/skills.ts`, `/student/skills`, `/student/progress`.

### CAMPUSOS-027: Explainable opportunity match

- **What:** Match reasons and missing skills, linked to resources and the gap plan.
- **Affected files:** the opportunities service.

### CAMPUSOS-028: WhatsApp delivery via BSP

- **What:** An opt-in provider for acknowledgement-required notices only. Costs are passed through.
- **Dependencies:** A BSP contract. Costs are UNKNOWN — REQUIRES VERIFICATION.

### CAMPUSOS-029: AI provider adapter and evals

- **What:**
  - An OpenAI-compatible adapter.
  - An eval suite asserting that no tool returns unpermitted or cross-tenant rows, and that answers cite tool data.
  - Per-tenant token metering.

---

## After pilots convert (P3, V2 / V3)

| Item | Scope |
|---|---|
| CAMPUSOS-031 | Multi-college groups (a trust admin over several tenants) |
| CAMPUSOS-032 | SSO with Google Workspace and Microsoft Entra |
| CAMPUSOS-033 | Payment gateway (Razorpay or similar) |
| CAMPUSOS-034 | Mentor workflow on attention signals (student-consented) |
| CAMPUSOS-035 | NAAC criterion mapping v2 (after the verified framework) |
| CAMPUSOS-036 | APAAR/ABC integration, if a public API exists (UNKNOWN — REQUIRES VERIFICATION) |
| CAMPUSOS-037 | Cross-college event discovery, switched on by default |
| CAMPUSOS-038 | Opportunity partner feeds (Unstop/Internshala/Superset), subject to their terms |
| CAMPUSOS-039 | Archive superseded docs into `docs/archive/` (can be done any time; P3) |

## Explicitly not building

These can be revisited only with pilot evidence:

- Fees, admissions, examinations/results, HR/payroll (ERP scope).
- Virtual lab.
- Clubs, channels, campus reps, AI memory.
- Any composite student "quality" or "risk" score.
- Student subscriptions.
- A recruiter marketplace.
- Sponsored listings before V3.

---

## Completion log

### 2026-09-27: CAMPUSOS-001 (round 1) and CAMPUSOS-002

- **Files:**
  - `docs/CAMPUSOS_STRATEGY_AUDIT.md` (new §10a verification update);
  - `docs/research/interview-guide.md`;
  - `docs/research/interview-synthesis-template.md`.
- **Findings that change strategy:**
  - Linways bundles grievance, messaging, mentoring and a student app. The wedge is narrowed to ERP-neutral overlay, verified acknowledgement and a student-owned workspace.
  - The UGC 2023 timelines are now verified (15 working days / 15 days / 30 days).
- **Tests:** n/a (docs).
- **Deployment:** none.

### 2026-09-27: CAMPUSOS-003 product analytics and CAMPUSOS-012 campus demand

- **Database:** migration `0013_product_analytics`, additive. New tables `product_events`, `product_active_days` and `campus_interest`, all tenant-scoped and all classified KEEP for membership transfer.
- **Services:**
  - `product-events.ts`: allowlisted events, HMAC actor, never throws, 400-day purge in `sweep`;
  - `product-metrics.ts`: operator-only aggregates;
  - `campus-demand.ts`: aggregate-only warm campuses, minimum 5 per college.
- **Instrumented:** sign-up, join request, verification, invite acceptance, notice view/ack/create, attendance view and marking, planner, grievances created/resolved, opportunity open/save, goals, career goal, AI queries, and daily activity in `PortalLayout`.
- **API:**
  - `POST /api/product-events` (three browser events only, rate-limited);
  - `GET/POST /api/student/campus-interest`.
- **UI:**
  - `/admin/metrics` (operators only);
  - operator links on the admin home;
  - on **Join your college**, "College not listed?" with a copy-a-link share for classmates.
- **Fix found on the way:** notice acknowledgement could double-count under concurrent clicks, and did not check the caller's tenant. It is now conditional and tenant-scoped, with a test.
- **Tests:** `tests/product-analytics.test.ts` (12). Full suite: 296/296; typecheck and lint clean (no errors).
- **Docs:** `docs/ANALYTICS.md`, `.env.example`.
- **Known issues:** `profile_completed` is not emitted, because there is no profile-editing flow yet (Growth Profile is V1.5). `career_goal_set` is used instead.
- **Deployment:** runs the migration automatically. Optionally set `ANALYTICS_HASH_KEY`.

### 2026-09-27: CAMPUSOS-005, 006, 007 and 019 (privacy P0)

- **Correction to the audit.** The repository already had a consent ledger (`consent_records`, append-only), a privacy centre (`/account/privacy`), data export, and deletion requests with college review. The strategy audit under-reported these. This work fills the gaps instead of rebuilding them.
- **005 age gate:**
  - personal sign-up requires an age band (never a date of birth);
  - under-18s are refused before anything is stored;
  - a guardian-consent flow is **BLOCKED**, pending legal review of the DPDP Rules mechanisms.
- **006 notice and consents:**
  - public `/privacy`, versioned;
  - acceptance required at personal sign-up and recorded (`privacy_notice`, `age_18_or_over`);
  - a non-blocking portal banner for everyone else, via `POST /api/privacy/notice`;
  - new audit action `PRIVACY_NOTICE_ACCEPTED`.
- **007 erasure:** deletion of a personal-workspace account is now immediate and self-service. It:
  - anonymises the account and ends its sessions;
  - deletes files (database rows and storage objects), notifications, open requests, campus interest and usage rows;
  - closes the workspace.

  College accounts still go to the college for review. The anonymisation code is shared (`anonymizeAccount`).
- **019 external AI processing:**
  - new module flag, off by default;
  - `aiProviderFor()` falls back to the offline provider unless the flag is on;
  - used by the assistant, Teacher Copilot and the assistant page's disclosure.
- **Also:**
  - `AuthContext.institutionKind`;
  - `consent_records` is now KEEP on membership transfer. It is append-only, and moving it broke approval of students who had signed up with consent; a test caught this.
- **Tests:**
  - new `tests/privacy-pilot.test.ts` (6);
  - 3 age/consent tests in `self-registration.test.ts`;
  - full suite 305/305; typecheck clean; lint has 0 errors.
- **Owner actions:**
  - legal review of `/privacy` and the age-gate approach;
  - set `PRIVACY_CONTACT_EMAIL`.
- **Deployment:** no migration.

### 2026-09-27: CAMPUSOS-010 verified communication

- **Already present:** `requires_acknowledgement`, per-recipient read and ack rows, the student's acknowledge action, the "your day" prompt on the student home, and an admin not-acknowledged list.
- **Added:**
  - **`services/notice-receipts.ts`:**
    - the funnel: sent, delivered in-app, opened, acknowledged, pending, overdue;
    - external channel counts from `notification_deliveries`;
    - the full pending list;
    - one authorisation rule (author, or `announcement:view_analytics`, same college).
  - **CSV export** of who hasn't acknowledged. It is formula-injection safe and audited (`DATA_EXPORTED`).
  - **`GET /api/announcements/[id]/receipts`** (JSON, or `?format=csv`).
  - **One pre-deadline reminder** (deadline within 24 hours) to people who haven't acknowledged. The claim is race-safe. It runs as a new tenant job, `ack_reminders`.
  - **`NoticeReceiptsPanel`**, shared by admin and faculty.
  - **A new faculty page, `/faculty/announcements/[id]`**, so teachers see proof for their own notices.
- **Terminology:**
  - "Communications" → "Verified Communication";
  - "Analytics" → "Campus Insights";
  - "Reports" → "Evidence & Reports".

  These are nav labels and page titles only; routes are unchanged.
- **Database:** migration `0014_ack_reminders` (additive column `announcements.ack_reminder_sent_at`).
- **Tests:** `tests/verified-communication.test.ts` (4). Full suite 309/309.
- **Deployment:** the scheduler already runs every tenant job. No new configuration.
- **Known limits:** email and push delivery still need `EMAIL_PROVIDER` and `PUSH_PROVIDER` configured for pilots (an owner step under CAMPUSOS-004). WhatsApp is deferred (028).

### 2026-09-27: CAMPUSOS-013 attention signals

- **`services/attention-signals.ts`:** transparent rules. Each signal has what, why, source and action, and no score.
  - **Student signals:**
    - subjects below or on the edge of the minimum, reusing the attendance planner's numbers;
    - assignments missing in the last 14 days;
    - assignments due within 48 hours;
    - notices waiting for acknowledgement.
  - **Staff signals:**
    - only for classes the caller teaches, or college-wide with `attendance:view_all`;
    - attendance below the minimum, and 3 or more missing submissions in 14 days;
    - listed by section and name, never ranked.
- **AI:** `get_at_risk_students` is replaced by `get_attention_signals`. It gives students their own signals and staff their scoped signals. The offline assistant recognises "what needs my attention" and "who is falling behind", and the tool description forbids "at risk" and "likely to fail" language.
- **UI:**
  - a "Needs your attention" card on the student home (attendance and coursework), which records `attention_signal_viewed`;
  - "Your Day" keeps deadlines and notices, and drops duplicate attendance items;
  - faculty and admin copy changed from "at risk" to "below minimum" or "Needs attention", described as "a rule, not a prediction".
- **Tests:** `tests/attention-signals.test.ts` (4) checks the explanation fields, no score or prediction language, scoping, cross-tenant denial, and the tool registry.
- **Deployment:** none.
