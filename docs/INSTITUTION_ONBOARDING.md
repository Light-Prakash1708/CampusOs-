# Institution onboarding and verified membership

This document covers how a college goes from "no CampusOS" to "ready for a pilot", and how a student who signed up on their own becomes a verified student of that college.

## The two kinds of student

| State | Tenant | How they got there |
|---|---|---|
| **Personal student** | Their own private `PERSONAL` workspace | Self sign-up (`SELF_REGISTRATION_ENABLED`) |
| **College student** | The college (`COLLEGE`) | College invitation, CSV import, college registration policy, or an approved join request ("verified") |

The role is always `STUDENT`. No request body can set a role, a tenant or a user id.

## 1. Create the institution (platform operators)

A platform operator is an **active `SUPER_ADMIN`** whose email is listed in `PLATFORM_OPERATOR_EMAILS`. Both conditions are required. The role only comes from provisioning or an invitation, never from self sign-up.

- The first operator's account comes from `npm run provision` (for example, a "CampusOS HQ" institution).
- Operators see **Platform: create and manage institutions** on their admin dashboard, which opens `/admin/institutions`.

The wizard has four steps:

1. **Institution:** name, short name, slug, type, website, official email domain, city, state, country and timezone.
2. **Joining and modules:**
   - Joining is either *requests reviewed by the college* or *invitations and imports only*.
   - The college ID can be optional or required.
   - Choose whether the college is listed, and which modules are switched on. Modules use the existing feature flags.
3. **Administrator:** the person who becomes the college's `SUPER_ADMIN`.
4. **Review.**

The administrator is invited with a single-use, hashed, 7-day link. If email isn't configured, the link is shown once to the operator to pass on privately. Institution creation is audited in both the operator's tenant and the new tenant.

## 2. The college finishes setup (college administrator)

The admin dashboard shows **Set up your campus**. It is computed from real data, so progress is saved as you go:

- **Institution profile:** Settings.
- **Administrator:** at least one active administrator.
- **Academic structure:** `/admin/structure`, then **Add to your structure** for departments, programmes and sections.
- **Faculty:** `/admin/access`, invite as Faculty. Employee code and department are required. `/admin/faculty` lets you search, filter by status, resend or withdraw invitations, and suspend or restore access.
- **Students:** CSV import (`/admin/import`, with a preview before commit), invitations, or join requests.
- **How students join:** Settings → registration. Email domains are optional verification signals; the college ID requirement is set here.
- **Modules:** Settings → modules.
- **Mark ready for the pilot:** enabled once every step is done. It records `setup_completed_at`.

**Invitations:**

- A role is fixed on the invited account and cannot be changed by the recipient.
- Each link works once and expires in 7 days.
- Issuing a new link revokes the old one.
- **Withdraw** archives the placeholder account and kills every open link. Withdrawn invitations can be re-issued.

**Suspending access:**

- Suspending someone ends all their sessions on the next request (the session epoch is bumped) and blocks sign-in.
- Nobody can suspend themselves or a `SUPER_ADMIN` from here.

## 3. A personal student joins a college

1. The student opens `/student/join`. It is linked from their home banner and their profile.
2. They search for their college. Only active, listed colleges that accept requests appear.
3. They choose their department, programme, year, optional section and roll number, all validated against that college. They can attach a **college ID**; the college may require one.
4. The request is `PENDING`. The student sees what they sent (with the roll number masked) and can withdraw it.

**Reviewing** (`/admin/verifications`, permission `user:approve_registration`):

- The queue is paginated, oldest first, with tabs for each status.
- Automated **signals** are shown as hints only: email domain match, ID attached, roll number already used, an existing or invited college account with the same email. Nothing is approved automatically.
- **View college ID** streams the file privately and moves the request to `UNDER_REVIEW`.
- **Decline** requires a reason category. The optional note is plain text, 300 characters maximum, with control and bidirectional characters stripped. The student sees *"Your verification needs attention"* and can resubmit.
- **Approve** locks the request row, so a second reviewer gets "already approved", and then:
  - moves the **same account** into the college: same user id, email and password;
  - gives the student profile the college placement;
  - moves the student's own records (tracker, XP and achievements, notifications, files, AI history, privacy settings, opportunities). Every tenant table is classified MOVE or KEEP in `services/membership.ts`, and a test fails if a new table is missing from both lists;
  - archives the personal workspace, which keeps its history;
  - ends open sessions, so the student signs in again and lands in the college;
  - refuses, and changes nothing, if the college already has an active or invited account for that email, or if the roll number is taken.
- Requests nobody decides in 30 days become `EXPIRED`. This runs in the scheduled `sweep` job.

Statuses are `PENDING`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `WITHDRAWN` and `EXPIRED`. At most one request per student can be open at a time; a database constraint enforces this.

## College ID privacy

- **Stored as:** upload purpose `VERIFICATION_ID`. Accepted types are PDF, PNG, JPEG and WEBP, detected by content, not by extension. The maximum size is 8 MB, and executables are refused.
- **Who can read it:**
  - the student, through their own request;
  - reviewers at the college the request was sent to, while the request is open. Every view is audited, and the audit record contains no URL.
  - Nobody else. The generic `/api/files` route serves it to its owner only.
- **How it is served:** streamed with `no-store`, `nosniff` and a sandbox CSP, or through a 5-minute signed URL (S3 or Supabase Storage).
- **Never:** sent to OCR or AI providers, placed in public storage, or logged.
- **Storage needed:** a private storage provider (`STORAGE_PROVIDER=supabase` or `s3`). With `STORAGE_PROVIDER=none`, students can still send requests without an ID, unless the college requires one; the UI says so.

## Configuration

| Variable | Purpose |
|---|---|
| `SELF_REGISTRATION_ENABLED` | Allows personal student sign-up |
| `PLATFORM_OPERATOR_EMAILS` | Comma-separated operator emails. The account must also be an active `SUPER_ADMIN`. |
| `STORAGE_PROVIDER` and the `STORAGE_*` variables | Required for college ID uploads |

## Limitations and next steps

- No OCR or external identity verification. The provider-free signals are designed so a verification provider can be added later.
- A college student cannot move to another college by request. That needs an invitation from the new college, which creates a separate account.
- Records tied to a personal workspace's own events stay in the archived workspace.
- There is no demo institution for prospective colleges in production. The development seed (`db:seed`) is for local use only.
- The first platform operator needs `npm run provision` once.
