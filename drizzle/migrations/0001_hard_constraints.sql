-- ===========================================================================
-- CampusOS — database-level integrity guarantees
-- ---------------------------------------------------------------------------
-- Frontend validation and service-layer checks can be bypassed or can race.
-- These constraints make the invalid states IMPOSSIBLE at the storage layer.
-- Two admins clicking "assign Room 301" at the same instant: one succeeds,
-- the other gets a constraint violation which the service maps to a clean
-- CONFLICT response. See DATABASE.md §Conflict protection.
-- ===========================================================================

-- --- Timetable: no double-booking within a timetable version ---------------
-- A room cannot host two live classes in the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS timetable_room_slot_uq
  ON timetable_entries (version_id, room_id, time_slot_id)
  WHERE is_cancelled = false AND room_id IS NOT NULL;

-- A faculty member cannot teach two classes in the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS timetable_faculty_slot_uq
  ON timetable_entries (version_id, faculty_id, time_slot_id)
  WHERE is_cancelled = false AND faculty_id IS NOT NULL;

-- A section cannot be in two places in the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS timetable_section_slot_uq
  ON timetable_entries (version_id, section_id, time_slot_id)
  WHERE is_cancelled = false;

-- Exactly one PUBLISHED timetable version per term.
CREATE UNIQUE INDEX IF NOT EXISTS timetable_one_published_per_term_uq
  ON timetable_versions (term_id)
  WHERE status = 'PUBLISHED';

-- --- Exams: a room or invigilator cannot be allocated twice to one exam ----
CREATE UNIQUE INDEX IF NOT EXISTS assessment_room_uq
  ON assessment_allocations (assessment_id, room_id)
  WHERE room_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS assessment_invigilator_uq
  ON assessment_allocations (assessment_id, invigilator_id)
  WHERE invigilator_id IS NOT NULL;

-- --- Single current academic year / term per institution -------------------
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_current_uq
  ON academic_years (institution_id)
  WHERE is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS terms_one_current_uq
  ON terms (institution_id)
  WHERE is_current = true;

-- --- One primary campus per institution ------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS campuses_one_primary_uq
  ON campuses (institution_id)
  WHERE is_primary = true;

-- --- One primary career goal per student -----------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS career_goals_one_primary_uq
  ON career_goals (student_id)
  WHERE is_primary = true;

-- --- Sanity checks ---------------------------------------------------------
ALTER TABLE time_slots
  DROP CONSTRAINT IF EXISTS time_slots_time_order_ck;
ALTER TABLE time_slots
  ADD CONSTRAINT time_slots_time_order_ck CHECK (end_time > start_time);

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_time_order_ck;
ALTER TABLE events
  ADD CONSTRAINT events_time_order_ck CHECK (ends_at > starts_at);

ALTER TABLE terms
  DROP CONSTRAINT IF EXISTS terms_date_order_ck;
ALTER TABLE terms
  ADD CONSTRAINT terms_date_order_ck CHECK (end_date >= start_date);

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_date_order_ck;
ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_date_order_ck CHECK (to_date >= from_date);

ALTER TABLE rooms
  DROP CONSTRAINT IF EXISTS rooms_capacity_ck;
ALTER TABLE rooms
  ADD CONSTRAINT rooms_capacity_ck CHECK (capacity > 0);

-- Attendance percentages are stored in basis points: 0..10000.
ALTER TABLE attendance_summaries
  DROP CONSTRAINT IF EXISTS attendance_summaries_bp_ck;
ALTER TABLE attendance_summaries
  ADD CONSTRAINT attendance_summaries_bp_ck CHECK (percentage_bp BETWEEN 0 AND 10000);

-- Skill proficiency and confidence are 0..100.
ALTER TABLE student_skills
  DROP CONSTRAINT IF EXISTS student_skills_range_ck;
ALTER TABLE student_skills
  ADD CONSTRAINT student_skills_range_ck
  CHECK (proficiency BETWEEN 0 AND 100 AND confidence BETWEEN 0 AND 100);

-- Satisfaction rating, when given, is 1..5.
ALTER TABLE grievances
  DROP CONSTRAINT IF EXISTS grievances_rating_ck;
ALTER TABLE grievances
  ADD CONSTRAINT grievances_rating_ck
  CHECK (satisfaction_rating IS NULL OR satisfaction_rating BETWEEN 1 AND 5);

-- --- Full-text search over academic resources ------------------------------
ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(topic, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', left(coalesce(extracted_text, ''), 100000)), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS resources_search_idx
  ON resources USING GIN (search_vector);

-- --- Append-only audit log --------------------------------------------------
-- History must not be rewritable by the application. Deployments that run the
-- app as a dedicated role should grant only INSERT/SELECT here.
CREATE OR REPLACE FUNCTION campusos_block_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION campusos_block_audit_mutation();

-- Grievance state transitions are equally immutable.
DROP TRIGGER IF EXISTS grievance_events_no_update ON grievance_events;
CREATE TRIGGER grievance_events_no_update
  BEFORE UPDATE OR DELETE ON grievance_events
  FOR EACH ROW EXECUTE FUNCTION campusos_block_audit_mutation();

-- --- Keep updated_at honest -------------------------------------------------
CREATE OR REPLACE FUNCTION campusos_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND c.table_name NOT IN ('audit_logs', 'grievance_events')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION campusos_touch_updated_at()',
      t || '_touch_updated_at', t
    );
  END LOOP;
END $$;
