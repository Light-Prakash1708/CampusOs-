# Career Mode

Career Mode brings together four things:

- the existing Skill & Employability Engine (`/student/skills`, flag `skill_engine_enabled`);
- target roles that students pick themselves;
- the **Opportunity Hub**: internships, jobs, hackathons, competitions,
  scholarships and fellowships (`/student/opportunities`, flag
  `opportunity_hub_enabled`, off by default);
- a private application tracker.

## No invented listings

CampusOS ships no listings of its own, and no seed creates any. A listing
exists only if a real source put it there.

| Source | How it arrives | Students see it |
|---|---|---|
| **College** (`opportunity:manage`: ADMIN) | Admin → Opportunities → Publish a listing | At once |
| **Student** (`opportunity:submit`) | Opportunities → Share one | After a moderator approves it. A rejection needs a reason, which is sent to the submitter. |
| **Feed** | Admin → Opportunities → Import (a configured feed) | After a moderator approves each item |

Every card says where the listing came from. Moderators are nudged to check the
organiser's own link; a listing without one is flagged. Links must be
http(s), enforced by zod and a database CHECK.

## For students

**Discover:**

- Shows published listings at the student's college: whole-college ones, plus
  any aimed at their department.
- Listings past their deadline drop out.
- Can be filtered by type and searched by role, organisation or skill.

**Skill match:**

- Each listing's skills are compared with the student's own skill profile
  (skills at proficiency 40 or above), case-insensitively.
- It shows "You have 2 of 3", with the matched skills highlighted. This is a
  plain comparison, not a prediction.

**My applications** is a private tracker:

- Statuses are Saved, Applied, Interviewing, Offer, Not selected and Withdrawn,
  with an optional note. Only the student can see it.
- Tracked items stay after their deadline.
- Administrators see only how many students applied to a listing, never who.

**Other places Career Mode appears:**

- **Your Day** reminds the student about Saved listings that close today or tomorrow.
- **Target role:** on `/student/skills` a student picks, changes or clears
  their own primary goal from the college's role catalogue
  (`POST /api/career/goal`). Readiness, gaps and the gap plan follow that
  choice. Before this, only the placement cell could set it.
- **Openings that fit your skills:** `/student/skills` shows the three open
  listings whose skills best overlap the student's profile.
- **Tools:** the "Internships & Jobs" tool is live, and its card shows how many
  listings are open and how many match at least half of the student's skills.

## Opportunity feeds (provider architecture)

`src/services/opportunities/providers.ts` defines `OpportunityFeedProvider`.
Providers only fetch and validate. The service imports valid items as PENDING
and skips ones already imported (unique on college + feed + item id), so a
re-run is safe. It also skips items that are past their deadline.

| `OPPORTUNITY_FEED_PROVIDER` | Needs | Behaviour |
|---|---|---|
| `none` (default) | — | The import button explains that no feed is configured |
| `json-feed` | `OPPORTUNITY_FEED_URL` (https in production), optional `OPPORTUNITY_FEED_TOKEN` (sent as a Bearer token) | GETs a JSON array, or `{ items: [...] }` |

`json-feed` limits: 10-second timeout, no redirects, 2 MB, 500 items. Each item
is validated separately with zod; invalid ones are counted and shown to the
admin.

Feed item format:

```json
{
  "id": "partner-2026-117",
  "kind": "INTERNSHIP",
  "title": "Finance intern (summer)",
  "organization": "Example Pvt Ltd",
  "description": "…",
  "location": "Salt Lake, Kolkata",
  "workMode": "HYBRID",
  "compensation": "₹15,000/month",
  "applyUrl": "https://example.com/careers/117",
  "deadline": "2026-10-15T18:29:00Z",
  "eligibility": "2nd/3rd-year BBA",
  "skills": ["Excel", "Financial modelling"]
}
```

- `kind` is one of `INTERNSHIP` `JOB` `HACKATHON` `COMPETITION` `SCHOLARSHIP` `FELLOWSHIP`.
- `workMode` is one of `ONSITE` `REMOTE` `HYBRID`.

To add another provider (for example a job-board API):

1. Implement the interface.
2. Register it in `getFeedProvider()`.
3. Add its variables to `src/lib/env.ts` (with a production check) and `.env.example`.
4. Test it with `fetch` mocked, as `tests/opportunities.test.ts` does for `json-feed`.

## Data and privacy

- **Migration 0008** adds `opportunities` (CHECKs on kind, status, source, work mode and link) and `opportunity_tracking`.
- **Audit:** `OPPORTUNITY_CREATED`, `OPPORTUNITY_MODERATED` and `OPPORTUNITY_IMPORTED`.
- **Export:** the data export includes the student's tracker and the listings they shared.
- **Account deletion** removes the tracker. Shared listings stay as college records.

## API

| Method and path | Who | Purpose |
|---|---|---|
| `GET /api/opportunities?kind=&q=&tracked=1` | students | Listings, with skill match and my status |
| `POST /api/opportunities` | students or staff | Share (pending) or publish (staff) |
| `POST /api/opportunities/:id/track` | students | `{ status, note? }`; `status: "NONE"` stops tracking |
| `POST /api/opportunities/:id/moderate` | staff | `APPROVE`, `REJECT` (with a reason) or `CLOSE` |
| `POST /api/opportunities/import` | staff | Import the configured feed |
| `POST /api/career/goal` | students | `{ careerRoleId }`, or `null` to clear |
