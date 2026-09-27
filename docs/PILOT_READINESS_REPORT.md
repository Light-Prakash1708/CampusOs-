# CampusOS pilot readiness report

**Date:** 27 September 2026
**Scope:** V1 backlog (P0–P1) from [BACKLOG.md](BACKLOG.md), measured against [CAMPUSOS_STRATEGY_AUDIT.md](CAMPUSOS_STRATEGY_AUDIT.md).

**Verdict: the software is ready for a free pilot semester with one college.** It is not ready for a *paid* launch. That needs:

- pilot evidence;
- the owner's hosting and account steps;
- legal review of the privacy notice;
- professional GST advice.

None of those can be done from the repository.

There are no customers, no interviews and no usage data yet. Everything below describes the software, not the market.

---

## 1. What is complete

| # | Item | Status |
|---|---|---|
| 002 | Customer interview kit (guide + synthesis template) | Done |
| 003 / 012 | Privacy-safe product analytics (allowlisted events, hashed actors, 180-day retention); operator metrics; "college not listed" demand signal | Done |
| 004 | Paid instance, pre-deploy migrations, health gate, CI-gated deploy; restore check (`npm run db:verify`) and drill runbook | Done in repo; **owner steps open** (see §3) |
| 005 / 006 / 007 | Adult-only personal sign-up with age band; versioned privacy notice with consent records; export; personal-workspace erasure | Done; **guardian consent and legal review open** |
| 008 | Secret scan: history clean, gitleaks in CI | Done |
| 009 | Playwright E2E for the core flows, as a separate CI job | Done |
| 010 | Required notices: delivered/read/acknowledged receipts, pending CSV, automatic reminders | Done |
| 011 | Grievances: SGRC committee, statutory 15-working-day dates, 15-day appeal, Ombudsperson (30 days) | Done |
| 013 | Attention signals with reasons, replacing "at-risk" scoring | Done |
| 014 / 022 | Evidence pack (ZIP), reconciled with receipts and Campus Insights; productivity score and "time saved" removed | Done |
| 015 / 016 / 030 | Isolated, resettable public demo; core modules only for new colleges; focused navigation; landing copy (no redesign) | Done; nightly reset is an owner step |
| 017 | Installable app with an offline page and no personal data cached | Done; **push opt-in blocked** on Firebase web config |
| 018 | Two-step sign-in (TOTP + recovery codes), enforced for super admins in production | Done |
| 019 | External AI processing off by default per college; demo is always offline | Done |
| 020 | Manual billing: plans (as hypotheses), seats, FY-numbered PDF invoices | Done; **GST treatment open** |
| 021 | Nonce-based Content-Security-Policy, enforced | Done |
| — | Docs: PRODUCT, PILOT_GUIDE, ADMIN_GUIDE, STUDENT_GUIDE; API/AI/DEPLOYMENT updated; old reports archived | Done |

**Deferred by design:**

- 023–029 go to V1.5, and only after pilot evidence.
- 031–039 go to V2/V3.
- 001 is still in progress: market numbers that need demo calls with competitors.

## 2. What is verified (and how)

