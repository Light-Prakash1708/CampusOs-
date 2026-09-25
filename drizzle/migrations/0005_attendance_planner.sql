ALTER TABLE "institutions" ADD COLUMN "attendance_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Hand-written ---------------------------------------------------------------
-- Values are validated by services/attendance/policy.ts; the database only
-- guarantees the shape is an object so a bad write can never break parsing.
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_attendance_policy_object_ck"
  CHECK (jsonb_typeof(attendance_policy) = 'object');
