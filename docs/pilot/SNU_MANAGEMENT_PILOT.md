# SNU Management Department pilot — setup checklist

Sister Nivedita University, Management Department, about 100–200 students, one semester.
Everything below uses screens that already exist; nothing is built specially for SNU.
General background: [../PILOT_GUIDE.md](../PILOT_GUIDE.md), [../INSTITUTION_ONBOARDING.md](../INSTITUTION_ONBOARDING.md).

**No SNU data lives in the repository or the seed.** SNU is created on production by the operator,
and its roster comes from the college's own CSV export. The public demo is a separate, fictional
tenant (`demo-university`) that can never reach SNU (see "Demo isolation" below).

## 1. Operator (CampusOS team)

| Step | Where |
|---|---|
| If SNU used "Register your college", mark the request **Contacted** | `/admin/institutions` → Requests from colleges |
| Create the institution: name, `snu` slug, website, official domain, Kolkata, **core modules only**, join policy *admin approval*, ID card *optional*. First admin = the department's CampusOS lead (their SNU email) | `/admin/institutions` → Create an institution |
| Mark the request **Set up** | same page |
| Pilot plan, seat count 200, semester end date | Institution → Billing |
| `EMAIL_PROVIDER` configured (invitations and reminders need it). Without it, invitation links are shown to the admin to share by hand. | Render environment |

## 2. SNU admin (department lead)

| Step | Where |
|---|---|
| Accept the invitation and turn on two-step sign-in | Email link → `/account/security` |
| Department **Management**, then its programmes (e.g. BBA, MBA) | Admin → Structure |
| Import **sections** (programme, year, semester) | Admin → Data Import, `sections.csv` |
| Import **faculty** | Admin → Data Import, `faculty.csv` |
| Import **students**: roll number, name, SNU email, programme, section, year, semester | Admin → Data Import, `students.csv` (overlay mode) |
| Minimum attendance %, grievance categories, SGRC members | Admin → Settings, Redressal → Committee |
| Send invitations | Admin → Students |
| First required notice: "Welcome to CampusOS — please acknowledge" | Verified Notices |

Templates: [csv-templates/](csv-templates/).

## 3. Students — two ways in

1. **Invited (preferred).** The invitation link only sets a password. Programme, section, year and
   semester come from the imported roster, so the student is never asked for them and lands straight
   on their home (today's classes, notices, attendance, events, tracker).
2. **Signed up on their own.** `/register` → "I'm a student" → Join your college → search "Sister
   Nivedita" → choose department/programme, enter roll number → the SNU admin approves under
   Admin → Verifications. Their tracker and progress move into SNU on approval.

## 4. Faculty

Imported or invited by the SNU admin (Admin → Faculty). The role is fixed on the invited account;
nobody can pick a staff role at sign-up. "Faculty / staff" on the sign-in page explains this.

## 5. Acceptance run (before inviting students)

- [ ] Admin signs in with two-step sign-in; Structure shows Management → programmes → sections.
- [ ] One test student (a lead's own account) accepts an invitation on a phone and sees their section's classes.
- [ ] A self-signed-up test student requests to join; admin approves; the student's home shows SNU.
- [ ] A notice requiring acknowledgement reaches the test student; the receipt appears for the admin.
- [ ] Attendance and the planner show for the test student (or "Not connected yet" before attendance is marked).
- [ ] The test student files a grievance; it appears under Redressal with its due date.
- [ ] The demo (`/demo`) still opens the fictional college, and SNU does not appear in it.

## Demo isolation

The demo tenant is flagged `is_demo`; demo accounts can never be platform operators; demo data is
excluded from analytics and its jobs send no email or push; `demo:reset` only ever deletes a tenant
flagged as a demo (a real college is refused — covered by `tests/demo-tenant.test.ts`).

## Cost

Zero incremental: Render web service + Postgres already budgeted, local AI provider, no SMS/WhatsApp.
The only external service the pilot benefits from is an email sender for invitations and reminders.
CampusOS supports Resend (`EMAIL_PROVIDER=resend`); check its current free tier covers ~200
invitations plus weekly reminders. Without an email provider, each invitation link is returned to
the admin to share by hand (the pilot still works).
