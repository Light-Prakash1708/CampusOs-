# Attendance Planner ("Bunk Calculator")

`/tools/attendance-planner` (alias `/tools/bunk-calculator`). Primary name
**Attendance Planner**; "Bunk Calculator" is the familiar subtitle. It is a
planning and risk-awareness tool: it shows the buffer to keep for illness and
emergencies and exactly what recovery takes. It never writes attendance.

## Inputs (all real)

The student's recorded classes per subject (from `services/attendance`), each
subject's minimum, the college's overall rule if any, and remaining scheduled
classes from the published timetable.

## Maths (`src/lib/attendance/planner.ts`, shared by server, browser, tests)

Integers throughout: a target *T*% is `T×100` basis points and "at or above"
means `attended × 10000 ≥ Tbp × held` — no float decides the line.

| Quantity | Formula |
|---|---|
| Current % | `attended ÷ held` (null when held = 0) |
| Safe absences | largest *k*: `attended×10000 ≥ Tbp×(held+k)` → `⌊(attended×10000 − Tbp×held) ÷ Tbp⌋`, 0 if below |
| Classes to reach target | smallest *x*: `(attended+x)×10000 ≥ Tbp×(held+x)` → `⌈(Tbp×held − attended×10000) ÷ (10000 − Tbp)⌉`; **null** when T = 100% and a class was missed |
| After missing *n* | `attended ÷ (held+n)` |
| After attending *n* | `(attended+n) ÷ (held+n)` |
| Mixed plan | `(attended+a) ÷ (held+a+m)` |
| Best case this term | attend every remaining scheduled class |

Both closed forms are verified against brute force for every
`0 ≤ attended ≤ held ≤ 40` across eight targets.

## Edge cases

| Case | Behaviour |
|---|---|
| 0 classes | "No classes marked yet"; planner shows an empty state |
| 100% attendance | Buffer computed normally (10/10 @75% → 3) |
| 0% attendance | Classes to recover computed (0/10 → 30 to reach 75%) |
| Target = current | "You're exactly at T% — the next absence takes you below it" |
| Target below current | Larger buffer; if below the college minimum, a warning that the minimum still decides eligibility |
| Target above achievable | 100% after a miss: "isn't possible any more"; beyond the term: "best you can reach is X%" |
| Subject below minimum | "Attend the next N classes" (+ weeks at the current timetable) |
| Several subjects below | Advisor lists each, most urgent first |

## UI

Scope chips (Overall + each subject; `?subject=` deep link), current overview
ring with the minimum tick, target slider (50–100%, keyboard accessible, "Use
minimum"), live answer card, "What if I miss / attend 1–5" tables, "Try your
own plan" steppers, subject-wise buffer at each subject's own minimum, and
links to trend/history and CSV export. Disclaimer on every result:
*Calculations are estimates based on recorded classes and your selected
target. Institutional attendance policies may differ.*

Tests: `tests/attendance-planner.test.ts`.