| Check | Result | How |
|---|---|---|
| Unit and integration tests | **343 / 343 pass** (30 files) | `npm test` on a real Postgres 16, freshly seeded |
| End-to-end, production build | **10 / 10 pass**, about 30 s | `npm run test:e2e`, covering: form sign-in (desktop + mobile), wrong password, required notice → student acknowledges → staff receipts/CSV/page, attendance (desktop + mobile), grievance filed → tracked case, adult sign-up + under-18 refused + join request, evidence ZIP, student permission boundaries (403s, no `/admin`, assistant leaks no other student's contact details). Every test also fails on any page error or 5xx. |
| Typecheck / lint / build | 0 type errors, 0 lint errors, build OK | `tsc`, `eslint`, `next build` |
| Migrations | 20/20 applied; additive only; idempotent | CI migrates twice and checks for drift |
| Tenant isolation | Every table has `institution_id` (test-enforced); membership transfer classifies every table | Tests |
| CSP | Enforced; 0 violations across 27 routes | Playwright crawl with the report endpoint |
| PWA | Worker registers; only `/offline` is cached; offline navigation shows the offline page | Playwright, production build |
| Restore | dump → restore into a new database → `db:verify` passed | Local rehearsal |
| Secrets | gitleaks history scan clean (1 fixture false positive allowlisted narrowly); `.env` never committed | gitleaks 8.28 |
| Responsive UI | Checked at 375 / 768 / 1024 / 1440 px on the changed screens; no horizontal overflow | Playwright screenshots |

**Not verified here:**

- Behaviour on a real Render deployment.
- Real email delivery.
- Real Android devices.
- Load beyond seed data (about 400 users, about 26,000 attendance rows).

## 3. What remains

### Owner steps: needed before the first pilot

| Step | Why |
|---|---|
| Paid Postgres with PITR; nightly off-site `pg_dump`; first recorded restore drill | A pilot's data can't be lost |
| `ERROR_REPORTER=webhook` + an uptime monitor on `/api/health` | We need to know about failures before the college does |
| Email domain (SPF/DKIM) + `EMAIL_PROVIDER=resend` | Acknowledgement reminders must actually arrive |
| Custom domain + `APP_URL`; `PLATFORM_OPERATOR_EMAILS`; operators enrol in two-step sign-in | Trust, and the operator console |
| A separate demo service with a nightly `demo:reset` (optional) | The login page says the demo resets every night |

### Decisions that need a professional: before any *paid* contract

- **Legal review** of `/privacy` (DPDP Act 2023; Rules notified 14 Nov 2025 with a phase-in) and of the data processing terms with the college.
- **Guardian consent flow** for under-18 students. Today under-18s can only join through their college. The college, as data fiduciary, must handle consent. Confirm that position with counsel.
- **GST** on invoices (rate, SAC code, place of supply, registration threshold) — needs an accountant.
- **Prices** are hypotheses (₹150–300 and ₹300–600 per student per year). Don't quote them as fixed.

### Known gaps in the software (acceptable for a pilot)

- Web push opt-in needs Firebase web config. Email and in-app delivery work without it.
- The join flow can't take an ID upload unless file storage is configured. Colleges that require an ID should use invitations until then.
- E2E covers students' permission boundaries. The faculty and admin boundaries are covered by unit and integration tests only.

## 4. What to test with customers

We are testing the **wedge**, not the features. The pilot passes if, within one semester, the college can show at least **two of three**:

1. **Notices reached students.** Required notices are acknowledged, and the office uses the pending list instead of WhatsApp follow-ups.
2. **A working SGRC process.** Grievances are filed and resolved within the statutory window, with a record.
3. **Evidence the IQAC actually uses.** The pack appears in a real IQAC/NAAC document or meeting.

**Also test:**

- whether students activate without being forced (is the attendance planner the hook?);
- whether "works alongside your ERP" removes the "we already have an ERP" objection;
- whether one-day CSV onboarding holds for a real college's data.

## 5. Exact questions to ask

**Principal / trust secretary (buyer):**

1. "When a notice must reach every student, how do you know today that it did?"
2. "In the last year, which grievance reached the university, UGC or social media before you could resolve it? What did it cost you?"
3. "When is your next NAAC or NIRF submission? Who assembles the student-support evidence, and how long does it take?"
4. "What does your ERP cost per student per year, and who decided to buy it?"
5. "If this showed (1)–(3) within a semester, what would it be worth per student per year? Who else must agree?"

**IQAC coordinator / Dean (champion):**

6. "Walk me through the last time you compiled evidence for Criterion 5. What did you collect by hand?"
7. "Which WhatsApp groups would you stop using if acknowledgement worked?"
8. "What would make faculty refuse to use this?"

**Students:**

9. "How did you last find out you were short on attendance?"
10. "What would stop you from installing this?" (Listen for surveillance, battery and data worries.)
11. "Would you use it if your college didn't?"

**At the end of the pilot:**

12. "What would you lose if we switched it off tomorrow?"
13. "Would you pay ₹X per student next semester? If not, what number, and why?"

Record the answers verbatim in [research/interview-synthesis-template.md](research/interview-synthesis-template.md).

## 6. Exact metrics to collect

Report these descriptively. Say what happened, without claiming CampusOS caused it unless there is a comparison.

| Metric | Source | Pass signal |
|---|---|---|
| Students activated ÷ enrolled | `/admin/metrics` | > 60 % by week 4 |
| Weekly active students (share with ≥ 1 active day) | `/admin/metrics` | Stable or rising after week 4 |
| Required notices sent per week, and by how many distinct staff | Evidence pack: communication | Staff send them unprompted; more than 1 sender |
| Acknowledgement rate within 48 h; median time to acknowledge | Notice receipts | > 80 %; median falling |
| Reminders sent; whether the office follows up from the pending list | Notice receipts + interview (CSV downloads aren't tracked as an event) | The office uses it instead of WhatsApp |
| Grievances filed; share resolved within 15 working days; appeals | Evidence pack: grievances | 100 % within the window |
| Evidence pack exports; pack used in a real document | `evidence_pack_generated` event / audit log + interview | ≥ 1 real use |
| Students below minimum who then viewed their signal (descriptive only) | Product events (`attention_signal_viewed`) | Signals are seen |
| Support requests and "still using WhatsApp for …" items | Pilot log | Falling |
| Staff time per task (self-reported, before and after) | Interview | Labelled as self-reported |

## 7. Evidence needed before continuing

Do **not** start V1.5 (023–029) or scale sales until all of these exist:

1. **At least 10 structured interviews** (buyers, champions and students), synthesised with the template. Currently: 0.
2. **At least one pilot college live for at least 8 weeks**, meeting **2 of the 3** wedge criteria from its own evidence pack.
3. **A written willingness-to-pay answer** (a number, or a reasoned "no") from the economic buyer. Plus one reference the college agrees to give.
4. **Competitor pricing** from at least 2 real demo calls, to close CAMPUSOS-001.
5. **Legal sign-off** on the privacy notice, and **accountant sign-off** on invoice tax treatment, before the first paid invoice.
6. **Operations proof:** one recorded restore drill, uptime and error alerting live, and email deliverability confirmed (reminders arrive and don't land in spam).

If the pilot can't meet 2 of 3, the strategy says **revisit the wedge** rather than adding features.
