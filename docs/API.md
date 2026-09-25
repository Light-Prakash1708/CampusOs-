# API Reference

## Envelope

Every route returns the same shape.

```jsonc
// success
{ "ok": true, "data": { … } }

// failure
{ "ok": false, "error": {
    "code": "CONFLICT",
    "message": "Room 302 is already occupied in this period.",
    "hint": "Pick one of the suggested alternatives, or free the resource first.",
    "details": { "conflicts": [...], "alternatives": [...], "impact": {...} }
} }
```

`message` is what the user reads. `hint` is what they should do next. There is
no bare "Something went wrong" anywhere in the product.

## Status codes

| Code | Meaning |
|---|---|
| 200 / 201 | Success |
| 401 | Not authenticated — session ended or absent |
| 403 | Authenticated but lacks the capability |
| 404 | Not found, or not visible to this caller |
| 409 | Conflict — double-booking, invalid transition, stale version |
| 422 | Validation failed; `details[]` lists field errors |
| 423 | Account locked after repeated failures |
| 500 | Unexpected; includes a `requestId` for correlation |
| 503 | Database unreachable (health check only) |

## Endpoints

### Auth
| Method | Path | Capability | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | — | Lockout after 8 failures; uniform failure message |
| POST | `/api/auth/logout` | authenticated | Revokes the server-side session |

### Health
| Method | Path | Capability |
|---|---|---|
| GET | `/api/health` | — |

Returns database connectivity, latency and active AI provider. 503 when the
database is unreachable.

### Timetable
| Method | Path | Capability | Notes |
|---|---|---|---|
| POST | `/api/timetable/generate` | `timetable:generate` | Runs the solver → new PROPOSED version. Returns the report, unplaced sessions with reasons, and which requirements were understood vs not |
| POST | `/api/timetable/publish` | `timetable:publish` | Requires a reason; archives the previous version, writes change events, notifies |
| POST | `/api/timetable/check` | `timetable:view_all` | Dry-run conflict check with alternatives — writes nothing |
| PATCH | `/api/timetable/entry` | `timetable:edit` | Moves a period. Requires a reason. 409 with alternatives on conflict; `expectedVersion` for optimistic locking; `acceptWarnings` to override a non-blocking warning |

### Communication
| Method | Path | Capability | Notes |
|---|---|---|---|
| POST | `/api/announcements` | `announcement:create_*` | Publishes, or saves PENDING_APPROVAL if the author lacks official rights |
| PUT | `/api/announcements` | `announcement:create_*` | Dry-run audience resolution — returns reach and breakdown |
| POST | `/api/announcements/[id]/acknowledge` | authenticated recipient | Idempotent |
| POST | `/api/announcements/[id]/read` | authenticated recipient | Idempotent |

### Redressal
| Method | Path | Capability |
|---|---|---|
| POST | `/api/grievances` | `grievance:raise` |
| GET | `/api/grievances` | `grievance:view_own` (scope widens with capability) |
| POST | `/api/grievances/[id]/messages` | raiser or handler |
| POST | `/api/grievances/[id]/transition` | handler (raiser may withdraw/reopen/close) |

Invalid transitions return 409 listing the valid next steps.

### Approvals
| Method | Path | Capability |
|---|---|---|
| POST | `/api/approvals` | `timetable:approve_change` \| `announcement:approve` \| `leave:approve` |

On approval the stored payload is re-validated and executed. If execution fails
the approval stays `PENDING` and returns 409 — it is never marked done for work
that did not happen.

### Data import
| Method | Path | Capability | Notes |
|---|---|---|---|
| POST | `/api/import/validate` | `data:import` | **Writes nothing.** Returns mapping, per-row errors, preview |
| POST | `/api/import/commit` | `data:import` | Transactional; imports validated rows only |

### Reports
| Method | Path | Capability |
|---|---|---|
| GET | `/api/reports/{attendance\|workload\|utilization\|grievances\|communication}` | `report:generate` |

Streams CSV generated at request time. Every export is audited. The grievance
export omits raiser identity.

### AI
| Method | Path | Capability |
|---|---|---|
| POST | `/api/ai/ask` | `ai:use_assistant` |

Returns the answer plus `citations`, `toolsUsed`, `grounded`, `provider` and
token usage. `grounded: false` means no institutional record backed the answer,
and the UI says so.

### Search
| Method | Path | Capability |
|---|---|---|
| GET | `/api/search?q=` | authenticated |

Permission-filtered at the query level across classes, notices, resources,
rooms, people and cases.

### Scheduled jobs
| Method | Path | Auth |
|---|---|---|
| POST | `/api/jobs/run` | `x-cron-secret` header, or an administrator session |

Runs SLA escalation, scheduled publishing and expiry. Idempotent.

```bash
curl -X POST https://campus.example.edu/api/jobs/run -H "x-cron-secret: $CRON_SECRET"
```
