# Production smoke test

Run this **after every production deploy** that changes behaviour, and in full **before the first pilot**. It has two parts:

1. **Automated, anonymous and read-only.** Safe against the live pilot at any time:

   ```bash
   node scripts/smoke/production.mjs https://<your-domain> <commit-sha>
   ```

   It checks:
   - health, migrations and the release commit;
   - the CSP nonce and security headers;
   - that portals and APIs refuse anonymous visitors;
   - that demo sign-in is off;
   - that the manifest and service worker are served and cache static assets only.

   Every line must be PASS. The deploy workflow runs it automatically once `APP_URL` and `RENDER_DEPLOY_HOOK_URL` are GitHub secrets.

2. **Signed-in, manual.** Run the checklist below in a **test college**, never in the pilot college. Signed-in checks create notices, grievances and users, which must not appear in a real college's records or its evidence pack.

## Set up the test college (once)

Run this in the Render Shell. Use an email address you control; plus-addressing works with Gmail.

```bash
npm run provision -- --slug zz-test --name "ZZ Test College (not real)" --short ZZT \
  --city Kolkata --admin-email you+zzadmin@gmail.com --admin-first Test --admin-last Admin
```

Then, in the test college:

- Create one department and programme in Admin → Structure. Then import sections, faculty and students with the header templates in [pilot/csv-templates/](pilot/csv-templates/), filled with test rows, or add people by hand.
- Create **one faculty**, **two students** (you+zzs1, you+zzs2), a section and a course.
- Add grievance committee members and an Ombudsperson (you+zzombud).

Keep this college for every future smoke test. Its numbers never enter a pilot college's evidence.

**Devices:**
- desktop Chrome;
- an **Android phone with Chrome** on mobile data, not Wi-Fi (this catches CDN and DNS problems);
- one iPhone, if available.

Record every result as ✅ / ❌ with a note. Classify any ❌ with the guardian-mode classes (A–F) in [pilot/ISSUE_LOG.md](pilot/ISSUE_LOG.md).

## Authentication

| # | Check | Expected |
|---|---|---|
| A1 | Admin signs in (Android + desktop) | Lands on `/admin` |
| A2 | Super admin without two-step sign-in | Sent to set it up before anything else |
| A3 | Enrol two-step sign-in, sign out, sign in with a code | The code step appears; the code works once |
| A4 | Sign in with a recovery code | Works once; the remaining count drops |
| A5 | Wrong password | Generic error; doesn't reveal whether the email exists |
| A6 | Faculty signs in / student signs in | Land on `/faculty` / `/student` |
| A7 | Session expiry | After `SESSION_MAX_AGE` (8 h), or after Account → Security → "Sign out all other devices" on the other device, the next page goes to `/login` |
| A8 | Another admin resets a lost two-step sign-in | The person is signed out, can sign in with password only, and must re-enrol |

## Student (student 1, on Android)

| # | Check | Expected |
|---|---|---|
| S1 | Privacy notice banner on first sign-in → accept | Banner gone; acceptance recorded |
| S2 | Attendance | Standing per course against the minimum; planner shows classes that can be missed or are needed |
| S3 | Notices → required notice → **I've read this** | Shows "Acknowledged <time>" |
| S4 | Assignments list opens | No errors |
| S5 | Redressal → new case | Case page with the statutory due date |
| S6 | Account → Privacy → download my data | A file downloads with only this student's data |
| S7 | Install to home screen; open offline | App opens; offline page, not stale personal data |
| S8 | New personal sign-up (18+) → Join college → ZZ Test College | Request "sent"; appears in Admin → Verification |
| S9 | Under-18 sign-up | Refused, and pointed to the college invitation |

## Faculty

| # | Check | Expected |
|---|---|---|
| F1 | Mark attendance for the section | Saved; student 1 sees it |
| F2 | Post an announcement to the section with acknowledgement required | Students see it pinned |
| F3 | Open that announcement's receipts | Delivered / read / acknowledged counts; pending list |
| F4 | Redressal | Sees only cases routed to them |

## Admin

| # | Check | Expected |
|---|---|---|
| D1 | Verified Notices → send a required notice to all students | Reach preview, then sent |
| D2 | Receipts: after student 1 acknowledges | Acknowledged +1; student 2 is in the pending list |
| D3 | Pending CSV | Downloads; opens in Excel and Sheets; no formula execution |
| D4 | Reminder (after the job runs, or at the deadline) | Student 2 gets a reminder email; the notice shows "reminder sent" |
| D5 | Redressal → Committee | Members, Ombudsperson and attestation shown |
| D6 | Grievance timeline | The S5 case shows its status history and due date; resolve it |
| D7 | Appeal: student 1 appeals the resolved case | The Ombudsperson sees it with a 30-day due date |
| D8 | Evidence & Reports → evidence pack for this month | ZIP opens; `summary.html` counts match the receipts page and the grievances list |
| D9 | Campus Insights | Descriptive rates only; no scores or rankings |
| D10 | Audit log | Evidence export, two-step sign-in reset and grievance changes appear |
| D11 | Billing (operator only) | Plan and seats saved; invoice PDF numbered `CO/2026-27/…` |

## Security (desktop)

| # | Check | Expected |
|---|---|---|
| X1 | Student opens `/admin`, `/faculty`, `/admin/reports` | Redirected away |
| X2 | Student opens another student's grievance URL | Not found |
| X3 | Admin of ZZ Test cannot see the operator's institutions or another college's data | 403 or not found |
| X4 | Demo sign-in on the pilot host | Unavailable (the smoke script checks for 404) |
| X5 | Assistant: "list students below minimum with their emails" as a student | Only the student's own data |
| X6 | External AI | Admin → Settings → AI shows "offline assistant"; no external calls |
| X7 | CSP | No CSP errors in the browser console on the pages above |

## Infrastructure

| # | Check | Expected |
|---|---|---|
| I1 | `/api/health` | `healthy`, `pending: 0`, and the release equals the deployed commit |
| I2 | Cron | Render → `campusos-jobs` → last runs succeeded |
| I3 | Email headers of D4's mail | `spf=pass`, `dkim=pass`; inbox, not spam (Gmail **and** Outlook) |
| I4 | Error reporting | The test event arrived at the webhook |
| I5 | Uptime monitor | Shows up; a test alert was received |
| I6 | Backups | Latest backup exists; last restore drill is recorded in GO_LIVE_RUNBOOK |

Record the run:

| Date | Commit | Tester | Desktop | Android | Failures (issue IDs) |
|---|---|---|---|---|---|
| | | | | | |
