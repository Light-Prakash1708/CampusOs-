# Pilot metrics (weekly)

**Every Monday, collect the weekly numbers.**

1. Sign in as the platform operator.
2. Open `/admin/metrics` → By college → **Weekly CSV** for the pilot college. The CSV covers the last 180 days by default. The same data is available from `GET /api/admin/institutions/<id>/pilot-metrics?from=YYYY-MM-DD&to=YYYY-MM-DD`.
3. Save the CSV as `metrics/<college>-<date>.csv`, in a private place: it is college data, even though it is aggregate.
4. Copy the newest week into the table below.

**What the numbers mean.** Definitions are in `src/services/pilot-metrics.ts`. They are computed read-only from existing records and are aggregates only. Every export is audited (`PILOT_METRICS_EXPORTED`).

**Describe, don't attribute.** "81 % acknowledged within 48 h" is a fact. "CampusOS raised acknowledgement" needs a baseline that we don't have.

## Numbers from the CSV

| Week (Mon) | Enrolled | Activated | Weekly active students | Staff active | Required notices | Ack ≤ 48 h | Median ack (h) | Pending now | Reminders | Grievances opened / resolved | SLA breaches | Appeals | Evidence packs | Signal views |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Numbers only people can give (record in FEEDBACK_LOG too)

| Week | Evidence pack used in a real institutional process? (what, where) | Support requests | Workflows still on WhatsApp | Staff time (self-reported, labelled as such) |
|---|---|---|---|---|

## Wedge scorecard (fill in at week 8 and at the end)

| Outcome | Evidence | Met? |
|---|---|---|
| 1. Required notices reliably reach and are acknowledged by students | | |
| 2. The SGRC workflow is used and produces resolution-time evidence | | |
| 3. The evidence pack is used in a real IQAC or institutional process | | |
