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

### Event capacity

`campusos_event_registration_guard` runs before every insert into
`event_registrations`, and before any update that changes a row to
`REGISTERED`. It locks the event row (`SELECT … FOR UPDATE`), counts current
`REGISTERED` rows, and raises `23514` when the event is full or its deadline
has passed. Concurrent registrations therefore serialise on the event, and the
service turns the refusal into a waitlist place. Verified by a test that fires
12 simultaneous registrations at a 5-seat event: exactly 5 are registered and 7 waitlisted.

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

Versioned SQL in `drizzle/migrations`, applied in order by `npm run db:migrate`
(`scripts/migrate.ts`, Drizzle's migrator, one transaction, history in
`drizzle.__drizzle_migrations`). Safe to run on every deploy; it never drops
anything.

| Migration | Contents |
|---|---|
| `0000_baseline` | The v1 schema (69 tables), generated by drizzle-kit. |
| `0001_hard_constraints` | Hand-written integrity guarantees (partial unique indexes, checks, append-only triggers, generated `tsvector`). Idempotent. |
| `0002_auth_privacy_foundation` | 2.0 Phase 1: roles `CLUB_ADMIN`/`EVENT_ORGANIZER`/`CAMPUS_REP`, user status `PENDING`, channel `WHATSAPP`; `users.email_verified_at`, `users.password_changed_at`; `institutions.registration_policy`, `institutions.is_listed`; `notifications.delivery_planned_at`; tables `auth_tokens`, `auth_identities`, `rate_limit_buckets`, `stored_files`, `notification_deliveries`, `push_subscriptions`, `privacy_preferences`, `consent_records` (append-only), `data_retention_policies`, `data_export_requests`, `data_deletion_requests`; backfills; repair of `resources.search_vector`. |
| `0003_events_discovery` | 2.0 Phase 3 (Events): discovery columns on `events` (category, visibility, organiser type/name, verification, mode, city/area/coordinates, price, team size, eligibility, rules, prizes, agenda, FAQs, tags, registration mode, waitlist, source, moderation note); `event_registrations.status`/`code`/`attendee_institution_id`/`team_name`; tables `event_saves`, `event_checkins` (one per registration), `event_certificates` (unique verification code; one per registration and kind), `event_updates`, `event_reports` (one per event and reporter); check constraints on every enum-like text column; trigger `campusos_event_registration_guard` (capacity + deadline, row-locks the event); backfills for v1 rows. |
| `0004_tools_hub` | Student OS Phase 1: `tool_usage` (one counter per student per tool, unique on user and tool, `open_count >= 1`); rewrites stored notification `action_url`s from `/readdressal` to `/redressal` after the route rename. |
| `0005_attendance_planner` | `institutions.attendance_policy` jsonb (default `{}`, CHECK object): default minimum, warning margin, optional overall minimum. |
| `0006_tracker_gamification` | `tracker_goals`, `tracker_goal_steps`, `tracker_checkins` (one row per goal per local day), `tracker_tasks`, `xp_events` (append-only ledger: UPDATE blocked by trigger; unique `(user_id, idempotency_key)`), `user_achievements`. CHECKs on categories, cadences, statuses, targets, amounts and XP sources. See `GAMIFICATION.md`. |
| `0007_library` | `library_books` (unique ISBN per college), `library_loans` (one open loan per title per person), `library_reservations` (one open reservation per title per person; status CHECK), `resource_saves`. See `LIBRARY.md`. |
| `0008_opportunities` | `opportunities` (source COLLEGE/STUDENT/FEED; unique feed item per college; CHECKs on kind, status, work mode and http(s) link), `opportunity_tracking` (one private status per student per listing). See `CAREER.md`. |
| `0009_audit_indexes` | Indexes for file downloads (`resources.file_url`), certificates by event, the library desk and reservation queue, and saved-resource lookups. Plain `CREATE INDEX` (tables are small at this stage; use `CONCURRENTLY` by hand on a large live database). |
| `0010_institution_kind` | `institutions.kind` (`COLLEGE` default, or `PERSONAL` for a self-registered student's private workspace) with a CHECK constraint. Additive; existing rows become `COLLEGE`. See `AUTH.md`. |

**Baselining v1 databases.** Databases created by v1 with `db:push` have no
migration history. The runner detects that (tables present, history empty),
records 0000/0001 as applied, re-asserts the idempotent constraints, and then
applies 0002 onwards. Verified: a baselined v1 database and a fresh database
end up with byte-identical `pg_dump --schema-only` output.

**Workflow for a schema change.**

```bash
# 1. edit src/lib/db/schema/*.ts
npm run db:generate -- --name short_description   # writes drizzle/migrations/NNNN_*.sql
# 2. review the SQL; append hand-written constraints/triggers/backfills below
#    a `--> statement-breakpoint` line
npm run db:migrate
# 3. add tests; run npm test
```

**Rollback.** Migrations are forward-only. Each is additive (new tables,
nullable/defaulted columns), so the previous application version keeps working
against the newer schema — roll back the *code*, not the database. PostgreSQL
cannot remove enum values; enum additions are listed above so a reverse
migration is never assumed. To undo a table addition, write a new migration.

**Development helpers.** `npm run db:push` syncs the schema without history
(prototyping only). `npm run db:reset` drops and rebuilds a *local* database from
migrations and re-seeds; it refuses to run in production or against a non-local
URL unless `ALLOW_REMOTE_RESET=true`.

### Defects repaired in 0002

- **D11** — v1's `db:push` created `resources.search_vector` as a plain column,
  so the constraints file's `ADD COLUMN IF NOT EXISTS … GENERATED` was skipped
  and resource full-text search never had data. 0002 recreates it as a
  generated column; the baseline omits it so 0001 creates it correctly.

## Tenant-scoping exception

`rate_limit_buckets` has no `institution_id`: limits apply to IPs and emails
before a tenant is known (sign-in, registration). It stores only hashed keys and
counters. The tenant-isolation test lists it explicitly.
