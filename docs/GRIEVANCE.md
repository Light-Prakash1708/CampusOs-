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
