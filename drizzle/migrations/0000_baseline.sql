-- NOTE: resources.search_vector is intentionally omitted here; 0001_hard_constraints
-- adds it as a GENERATED column (drizzle-kit cannot express generated tsvector).
--> statement-breakpoint
CREATE TYPE "public"."ai_action_status" AS ENUM('PROPOSED', 'AWAITING_APPROVAL', 'APPROVED', 'EXECUTED', 'REJECTED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."ai_feature" AS ENUM('CAMPUS_ASSISTANT', 'TEACHER_COPILOT', 'STUDENT_ASSISTANT', 'TIMETABLE_NL', 'RESOURCE_GENERATION', 'SKILL_GAP', 'COMMUNICATION_DRAFT', 'GRIEVANCE_CLASSIFY', 'ANALYTICS_EXPLAIN', 'ASSIGNMENT_ANALYSIS');--> statement-breakpoint
CREATE TYPE "public"."announcement_category" AS ENUM('ACADEMIC', 'EXAMINATION', 'EVENT', 'ADMINISTRATIVE', 'HOLIDAY', 'EMERGENCY', 'PLACEMENT', 'FACILITY', 'GENERAL');--> statement-breakpoint
CREATE TYPE "public"."announcement_kind" AS ENUM('OFFICIAL', 'INFORMATIONAL');--> statement-breakpoint
CREATE TYPE "public"."announcement_priority" AS ENUM('CRITICAL', 'IMPORTANT', 'NORMAL', 'INFORMATIONAL');--> statement-breakpoint
CREATE TYPE "public"."announcement_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'WITHDRAWN', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."approval_kind" AS ENUM('TIMETABLE_CHANGE', 'ANNOUNCEMENT_PUBLISH', 'LEAVE_REQUEST', 'EVENT_CREATE', 'ATTENDANCE_CORRECTION', 'GRIEVANCE_RESOLUTION', 'RESOURCE_PUBLISH', 'DATA_IMPORT', 'EMERGENCY_BROADCAST');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."assessment_kind" AS ENUM('INTERNAL', 'MIDTERM', 'END_SEMESTER', 'QUIZ', 'PRACTICAL', 'VIVA', 'PROJECT');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."attendance_session_status" AS ENUM('SCHEDULED', 'OPEN', 'SUBMITTED', 'LOCKED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'MEDICAL');--> statement-breakpoint
CREATE TYPE "public"."audience_scope" AS ENUM('INSTITUTION', 'CAMPUS', 'DEPARTMENT', 'PROGRAM', 'YEAR', 'SECTION', 'COURSE', 'ROLE', 'USER');--> statement-breakpoint
CREATE TYPE "public"."change_kind" AS ENUM('TIMETABLE_CHANGED', 'ROOM_CHANGED', 'FACULTY_CHANGED', 'CLASS_CANCELLED', 'EXAM_RESCHEDULED', 'DEADLINE_CHANGED', 'EVENT_MOVED', 'HOLIDAY_DECLARED', 'ATTENDANCE_CORRECTED', 'CALENDAR_UPDATED', 'POLICY_UPDATED');--> statement-breakpoint
CREATE TYPE "public"."day_of_week" AS ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."grievance_status" AS ENUM('SUBMITTED', 'ACKNOWLEDGED', 'ASSIGNED', 'UNDER_REVIEW', 'AWAITING_INFORMATION', 'RESOLUTION_PROPOSED', 'RESOLVED', 'CLOSED', 'REOPENED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."grievance_urgency" AS ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('UPLOADED', 'VALIDATING', 'VALIDATED', 'FAILED_VALIDATION', 'IMPORTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP', 'EMAIL', 'PUSH', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('DOCUMENT', 'SLIDES', 'SPREADSHEET', 'VIDEO', 'LINK', 'IMAGE', 'NOTES', 'QUESTION_BANK', 'LESSON_PLAN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('DRAFT', 'AI_GENERATED_PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('CLASSROOM', 'LAB', 'SEMINAR_HALL', 'AUDITORIUM', 'WORKSHOP', 'SPORTS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."skill_level_source" AS ENUM('ASSESSMENT', 'ASSIGNMENT', 'PROJECT', 'CERTIFICATION', 'SELF_ASSESSMENT', 'FACULTY_ASSESSMENT', 'COURSE_OUTCOME');--> statement-breakpoint
CREATE TYPE "public"."slot_kind" AS ENUM('TEACHING', 'BREAK', 'LUNCH', 'ACTIVITY');--> statement-breakpoint
CREATE TYPE "public"."subject_kind" AS ENUM('THEORY', 'LAB', 'PROJECT', 'ELECTIVE', 'SEMINAR', 'INTERNSHIP');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('NOT_SUBMITTED', 'SUBMITTED', 'LATE', 'RESUBMITTED', 'EVALUATED', 'RETURNED');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('STARTER', 'PROFESSIONAL', 'ENTERPRISE');--> statement-breakpoint
CREATE TYPE "public"."timetable_status" AS ENUM('DRAFT', 'PROPOSED', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'ADMIN', 'HOD', 'DEPARTMENT_ADMIN', 'EXAM_CELL', 'FACULTY', 'STUDENT', 'COUNSELLOR', 'IT_SUPPORT', 'FINANCE', 'HR', 'LIBRARY', 'MANAGEMENT');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'ALUMNI', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."workload_kind" AS ENUM('TEACHING', 'LAB', 'ASSESSMENT', 'ADMINISTRATIVE', 'MENTORING', 'MEETING', 'EXAM_DUTY', 'RESEARCH', 'OTHER');--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address_line" text,
	"city" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"school" text,
	"head_of_department_id" uuid,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"is_half_day" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"logo_url" text,
	"primary_color" text DEFAULT '#4F46E5',
	"terminology" jsonb DEFAULT '{}'::jsonb,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"address_line" text,
	"city" text,
	"state" text,
	"country" text DEFAULT 'India',
	"subscription_tier" "subscription_tier" DEFAULT 'STARTER' NOT NULL,
	"feature_flags" jsonb DEFAULT '{}'::jsonb,
	"setup_completed_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"level" text DEFAULT 'UG' NOT NULL,
	"duration_years" integer DEFAULT 3 NOT NULL,
	"total_semesters" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"semester_number" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"teaching_end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faculty_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_code" text NOT NULL,
	"designation" text DEFAULT 'Assistant Professor' NOT NULL,
	"department_id" uuid NOT NULL,
	"specializations" jsonb DEFAULT '[]'::jsonb,
	"qualifications" text,
	"joining_date" date,
	"employment_type" text DEFAULT 'FULL_TIME' NOT NULL,
	"max_weekly_teaching_hours" integer DEFAULT 18 NOT NULL,
	"availability" jsonb DEFAULT '[]'::jsonb,
	"constraint_notes" text,
	"is_available_for_substitution" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"roll_number" text NOT NULL,
	"admission_number" text,
	"program_id" uuid NOT NULL,
	"section_id" uuid,
	"current_year" integer DEFAULT 1 NOT NULL,
	"current_semester" integer DEFAULT 1 NOT NULL,
	"admission_date" date,
	"expected_graduation" date,
	"date_of_birth" date,
	"gender" text,
	"blood_group" text,
	"guardian_name" text,
	"guardian_phone" text,
	"guardian_email" text,
	"attendance_percentage" numeric(5, 2),
	"cgpa" numeric(4, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"display_name" text,
	"phone" text,
	"avatar_url" text,
	"role" "user_role" NOT NULL,
	"secondary_roles" jsonb DEFAULT '[]'::jsonb,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"department_id" uuid,
	"campus_id" uuid,
	"locale" text DEFAULT 'en' NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"last_login_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "course_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"faculty_id" uuid,
	"secondary_faculty_id" uuid,
	"weekly_hours_override" integer,
	"min_attendance_percentage" numeric(5, 2) DEFAULT '75' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dropped_at" timestamp with time zone,
	"final_grade" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"code" text NOT NULL,
	"name" text,
	"type" "room_type" DEFAULT 'CLASSROOM' NOT NULL,
	"capacity" integer DEFAULT 60 NOT NULL,
	"building" text,
	"floor" text,
	"facilities" jsonb DEFAULT '[]'::jsonb,
	"owner_department_id" uuid,
	"is_bookable" boolean DEFAULT true NOT NULL,
	"unavailable_from" timestamp with time zone,
	"unavailable_to" timestamp with time zone,
	"unavailable_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"entry_id" uuid,
	"offering_id" uuid,
	"date" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"new_room_id" uuid,
	"new_faculty_id" uuid,
	"new_time_slot_id" uuid,
	"reason" text NOT NULL,
	"created_by_id" uuid,
	"approved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"year" integer NOT NULL,
	"semester" integer NOT NULL,
	"strength" integer DEFAULT 0 NOT NULL,
	"home_room_id" uuid,
	"class_representative_id" uuid,
	"faculty_advisor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "subject_kind" DEFAULT 'THEORY' NOT NULL,
	"credits" integer DEFAULT 3 NOT NULL,
	"weekly_hours" integer DEFAULT 3 NOT NULL,
	"consecutive_block_size" integer DEFAULT 1 NOT NULL,
	"required_room_type" "room_type" DEFAULT 'CLASSROOM',
	"semester" integer DEFAULT 1 NOT NULL,
	"description" text,
	"outcomes" jsonb DEFAULT '[]'::jsonb,
	"syllabus_url" text,
	"is_elective" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "time_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"label" text NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"kind" "slot_kind" DEFAULT 'TEACHING' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"room_id" uuid,
	"faculty_id" uuid,
	"section_id" uuid NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" timetable_status DEFAULT 'DRAFT' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"solver_report" jsonb,
	"generated_by" text DEFAULT 'MANUAL' NOT NULL,
	"created_by_id" uuid,
	"published_at" timestamp with time zone,
	"published_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" DEFAULT 'ABSENT' NOT NULL,
	"original_status" "attendance_status",
	"marked_by_id" uuid,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"corrected_by_id" uuid,
	"corrected_at" timestamp with time zone,
	"correction_reason" text,
	"correction_grievance_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"timetable_entry_id" uuid,
	"date" date NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"room_id" uuid,
	"taken_by_id" uuid,
	"status" "attendance_session_status" DEFAULT 'SCHEDULED' NOT NULL,
	"topic_covered" text,
	"present_count" integer DEFAULT 0 NOT NULL,
	"absent_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"held_sessions" integer DEFAULT 0 NOT NULL,
	"attended_sessions" integer DEFAULT 0 NOT NULL,
	"percentage_bp" integer DEFAULT 0 NOT NULL,
	"is_below_threshold" boolean DEFAULT false NOT NULL,
	"absence_headroom" integer DEFAULT 0 NOT NULL,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"room_id" uuid,
	"section_id" uuid,
	"invigilator_id" uuid,
	"seat_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" numeric(6, 2),
	"grade" text,
	"is_absent" boolean DEFAULT false NOT NULL,
	"remarks" text,
	"recorded_by_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"subject_id" uuid,
	"offering_id" uuid,
	"kind" "assessment_kind" DEFAULT 'INTERNAL' NOT NULL,
	"title" text NOT NULL,
	"max_score" numeric(6, 2) DEFAULT '100' NOT NULL,
	"date" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"duration_minutes" integer DEFAULT 120,
	"status" timetable_status DEFAULT 'DRAFT' NOT NULL,
	"instructions" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"created_by_id" uuid,
	"title" text NOT NULL,
	"instructions" text,
	"max_score" numeric(6, 2) DEFAULT '100' NOT NULL,
	"weight_percentage" numeric(5, 2),
	"rubric" jsonb DEFAULT '[]'::jsonb,
	"skill_tags" jsonb DEFAULT '[]'::jsonb,
	"due_at" timestamp with time zone,
	"original_due_at" timestamp with time zone,
	"allow_late_submission" boolean DEFAULT true NOT NULL,
	"late_penalty_percentage" numeric(5, 2) DEFAULT '0',
	"status" "assignment_status" DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "submission_status" DEFAULT 'NOT_SUBMITTED' NOT NULL,
	"submitted_at" timestamp with time zone,
	"content" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"score" numeric(6, 2),
	"feedback" text,
	"rubric_scores" jsonb,
	"evaluated_by_id" uuid,
	"evaluated_at" timestamp with time zone,
	"ai_suggested_score" numeric(6, 2),
	"ai_feedback" text,
	"ai_rubric_scores" jsonb,
	"ai_analysed_at" timestamp with time zone,
	"ai_suggestion_reviewed" boolean DEFAULT false NOT NULL,
	"similarity_score" numeric(5, 2),
	"similarity_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_official_response" boolean DEFAULT false NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "announcement_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"matched_scope" "audience_scope",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"scope" "audience_scope" NOT NULL,
	"campus_id" uuid,
	"department_id" uuid,
	"program_id" uuid,
	"section_id" uuid,
	"offering_id" uuid,
	"year" integer,
	"role" text,
	"user_id" uuid,
	"is_exclusion" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"summary" text,
	"author_id" uuid NOT NULL,
	"department_id" uuid,
	"kind" "announcement_kind" DEFAULT 'INFORMATIONAL' NOT NULL,
	"category" "announcement_category" DEFAULT 'GENERAL' NOT NULL,
	"priority" "announcement_priority" DEFAULT 'NORMAL' NOT NULL,
	"status" "announcement_status" DEFAULT 'DRAFT' NOT NULL,
	"requires_acknowledgement" boolean DEFAULT false NOT NULL,
	"acknowledgement_deadline" timestamp with time zone,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"related_event_id" uuid,
	"related_offering_id" uuid,
	"allow_comments" boolean DEFAULT false NOT NULL,
	"comments_closed_at" timestamp with time zone,
	"is_emergency_broadcast" boolean DEFAULT false NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"acknowledged_count" integer DEFAULT 0 NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"kind" "change_kind" NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"reason" text,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"changed_by_id" uuid,
	"approved_by_id" uuid,
	"affected_section_ids" jsonb DEFAULT '[]'::jsonb,
	"affected_user_ids" jsonb DEFAULT '[]'::jsonb,
	"affected_count" integer DEFAULT 0 NOT NULL,
	"effective_from" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attended_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"organizer_id" uuid,
	"department_id" uuid,
	"room_id" uuid,
	"venue_text" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer,
	"registration_required" boolean DEFAULT false NOT NULL,
	"registration_deadline" timestamp with time zone,
	"speaker" text,
	"status" "event_status" DEFAULT 'DRAFT' NOT NULL,
	"blocks_classes" boolean DEFAULT false NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "announcement_category" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" text DEFAULT '22:00',
	"quiet_hours_end" text DEFAULT '07:00',
	"email_enabled" boolean DEFAULT true NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"digest_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"priority" "announcement_priority" DEFAULT 'NORMAL' NOT NULL,
	"category" "announcement_category" DEFAULT 'GENERAL' NOT NULL,
	"action_url" text,
	"group_key" text,
	"source_type" text,
	"source_id" uuid,
	"read_at" timestamp with time zone,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"delivered_channels" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"offering_id" uuid,
	"subject_id" uuid,
	"author_id" uuid,
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"content" jsonb NOT NULL,
	"status" "resource_status" DEFAULT 'AI_GENERATED_PENDING_REVIEW' NOT NULL,
	"is_ai_generated" boolean DEFAULT true NOT NULL,
	"ai_generation_id" uuid,
	"estimated_manual_minutes" integer DEFAULT 30 NOT NULL,
	"actual_minutes_spent" integer,
	"scheduled_for" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resource_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"section_id" uuid,
	"user_id" uuid,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" "resource_kind" DEFAULT 'DOCUMENT' NOT NULL,
	"status" "resource_status" DEFAULT 'DRAFT' NOT NULL,
	"file_url" text,
	"file_name" text,
	"file_size_bytes" integer,
	"mime_type" text,
	"external_url" text,
	"extracted_text" text,
	"owner_id" uuid,
	"department_id" uuid,
	"subject_id" uuid,
	"offering_id" uuid,
	"topic" text,
	"semester" integer,
	"difficulty" text,
	"academic_year" text,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"ai_generation_id" uuid,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"visibility" text DEFAULT 'DEPARTMENT' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "career_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"career_role_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"target_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_role_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"career_role_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"required_proficiency" integer DEFAULT 70 NOT NULL,
	"importance" integer DEFAULT 3 NOT NULL,
	"is_core" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"department_id" uuid,
	"source_note" text,
	"average_salary_lpa" numeric(6, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"source" "skill_level_source" NOT NULL,
	"score" integer NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"description" text,
	"recorded_by_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_gap_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"career_role_id" uuid NOT NULL,
	"readiness_score" integer DEFAULT 0 NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_weeks" integer DEFAULT 8 NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"ai_generation_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'TECHNICAL' NOT NULL,
	"description" text,
	"parent_skill_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"title" text NOT NULL,
	"issuer" text,
	"issued_on" date,
	"credential_url" text,
	"skill_tags" jsonb DEFAULT '[]'::jsonb,
	"verified_by_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"proficiency" integer DEFAULT 0 NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"last_evidence_at" timestamp with time zone,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"weight" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grievance_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"available_to_roles" jsonb DEFAULT '["STUDENT"]'::jsonb,
	"default_department_id" uuid,
	"default_assignee_id" uuid,
	"response_sla_hours" integer DEFAULT 24 NOT NULL,
	"resolution_sla_hours" integer DEFAULT 72 NOT NULL,
	"escalation_user_id" uuid,
	"allow_anonymous" boolean DEFAULT false NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grievance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"grievance_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"note" text,
	"actor_id" uuid,
	"is_system_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grievance_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"grievance_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"is_internal_note" boolean DEFAULT false NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grievances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"case_number" text NOT NULL,
	"category_id" uuid NOT NULL,
	"raised_by_id" uuid,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"urgency" "grievance_urgency" DEFAULT 'NORMAL' NOT NULL,
	"status" "grievance_status" DEFAULT 'SUBMITTED' NOT NULL,
	"department_id" uuid,
	"assigned_to_id" uuid,
	"assigned_at" timestamp with time zone,
	"response_due_at" timestamp with time zone,
	"resolution_due_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"last_escalated_at" timestamp with time zone,
	"is_sla_breached" boolean DEFAULT false NOT NULL,
	"resolution_summary" text,
	"satisfaction_rating" integer,
	"related_entity_type" text,
	"related_entity_id" uuid,
	"ai_suggested_category_id" uuid,
	"ai_suggested_urgency" "grievance_urgency",
	"ai_summary" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"preferred_contact_method" text DEFAULT 'IN_APP',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"leave_type" text DEFAULT 'CASUAL' NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"is_half_day" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_status" DEFAULT 'PENDING' NOT NULL,
	"affected_offering_ids" jsonb DEFAULT '[]'::jsonb,
	"affected_class_count" integer DEFAULT 0 NOT NULL,
	"substitute_plan" jsonb DEFAULT '[]'::jsonb,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workload_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"faculty_id" uuid NOT NULL,
	"term_id" uuid,
	"kind" "workload_kind" NOT NULL,
	"description" text NOT NULL,
	"weekly_hours" numeric(5, 2) DEFAULT '0' NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"offering_id" uuid,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workload_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"faculty_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"teaching_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"lab_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"assessment_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"administrative_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"mentoring_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"other_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"total_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"department_average" numeric(6, 2),
	"status" text DEFAULT 'BALANCED' NOT NULL,
	"utilization_percentage" numeric(5, 2),
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"generation_id" uuid,
	"requested_by_id" uuid,
	"feature" "ai_feature" NOT NULL,
	"operation" text NOT NULL,
	"payload" jsonb NOT NULL,
	"predicted_impact" jsonb,
	"validation_passed" boolean DEFAULT false NOT NULL,
	"validation_notes" text,
	"status" "ai_action_status" DEFAULT 'PROPOSED' NOT NULL,
	"approval_id" uuid,
	"executed_at" timestamp with time zone,
	"execution_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"feature" "ai_feature" DEFAULT 'CAMPUS_ASSISTANT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid,
	"feature" "ai_feature" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_summary" text,
	"tool_calls" jsonb DEFAULT '[]'::jsonb,
	"output_summary" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer,
	"was_grounded" boolean DEFAULT false NOT NULL,
	"succeeded" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb,
	"tool_calls" jsonb DEFAULT '[]'::jsonb,
	"generation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"kind" "approval_kind" NOT NULL,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"payload" jsonb NOT NULL,
	"impact_summary" jsonb,
	"entity_type" text,
	"entity_id" uuid,
	"requested_by_id" uuid,
	"required_role" text,
	"assigned_approver_id" uuid,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"executed_at" timestamp with time zone,
	"execution_error" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before_value" jsonb,
	"after_value" jsonb,
	"reason" text,
	"ip_address" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"file_name" text NOT NULL,
	"status" "import_status" DEFAULT 'UPLOADED' NOT NULL,
	"column_mapping" jsonb DEFAULT '{}'::jsonb,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb,
	"staged_data" jsonb,
	"started_by_id" uuid,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"job_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_saved_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid,
	"activity" text NOT NULL,
	"estimated_manual_minutes" integer NOT NULL,
	"actual_minutes" integer NOT NULL,
	"saved_minutes" integer NOT NULL,
	"basis" text DEFAULT 'DEFAULT_ESTIMATE' NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faculty_profiles" ADD CONSTRAINT "faculty_profiles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faculty_profiles" ADD CONSTRAINT "faculty_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faculty_profiles" ADD CONSTRAINT "faculty_profiles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_faculty_id_faculty_profiles_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_secondary_faculty_id_faculty_profiles_id_fk" FOREIGN KEY ("secondary_faculty_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_department_id_departments_id_fk" FOREIGN KEY ("owner_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_entry_id_timetable_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."timetable_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_new_room_id_rooms_id_fk" FOREIGN KEY ("new_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_new_faculty_id_faculty_profiles_id_fk" FOREIGN KEY ("new_faculty_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_new_time_slot_id_time_slots_id_fk" FOREIGN KEY ("new_time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_representative_id_users_id_fk" FOREIGN KEY ("class_representative_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_faculty_advisor_id_faculty_profiles_id_fk" FOREIGN KEY ("faculty_advisor_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_version_id_timetable_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."timetable_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_faculty_id_faculty_profiles_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_id_users_id_fk" FOREIGN KEY ("marked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_corrected_by_id_users_id_fk" FOREIGN KEY ("corrected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_timetable_entry_id_timetable_entries_id_fk" FOREIGN KEY ("timetable_entry_id") REFERENCES "public"."timetable_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_taken_by_id_faculty_profiles_id_fk" FOREIGN KEY ("taken_by_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_summaries" ADD CONSTRAINT "attendance_summaries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_summaries" ADD CONSTRAINT "attendance_summaries_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_summaries" ADD CONSTRAINT "attendance_summaries_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_allocations" ADD CONSTRAINT "assessment_allocations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_allocations" ADD CONSTRAINT "assessment_allocations_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_allocations" ADD CONSTRAINT "assessment_allocations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_allocations" ADD CONSTRAINT "assessment_allocations_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_allocations" ADD CONSTRAINT "assessment_allocations_invigilator_id_faculty_profiles_id_fk" FOREIGN KEY ("invigilator_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_id_faculty_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_evaluated_by_id_users_id_fk" FOREIGN KEY ("evaluated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_related_offering_id_course_offerings_id_fk" FOREIGN KEY ("related_offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_goals" ADD CONSTRAINT "career_goals_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_goals" ADD CONSTRAINT "career_goals_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_goals" ADD CONSTRAINT "career_goals_career_role_id_career_roles_id_fk" FOREIGN KEY ("career_role_id") REFERENCES "public"."career_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_role_skills" ADD CONSTRAINT "career_role_skills_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_role_skills" ADD CONSTRAINT "career_role_skills_career_role_id_career_roles_id_fk" FOREIGN KEY ("career_role_id") REFERENCES "public"."career_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_role_skills" ADD CONSTRAINT "career_role_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_roles" ADD CONSTRAINT "career_roles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_roles" ADD CONSTRAINT "career_roles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_gap_plans" ADD CONSTRAINT "skill_gap_plans_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_gap_plans" ADD CONSTRAINT "skill_gap_plans_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_gap_plans" ADD CONSTRAINT "skill_gap_plans_career_role_id_career_roles_id_fk" FOREIGN KEY ("career_role_id") REFERENCES "public"."career_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_certifications" ADD CONSTRAINT "student_certifications_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_certifications" ADD CONSTRAINT "student_certifications_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_certifications" ADD CONSTRAINT "student_certifications_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_skills" ADD CONSTRAINT "subject_skills_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_skills" ADD CONSTRAINT "subject_skills_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_skills" ADD CONSTRAINT "subject_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_categories" ADD CONSTRAINT "grievance_categories_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_categories" ADD CONSTRAINT "grievance_categories_default_department_id_departments_id_fk" FOREIGN KEY ("default_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_categories" ADD CONSTRAINT "grievance_categories_default_assignee_id_users_id_fk" FOREIGN KEY ("default_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_categories" ADD CONSTRAINT "grievance_categories_escalation_user_id_users_id_fk" FOREIGN KEY ("escalation_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_events" ADD CONSTRAINT "grievance_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_events" ADD CONSTRAINT "grievance_events_grievance_id_grievances_id_fk" FOREIGN KEY ("grievance_id") REFERENCES "public"."grievances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_events" ADD CONSTRAINT "grievance_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_messages" ADD CONSTRAINT "grievance_messages_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_messages" ADD CONSTRAINT "grievance_messages_grievance_id_grievances_id_fk" FOREIGN KEY ("grievance_id") REFERENCES "public"."grievances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_messages" ADD CONSTRAINT "grievance_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_category_id_grievance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."grievance_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_raised_by_id_users_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_records" ADD CONSTRAINT "workload_records_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_records" ADD CONSTRAINT "workload_records_faculty_id_faculty_profiles_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_records" ADD CONSTRAINT "workload_records_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_records" ADD CONSTRAINT "workload_records_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_summaries" ADD CONSTRAINT "workload_summaries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_summaries" ADD CONSTRAINT "workload_summaries_faculty_id_faculty_profiles_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculty_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_summaries" ADD CONSTRAINT "workload_summaries_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_assigned_approver_id_users_id_fk" FOREIGN KEY ("assigned_approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_queue" ADD CONSTRAINT "job_queue_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_saved_events" ADD CONSTRAINT "time_saved_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_saved_events" ADD CONSTRAINT "time_saved_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academic_years_institution_idx" ON "academic_years" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_label_uq" ON "academic_years" USING btree ("institution_id","label");--> statement-breakpoint
CREATE INDEX "campuses_institution_idx" ON "campuses" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campuses_code_uq" ON "campuses" USING btree ("institution_id","code");--> statement-breakpoint
CREATE INDEX "departments_institution_idx" ON "departments" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_uq" ON "departments" USING btree ("institution_id","code");--> statement-breakpoint
CREATE INDEX "holidays_institution_idx" ON "holidays" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("institution_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "institutions_slug_uq" ON "institutions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "programs_institution_idx" ON "programs" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "programs_department_idx" ON "programs" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_code_uq" ON "programs" USING btree ("institution_id","code");--> statement-breakpoint
CREATE INDEX "terms_institution_idx" ON "terms" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "terms_year_idx" ON "terms" USING btree ("academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faculty_profiles_user_uq" ON "faculty_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faculty_profiles_code_uq" ON "faculty_profiles" USING btree ("institution_id","employee_code");--> statement-breakpoint
CREATE INDEX "faculty_profiles_department_idx" ON "faculty_profiles" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_profiles_user_uq" ON "student_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_profiles_roll_uq" ON "student_profiles" USING btree ("institution_id","roll_number");--> statement-breakpoint
CREATE INDEX "student_profiles_program_idx" ON "student_profiles" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "student_profiles_section_idx" ON "student_profiles" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("institution_id","email");--> statement-breakpoint
CREATE INDEX "users_institution_idx" ON "users" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("institution_id","role");--> statement-breakpoint
CREATE INDEX "users_department_idx" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "course_offerings_institution_idx" ON "course_offerings" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "course_offerings_term_idx" ON "course_offerings" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "course_offerings_faculty_idx" ON "course_offerings" USING btree ("faculty_id");--> statement-breakpoint
CREATE INDEX "course_offerings_section_idx" ON "course_offerings" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_offerings_uq" ON "course_offerings" USING btree ("term_id","subject_id","section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_uq" ON "enrollments" USING btree ("offering_id","student_id");--> statement-breakpoint
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "enrollments_offering_idx" ON "enrollments" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "rooms_institution_idx" ON "rooms" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_uq" ON "rooms" USING btree ("institution_id","code");--> statement-breakpoint
CREATE INDEX "rooms_type_idx" ON "rooms" USING btree ("institution_id","type");--> statement-breakpoint
CREATE INDEX "schedule_exceptions_institution_idx" ON "schedule_exceptions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "schedule_exceptions_date_idx" ON "schedule_exceptions" USING btree ("institution_id","date");--> statement-breakpoint
CREATE INDEX "schedule_exceptions_entry_idx" ON "schedule_exceptions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "sections_institution_idx" ON "sections" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "sections_program_idx" ON "sections" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_code_uq" ON "sections" USING btree ("institution_id","code");--> statement-breakpoint
CREATE INDEX "subjects_institution_idx" ON "subjects" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "subjects_department_idx" ON "subjects" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_code_uq" ON "subjects" USING btree ("institution_id","code");--> statement-breakpoint
CREATE INDEX "time_slots_institution_idx" ON "time_slots" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "time_slots_uq" ON "time_slots" USING btree ("institution_id","day_of_week","position");--> statement-breakpoint
CREATE INDEX "timetable_entries_version_idx" ON "timetable_entries" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "timetable_entries_room_slot_idx" ON "timetable_entries" USING btree ("version_id","room_id","time_slot_id");--> statement-breakpoint
CREATE INDEX "timetable_entries_faculty_slot_idx" ON "timetable_entries" USING btree ("version_id","faculty_id","time_slot_id");--> statement-breakpoint
CREATE INDEX "timetable_entries_section_slot_idx" ON "timetable_entries" USING btree ("version_id","section_id","time_slot_id");--> statement-breakpoint
CREATE INDEX "timetable_entries_offering_idx" ON "timetable_entries" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "timetable_versions_institution_idx" ON "timetable_versions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "timetable_versions_term_idx" ON "timetable_versions" USING btree ("term_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_uq" ON "attendance_records" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_records_student_idx" ON "attendance_records" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "attendance_records_institution_idx" ON "attendance_records" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_institution_idx" ON "attendance_sessions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_offering_idx" ON "attendance_sessions" USING btree ("offering_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_uq" ON "attendance_sessions" USING btree ("offering_id","date","timetable_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_summaries_uq" ON "attendance_summaries" USING btree ("student_id","offering_id");--> statement-breakpoint
CREATE INDEX "attendance_summaries_threshold_idx" ON "attendance_summaries" USING btree ("institution_id","is_below_threshold");--> statement-breakpoint
CREATE INDEX "assessment_allocations_assessment_idx" ON "assessment_allocations" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "assessment_allocations_room_idx" ON "assessment_allocations" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "assessment_allocations_invigilator_idx" ON "assessment_allocations" USING btree ("invigilator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_results_uq" ON "assessment_results" USING btree ("assessment_id","student_id");--> statement-breakpoint
CREATE INDEX "assessment_results_student_idx" ON "assessment_results" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "assessments_institution_idx" ON "assessments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "assessments_term_idx" ON "assessments" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "assessments_date_idx" ON "assessments" USING btree ("institution_id","date");--> statement-breakpoint
CREATE INDEX "assignments_institution_idx" ON "assignments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "assignments_offering_idx" ON "assignments" USING btree ("offering_id","status");--> statement-breakpoint
CREATE INDEX "assignments_due_idx" ON "assignments" USING btree ("institution_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_uq" ON "submissions" USING btree ("assignment_id","student_id","attempt_number");--> statement-breakpoint
CREATE INDEX "submissions_student_idx" ON "submissions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "submissions_assignment_idx" ON "submissions" USING btree ("assignment_id","status");--> statement-breakpoint
CREATE INDEX "announcement_comments_announcement_idx" ON "announcement_comments" USING btree ("announcement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_recipients_uq" ON "announcement_recipients" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "announcement_recipients_user_idx" ON "announcement_recipients" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "announcement_recipients_ack_idx" ON "announcement_recipients" USING btree ("announcement_id","acknowledged_at");--> statement-breakpoint
CREATE INDEX "announcement_targets_announcement_idx" ON "announcement_targets" USING btree ("announcement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "announcements_reference_uq" ON "announcements" USING btree ("institution_id","reference");--> statement-breakpoint
CREATE INDEX "announcements_institution_status_idx" ON "announcements" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "announcements_published_idx" ON "announcements" USING btree ("institution_id","published_at");--> statement-breakpoint
CREATE INDEX "announcements_author_idx" ON "announcements" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "change_events_institution_idx" ON "change_events" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX "change_events_entity_idx" ON "change_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "change_events_kind_idx" ON "change_events" USING btree ("institution_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "event_registrations_uq" ON "event_registrations" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "events_institution_idx" ON "events" USING btree ("institution_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_room_idx" ON "events" USING btree ("room_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_uq" ON "notification_preferences" USING btree ("user_id","category","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_uq" ON "notification_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_group_idx" ON "notifications" USING btree ("user_id","group_key");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "lesson_plans_institution_idx" ON "lesson_plans" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "lesson_plans_author_idx" ON "lesson_plans" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "lesson_plans_offering_idx" ON "lesson_plans" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "resource_shares_resource_idx" ON "resource_shares" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_tags_uq" ON "resource_tags" USING btree ("resource_id","tag");--> statement-breakpoint
CREATE INDEX "resource_tags_tag_idx" ON "resource_tags" USING btree ("institution_id","tag");--> statement-breakpoint
CREATE INDEX "resources_institution_idx" ON "resources" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "resources_subject_idx" ON "resources" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "resources_owner_idx" ON "resources" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_goals_uq" ON "career_goals" USING btree ("student_id","career_role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_role_skills_uq" ON "career_role_skills" USING btree ("career_role_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_roles_slug_uq" ON "career_roles" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE INDEX "skill_evidence_student_idx" ON "skill_evidence" USING btree ("student_id","skill_id");--> statement-breakpoint
CREATE INDEX "skill_evidence_source_idx" ON "skill_evidence" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "skill_gap_plans_student_idx" ON "skill_gap_plans" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_uq" ON "skills" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE INDEX "skills_category_idx" ON "skills" USING btree ("institution_id","category");--> statement-breakpoint
CREATE INDEX "student_certifications_student_idx" ON "student_certifications" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_skills_uq" ON "student_skills" USING btree ("student_id","skill_id");--> statement-breakpoint
CREATE INDEX "student_skills_institution_idx" ON "student_skills" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_skills_uq" ON "subject_skills" USING btree ("subject_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grievance_categories_slug_uq" ON "grievance_categories" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE INDEX "grievance_events_grievance_idx" ON "grievance_events" USING btree ("grievance_id","created_at");--> statement-breakpoint
CREATE INDEX "grievance_messages_grievance_idx" ON "grievance_messages" USING btree ("grievance_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "grievances_case_uq" ON "grievances" USING btree ("institution_id","case_number");--> statement-breakpoint
CREATE INDEX "grievances_status_idx" ON "grievances" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "grievances_assignee_idx" ON "grievances" USING btree ("assigned_to_id","status");--> statement-breakpoint
CREATE INDEX "grievances_raiser_idx" ON "grievances" USING btree ("raised_by_id");--> statement-breakpoint
CREATE INDEX "grievances_sla_idx" ON "grievances" USING btree ("institution_id","resolution_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_requests_reference_uq" ON "leave_requests" USING btree ("institution_id","reference");--> statement-breakpoint
CREATE INDEX "leave_requests_requester_idx" ON "leave_requests" USING btree ("requester_id","status");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "workload_records_faculty_idx" ON "workload_records" USING btree ("faculty_id","term_id");--> statement-breakpoint
CREATE INDEX "workload_records_institution_idx" ON "workload_records" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workload_summaries_uq" ON "workload_summaries" USING btree ("faculty_id","term_id");--> statement-breakpoint
CREATE INDEX "workload_summaries_status_idx" ON "workload_summaries" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "ai_actions_institution_idx" ON "ai_actions" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "ai_actions_user_idx" ON "ai_actions" USING btree ("requested_by_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_idx" ON "ai_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_generations_institution_idx" ON "ai_generations" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_generations_user_idx" ON "ai_generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_generations_feature_idx" ON "ai_generations" USING btree ("institution_id","feature");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_preferences_uq" ON "ai_preferences" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "approvals_institution_status_idx" ON "approvals" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "approvals_approver_idx" ON "approvals" USING btree ("assigned_approver_id","status");--> statement-breakpoint
CREATE INDEX "approvals_entity_idx" ON "approvals" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_institution_idx" ON "audit_logs" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("institution_id","action");--> statement-breakpoint
CREATE INDEX "import_jobs_institution_idx" ON "import_jobs" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "job_queue_status_idx" ON "job_queue" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "system_settings_uq" ON "system_settings" USING btree ("institution_id","key");--> statement-breakpoint
CREATE INDEX "time_saved_institution_idx" ON "time_saved_events" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX "time_saved_user_idx" ON "time_saved_events" USING btree ("user_id");