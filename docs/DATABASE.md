# Database

PostgreSQL 16. 69 tables. Schema in `src/lib/db/schema/`, integrity guarantees
in `drizzle/0001_hard_constraints.sql`.

## Multi-tenancy

Every table except `institutions`, `sessions` and `job_queue` carries
`institution_id` with a cascading foreign key. There is no default tenant and
no global data.

Scoping is enforced in application code (every service derives the tenant from
the `AuthContext`) and asserted by an integration test that walks
`information_schema` and fails if any table lacks the column.

For deployments that want defence in depth, PostgreSQL Row-Level Security can
be layered on top by setting `app.institution_id` per connection; the schema is
already shaped for it. Not enabled by default because it complicates connection
pooling, which is the wrong trade for a single-college deployment.

## Hierarchy

```
institutions
 └── campuses
      └── departments
           └── programs
                └── sections ──── students
                     │
                     └── course_offerings ── subject × section × faculty × term
                          ├── timetable_entries      (when and where it meets)
                          ├── attendance_sessions    (each meeting)
                          ├── assignments
                          └── enrollments
```

`course_offerings` is the pivot: it is what gets scheduled, what attendance
attaches to, and what assignments belong to.

## Integrity guarantees

These are the constraints that make the product's claims true. They live in the
database because the UI and the service layer can both be bypassed, and because
two concurrent requests can pass an application-level check and still collide.

### No double-booking

```sql
CREATE UNIQUE INDEX timetable_room_slot_uq
  ON timetable_entries (version_id, room_id, time_slot_id)
  WHERE is_cancelled = false AND room_id IS NOT NULL;

CREATE UNIQUE INDEX timetable_faculty_slot_uq  -- same shape for faculty
CREATE UNIQUE INDEX timetable_section_slot_uq  -- same shape for sections
```

Two administrators assigning Room 301 at the same instant: one commits, the
other receives `23505`, which `src/lib/api.ts` maps to
*"That room is already booked for this period."* with alternatives attached.

### One published timetable per term

```sql
CREATE UNIQUE INDEX timetable_one_published_per_term_uq
  ON timetable_versions (term_id) WHERE status = 'PUBLISHED';
```

Publishing archives the previous version inside the same transaction, so there
is never an instant with two live timetables or none.

### Append-only history

```sql
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION campusos_block_audit_mutation();
```

Applied to `audit_logs` and `grievance_events`. An administrator cannot quietly
delete a complaint or edit the record of what they did. The only code that ever
disables these triggers is the development seed's tenant reset, which refuses to
run when `NODE_ENV=production`.

### Sanity constraints

`time_slots.end_time > start_time` · `events.ends_at > starts_at` ·
`terms.end_date >= start_date` · `leave_requests.to_date >= from_date` ·
`rooms.capacity > 0` · `attendance_summaries.percentage_bp BETWEEN 0 AND 10000` ·
`student_skills.proficiency BETWEEN 0 AND 100` ·
`grievances.satisfaction_rating BETWEEN 1 AND 5`.

The events constraint caught a genuine bug in the seed on first run — events
that ended at the instant they began.

### Full-text search

`resources.search_vector` is a **generated** `tsvector` (title weighted A,
topic B, description C, extracted text D) with a GIN index. Generated means it
cannot drift from the row: there is no trigger to forget and no background job
to fall behind.

## Concurrency

**Optimistic locking.** `timetable_entries.version` increments on every edit.
A move sends the version it last saw; if it no longer matches, the update
affects zero rows and the caller is told someone else changed it — rather than
silently overwriting their work.

**Transactions.** Every multi-row operation is wrapped: publishing a timetable
(archive + publish + change event), committing an import, acknowledging a notice
(recipient row + denormalised counter), marking attendance (records + session
counts + summaries).

**Denormalised counters** (`announcements.read_count`, `attendance_sessions.
present_count`) are maintained inside the same transaction as the rows they
count, so they cannot disagree with reality.

## Soft deletion

Records a college may need to produce later — students, faculty, subjects,
rooms, sections, announcements, assignments — carry `deleted_at` and are never
hard-deleted. Every query filters on `isNull(deletedAt)`.

Grievances have no `deleted_at` at all. `WITHDRAWN` and `CLOSED` are the only
terminal states, and both keep the record.

## Numeric precision

Attendance percentages are stored as **basis points** (`7550` = 75.50%) rather
than floats, so a student is never one rounding error away from an attendance
shortage. Money-like and hour values use `numeric`, never `float`.

## Migrations

```bash
npm run db:push          # sync schema (development)
npm run db:generate      # emit a SQL migration (production)
npm run db:constraints   # apply 0001_hard_constraints.sql
```

`db:push` is for development. Production applies generated migrations followed
by the constraints file, which is idempotent (`IF NOT EXISTS`, `DROP … IF
EXISTS` before each `ADD CONSTRAINT`).
