# Redressal (Grievance) System

## Design commitments

1. **A case can never be deleted.** `WITHDRAWN` and `CLOSED` are the only
   terminal states; both keep the record. `grievances` has no `deleted_at`.
2. **Every transition is immutable.** `grievance_events` rejects UPDATE and
   DELETE at the database level.
3. **Deadlines are automatic.** Escalation is a pure function of the clock, not
   of anyone remembering.
4. **Anonymity is real.** See below.

These exist because the failure mode of a complaints system is not a bug — it is
a complaint that quietly disappears. Making that structurally impossible is the
whole point.

## Workflow

```
SUBMITTED → ACKNOWLEDGED → ASSIGNED → UNDER_REVIEW ⇄ AWAITING_INFORMATION
                                           ↓
                                  RESOLUTION_PROPOSED → RESOLVED → CLOSED
                                                            ↓
                                                        REOPENED
```

Transitions are validated against an explicit table. An invalid move returns
409 with the valid next steps, rather than silently doing nothing. The raiser
may withdraw, reopen or close their own case; everything else needs a handler
capability.

## SLA

Each category configures response and resolution deadlines in **working hours**
(Mon–Sat, 09:00–17:00). A complaint raised at 4pm on Saturday is not "late" by
Monday morning — counting calendar hours would produce breaches that are not
real and destroy trust in the metric.

`runEscalationSweep()`:

- **6 working hours before the deadline** — warns the assignee once (idempotent;
  it checks for an existing `SLA_WARNING` event).
- **After the deadline** — marks `is_sla_breached`, increments
  `escalation_level`, writes an `SLA_BREACHED` event, and notifies the
  category's escalation authority with a mandatory `CRITICAL` notification.

Driven by `POST /api/jobs/run` from ordinary cron. Because it is clock-driven
and idempotent, a missed run self-corrects on the next one. On the seeded data
it escalated 4 overdue cases on first run.

## Routing

Rule-based, deliberately not model-driven — routing determines who reads a
complaint, and that must be predictable and auditable.

Each category has a default department and assignee; a new case is auto-assigned
and the assignee notified. `suggestCategory()` offers a keyword-based hint when
someone is choosing a category, with a confidence figure and the reason
("Matched 3 keywords associated with Attendance"). It is advisory only.

## Anonymity

When a category permits it and the raiser chooses it:

- `getGrievance()` returns `raisedByName: null` unless the caller holds
  `grievance:reveal_anonymous`.
- That capability is **not** granted to `ADMIN` — only `SUPER_ADMIN`.
- Every use writes a `GRIEVANCE_ANONYMITY_REVEALED` audit record.
- The `CREATED` timeline event records **no actor**, so the history cannot be
  used to deanonymise.
- Message authorship is masked in the same way.
- The CSV export omits raiser identity entirely, so an export cannot be used to
  route around the guarantee.

Anonymity that an administrator can casually undo is not anonymity. This is the
difference between a checkbox and a commitment.

## Internal notes

Handlers can post notes flagged `is_internal_note`. These are filtered out of
the raiser's view at the query level, not hidden in the UI — a difference that
matters if anyone ever inspects a network response.

## Linking to the disputed record

A case can reference the record it is about (`related_entity_type` /
`related_entity_id`). An attendance dispute links to the attendance record, so
resolving it can correct the record and the correction carries the case number
in `correction_grievance_id`. The dispute and its outcome stay connected.

## SGRC, Ombudsperson and UGC 2023 timelines (CAMPUSOS-011)

CampusOS **supports** a structured grievance workflow aligned with the UGC (Redressal of Grievances of Students) Regulations, 2023. It does not certify compliance; the college remains responsible for meeting the regulations. Timelines were verified against the regulation text; see strategy audit §10a.

| Step | Regulation | What CampusOS does |
|---|---|---|
| SGRC report | "preferably within 15 working days" | `grievances.statutory_due_at` is computed at creation. Sundays and the college's own holidays are excluded, so the result is an approximation of working days. It is shown to the student, the handler and the evidence pack. |
| Appeal | Student may appeal to the Ombudsperson "within 15 days" of the decision | The raiser sees **Appeal to the Ombudsperson** for 15 days after the case is resolved or closed. `appealGrievance()` records the reason (plain text, 2,000 characters maximum), sets status `APPEALED` and notifies the Ombudsperson. |
| Ombudsperson | Resolves "within 30 days" of the appeal | `ombudsperson_due_at` is set. **Only a user listed as Ombudsperson** can move an `APPEALED` case to `RESOLVED` or `CLOSED`. Ordinary handlers cannot. |

**Committee** (`/admin/redressal/committee`, permission `grievance:configure`):

- Positions are chairperson, member, student special invitee and Ombudsperson. The chairperson and members must be staff; the invitee must be a student. There is one chair.
- A checklist shows whether the chair, four members, the invitee and the Ombudsperson are in place.
- The regulation's representation rules (at least one woman; at least one SC/ST/OBC member) are **confirmed by the college as an audited attestation**. CampusOS never collects or stores anyone's gender or social category for this.
- An external Ombudsperson (for example, a retired judge) is invited as a **Management** user, then added here. They can open appealed cases through their notification, even without other redressal permissions.

Every change to committee membership or attestations is audited as `GRIEVANCE_COMMITTEE_UPDATED`. Appeals are audited as `GRIEVANCE_ESCALATED` and appear in the case's immutable timeline as `APPEALED`.
