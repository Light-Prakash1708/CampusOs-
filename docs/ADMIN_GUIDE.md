# Admin guide (college office)

This guide is for the academic office, the IQAC and the college's super admin. Everything below is in the admin portal (`/admin`).

## First day

1. **Secure your account.**
   - Go to Account → Security (`/account/security`) and turn on two-step sign-in with any authenticator app.
   - Save the 10 recovery codes somewhere safe.
   - Super admins must do this in production before anything else works.
2. **Import your data** (Admin → Data Import).
   - Upload CSVs for departments, programmes, sections, faculty and students.
   - Overlay mode keeps your ERP as the source of truth. Re-import whenever it changes.
3. **Settings.** Set the minimum attendance percentage, the grievance categories and the working days.
4. **Grievance committee** (Admin → Redressal → Committee).
   - Add the Student Grievance Redressal Committee (SGRC) members and the Ombudsperson.
   - Record the attestation.
   - UGC 2023 regulations: the SGRC decides within 15 working days; a student may appeal within 15 days; the Ombudsperson has 30 days.
5. **Invite people.**
   - Send invitations from Admin → Students / Faculty.
   - Students who signed up on their own can ask to join; approve them in Admin → **Verification** after checking their roll number.

## Verified notices

- **Compose** (Admin → Verified Notices, or Faculty → Announcements).
  - Choose the audience (whole college, department, programme, year, section, course or role).
  - Tick **Requires acknowledgement** for anything students must confirm, and optionally set a deadline.
- **Open a notice to see:**
  - delivered, read and acknowledged counts;
  - the list of students who haven't acknowledged (CSV download);
  - when an automatic reminder went out.
- **Only staff who can manage notices see receipts.** Students never see who else has read something.

## Attendance

- Faculty mark attendance, or you import it.
- Students see their own standing against the minimum.
- Staff dashboards show **attention signals**, for example "below minimum in 2 courses" or "3 assignments not submitted".
  - Every signal shows its reason.
  - There are no risk scores and no rankings.
  - Signals are for a conversation, not a penalty.

## Grievances

- **Cases** arrive in Admin → Redressal with their category, SLA and statutory due date.
- **Anonymous cases** hide the student's identity from handlers.
- **Overdue cases** escalate automatically.
- **Appeals** go to the Ombudsperson, who sees them in their own queue.

## Evidence & Reports

- Go to Admin → Evidence & Reports → Evidence pack.
- Pick a date range (up to about a year) and download the ZIP. It contains `summary.html`, plus CSVs for communication, grievances, attendance by programme and participation.
- It contains aggregates only.
  - Student-level rows need the `data:export` permission and a separate tick.
  - Every export is recorded in the audit log.
- The figures match the notice receipts and Campus Insights because they come from the same calculations.
- **Describe, don't claim.** "92 % of required notices were acknowledged within 48 hours" is a fact. "CampusOS improved communication" needs a comparison you don't have.

## Modules

New colleges start with the core modules. The others can be turned on in Admin → Settings → Modules; existing colleges keep what they had. Modules marked **Planned** aren't built yet.

## Privacy duties

- Students see the privacy notice on first sign-in, and their acceptance is recorded.
- Access & Privacy (Admin → Access & Privacy) handles data export and erasure requests.
- External AI processing is **off** by default (`ai_external_processing_enabled`). Turn it on only after your data-protection review.

## If someone loses their phone

An administrator with `institution:manage` can reset another person's two-step sign-in from their faculty/admin profile. It can't be done for yourself; ask another administrator. The person's sessions end, and the reset is audited.
