# CampusOS: the product

> Business source of truth: [CAMPUSOS_STRATEGY_AUDIT.md](CAMPUSOS_STRATEGY_AUDIT.md).
> Execution order and status: [BACKLOG.md](BACKLOG.md).
> This page is the short version.

## What it is

**CampusOS is the student layer for a college.** It covers:

- verified notices;
- live attendance;
- fair grievance redressal;
- accreditation-ready evidence.

It works alongside the ERP the college already has. It is **not** an ERP: no fees, admissions, exam results processing or payroll. It is **not** an LMS.

Students get a free personal workspace that works before their college joins, and moves with them when the college verifies them.

## Who it's for

- **Buyer:** the principal, director or trust secretary of a private or autonomous Indian college with 500–5,000 students.
- **Champion:** the IQAC coordinator or the Dean of Student Affairs.
- **Daily users:** students (mostly on Android phones), faculty and the academic office.

## What a college gets in V1

| Area | What it does | Where |
|---|---|---|
| **Verified notices** | Notices can require acknowledgement. Senders see delivered, read and acknowledged counts, download the list of students who haven't acknowledged, and send reminders. | Admin → Verified Notices; Faculty → Announcements |
| **Attendance** | Students see their standing against the minimum and a planner. Staff see who is below the minimum, and why. There are no risk scores and no ranking. | Student → Attendance; staff dashboards |
| **Grievance redressal (UGC 2023)** | SGRC committee, statutory 15-working-day due dates, appeal to the Ombudsperson within 15 days (the Ombudsperson has 30 days), SLA escalation and optional anonymity. | Student → Redressal; Admin → Redressal |
| **Evidence pack** | One ZIP with a summary page plus CSVs covering communication, grievances, attendance by programme and participation. Aggregates only by default; the export is audited. | Admin → Evidence & Reports |
| **Onboarding** | CSV import in overlay mode (keep your ERP), invitations and verified student join requests. | Admin → Data Import, Verification |
| **Security and privacy** | Tenant isolation on every table, capability-based permissions, an audit log, two-step sign-in for administrators, an enforced CSP, a privacy notice with consent records, export and erasure. | [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md) |

Other built modules (timetable, events, library, workload, opportunities, AI assistant) stay **on for existing tenants** and are **off by default for new colleges**. An administrator can turn them on in settings.

## What a student gets (free)

- An attendance planner ("you can miss 2 more DBMS classes").
- One notice feed.
- Deadlines, a tracker, skills and career goals, and opportunities.
- Adult-only personal sign-up (18+). Under-18 students join through their college.

## Principles (non-negotiable)

- **No surveillance.** No risk scores, no student ranking, and no hidden signals. Every staff signal shows its reason.
- **Descriptive, not causal.** Reports say what happened. They don't claim CampusOS caused it.
- **Hide, don't destroy.** Existing tenants keep what they use.
- **No invented proof.** No invented customers, traction, compliance certificates or research.
- **Prices are hypotheses** until pilots validate them. GST treatment needs a professional's advice.

## Pricing (hypothesis, to validate)

| Tier | Contents | Hypothesis |
|---|---|---|
| Pilot | Professional features for one semester, up to 1,000 students | Free, for a case study and weekly feedback |
| Starter | Notices + acknowledgement, attendance, SGRC grievances, events, student workspace | ₹150–300 per student per year |
| Professional | + evidence pack, analytics digest, AI assistant (fair use) | ₹300–600 per student per year |
| Enterprise / Group | + multi-college, SSO, SMS/WhatsApp (pass-through), SLA | Custom |

Billing V1 is manual. An operator records the plan and seats and issues a numbered PDF invoice ([BILLING.md](BILLING.md)).
