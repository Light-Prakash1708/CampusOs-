# Issue log

Classify **before** acting:

| Class | Meaning | Action |
|---|---|---|
| **A: Production blocker** | Deploy or auth failure, data corruption, tenant-isolation or security issue, broken migration, email failure, critical flow down | Fix immediately |
| **B: Pilot blocker** | The college can't import, students can't join, required notices / grievances / evidence pack don't work, an admin can't follow the workflow | Fix before the pilot proceeds |
| **C: Bug** | Behaviour contrary to existing requirements | Fix, and add a regression test |
| **D: Usability friction** | It works, but people struggle | Fix only if repeated and material; the smallest copy, ordering or component change |
| **E: Feature request** | Something new | Log it in FEATURE_REQUESTS.md; don't build it |
| **F: Strategic signal** | Suggests the wedge, buyer, pricing or positioning is wrong | Stop and analyse before coding |

| ID | Date | Reported by (role) | Class | Description (their words where possible) | Evidence | Action / commit | Status |
|---|---|---|---|---|---|---|---|
| I-001 | 2026-09-27 | Engineering (pre-deploy review) | C | Without their own keys, two-step sign-in secrets and analytics hashes derive from `AUTH_SECRET`; rotating it would lock out every administrator using two-step sign-in | `src/lib/auth/totp.ts` key derivation | `render.yaml` now generates `MFA_ENCRYPTION_KEY` and `ANALYTICS_HASH_KEY`; regression test in `render-blueprint.test.ts` | Fixed |
| I-002 | 2026-09-27 | Engineering (pre-deploy review) | B | Import instructions said departments and programmes are imported; they are created on screen (Admin → Structure), and there were no column templates | `src/services/import.ts` entities | ADMIN_GUIDE and PILOT_GUIDE corrected; header templates added | Fixed |
| I-003 | 2026-09-27 | Engineering (pre-deploy review) | B | Each 10-minute scheduler call delivered at most 100 external notifications, so a required notice emailed to 1,000 students took over 1.5 hours to reach the last inbox. That weakens wedge outcome 1. | `processDeliveryQueue` limit 100; one call per cron run | `drainNotifications` repeats plan → deliver within one call until the queue is empty (60 s budget, `JOBS_DRAIN_BUDGET_MS`; leased, skip-locked claims, so no double sends). Regression test `notification-drain.test.ts`. Real throughput also depends on the email provider's rate limit; measure at go-live (PRODUCTION_SMOKE_TEST D4). | Fixed; measure in production |
| I-004 | 2026-09-27 | Engineering | C (test only) | `foundation-integration` "plans external deliveries" fails when the local database holds more than 500 unplanned notifications from earlier E2E runs: the planner takes the oldest 500 platform-wide. It passes on a clean database, and CI runs E2E in a separate database. | Local run after repeated E2E | None needed for production. Reset the local database before the full suite after E2E runs. | Noted |
| I-005 | 2026-09-27 | Engineering (E2E) | C (unconfirmed) | Once in 34 E2E runs, a student's grievance was created but the browser stayed on the "Raise a case" form with no error. A student could then submit it twice. | Server shows the case created (06:35:30); page snapshot shows the filled form; not reproduced in 33 later runs (5 targeted, 3 full suites plus earlier runs) | Watch it: PRODUCTION_SMOKE_TEST S5 checks the case page opens. If it recurs, investigate the `router.push` then `router.refresh` sequence in `NewCaseForm.tsx`, and consider a duplicate-submission guard. | Monitoring |
| I-006 | 2026-09-27 | Engineering (E2E on a fresh database) | C (test only) | The join-college E2E searched for "Demo", which only matched a leftover test college in the long-lived local database. On a fresh seed (as in CI) it would fail. | Fresh-database E2E run | The test now searches for the seeded college ("Kolkata Business") | Fixed |
