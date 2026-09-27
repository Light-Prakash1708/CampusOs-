# Pilot guide

How to run a CampusOS pilot semester with one college: before the first meeting, during setup, week by week, and at the review. Pair with [PRODUCT.md](PRODUCT.md) and the interview guide in [research/interview-guide.md](research/interview-guide.md).

## The pilot's one question

> Within one semester, can CampusOS show at least **two of these three**?
>
> 1. Proof that required notices reached students.
> 2. A working SGRC process with a record of resolution times.
> 3. An evidence pack the IQAC would otherwise build by hand.

If the answer is no, **don't scale sales; revisit the wedge** (strategy audit §26).

## Before the first meeting: the demo (10 minutes)

Use the public demo (`/login` → "Try the demo"). It is an isolated, shared tenant, reset nightly (the nightly reset is an owner step; see DEPLOYMENT.md). Nothing done in it sends email or push, and its data never reaches analytics.

**The story: "Monday morning at a college".**

1. **Registrar (admin) → Verified Notices.**
   - Open the water-supply notice that needs acknowledgement.
   - Show delivered / read / acknowledged, and the "not yet acknowledged" list.
   - Download it as CSV.
   - Point out that reminders go automatically to students who haven't acknowledged (the scheduled job; the notice shows when a reminder was sent).
   - *"This replaces 'did everyone see the WhatsApp message?'"*
2. **Student → Notices.**
   - Switch to the student account, then acknowledge the notice.
   - Back as admin, the count has moved.
3. **Student → Attendance.**
   - Show the standing against 75 % and the planner.
   - *"Students check this themselves, so fewer detention surprises."*
4. **Student → Redressal → New case.**
   - File one. Show the statutory due date and the appeal path.
5. **Admin → Redressal → Committee.**
   - Show the SGRC members and the Ombudsperson, and the attestation.
6. **Admin → Evidence & Reports.**
   - Download the evidence pack for the term and open `summary.html`.
   - *"This is what your IQAC assembles by hand today."*
7. **Close:**
   - *"Your ERP stays. We import a CSV."*
   - *"Free for one semester."*
   - *"We measure the three things above together."*

**Don't demo** timetable, gamification or the AI assistant unless asked. Breadth hides the product.

## Setup (target: one working day)

| Step | Who | Where |
|---|---|---|
| 1. Create the institution (core modules only) | Operator | `/admin/institutions` (platform operator) |
| 2. Pilot subscription: plan PILOT, seat count, end date | Operator | Institution → Billing |
| 3. The college's super admin signs in and enrols in two-step sign-in | College | `/account/security` |
| 4. Create departments and programmes on screen, then import sections → faculty → students from CSV (overlay mode; templates in `pilot/csv-templates/`) | College + us | Admin → Structure, then Data Import |
| 5. Minimum attendance percentage, grievance categories, SGRC members + Ombudsperson + attestation | College | Admin → Settings, Redressal → Committee |
| 6. Email sender configured (`EMAIL_PROVIDER`), so reminders arrive | Operator | Environment |
| 7. Send invitations; share the student join link | College | Admin → Students / Verification |
| 8. First required notice ("Welcome to CampusOS: please acknowledge") | College | Verified Notices |

## Weekly rhythm

- **Monday:** a 15-minute call with the champion. Use the metrics below and the questions from the interview guide.
- **Watch:** `/admin/metrics` (operator). Look at weekly active students, notices sent, acknowledgement rate, time to acknowledge, and grievances filed/resolved.
- **Log:** every request, complaint and "we still use WhatsApp for …" goes in the pilot log, verbatim.

## Metrics to collect

Collect these descriptively. Don't claim CampusOS caused a change without a comparison.

| Metric | Source | Target signal |
|---|---|---|
| Students activated / enrolled | `/admin/metrics` | > 60 % by week 4 |
| Weekly active students | `/admin/metrics` (active days) | Stable or rising after week 4 |
| Required notices sent per week | Evidence pack: communication | Staff use it without being reminded |
| Acknowledgement rate within 48 h | Notice receipts | > 80 % |
| Median time to acknowledge | Notice receipts | Falling |
| Grievances filed / resolved within the statutory window | Evidence pack: grievances | 100 % within 15 working days |
| Evidence pack downloads by the college | Audit log (`EVIDENCE_PACK_EXPORTED`) | ≥ 1 used in a real IQAC/NAAC document |
| Staff time spent (self-reported) | Interview | Before/after, stated as self-reported |

## Review (end of semester)

- Did we meet 2 of 3? Show the evidence from the college's own pack.
- **Ask for:** a written case study, a reference call, and a price conversation (see [PRODUCT.md](PRODUCT.md), with prices as hypotheses).
- **If they won't pay:** find out exactly why and record it. It is the most valuable data of the pilot.
