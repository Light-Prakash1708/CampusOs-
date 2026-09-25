CREATE TYPE "public"."auth_token_purpose" AS ENUM('PASSWORD_RESET', 'EMAIL_VERIFY', 'INVITE');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('QUEUED', 'SENT', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."file_scan_status" AS ENUM('PENDING', 'CLEAN', 'INFECTED', 'NOT_SCANNED');--> statement-breakpoint
CREATE TYPE "public"."leaderboard_visibility" AS ENUM('PUBLIC', 'ANONYMOUS', 'PRIVATE', 'OPT_OUT');--> statement-breakpoint
ALTER TYPE "public"."notification_channel" ADD VALUE 'WHATSAPP';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'CLUB_ADMIN';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'EVENT_ORGANIZER';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'CAMPUS_REP';--> statement-breakpoint
ALTER TYPE "public"."user_status" ADD VALUE 'PENDING' BEFORE 'ACTIVE';--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "auth_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"sent_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"notification_id" uuid,
	"user_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"provider" text,
	"template" text,
	"status" "delivery_status" DEFAULT 'QUEUED' NOT NULL,
	"reason" text,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token" text NOT NULL,
	"user_agent" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"owner_id" uuid,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"scan_status" "file_scan_status" DEFAULT 'PENDING' NOT NULL,
	"scan_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"notice_version" text NOT NULL,
	"source" text NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"reason" text,
	"status" "data_request_status" DEFAULT 'PENDING' NOT NULL,
	"decided_by_id" uuid,
	"decision_note" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_export_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "data_request_status" DEFAULT 'PENDING' NOT NULL,
	"file_id" uuid,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"category" text NOT NULL,
	"purpose" text NOT NULL,
	"owner" text NOT NULL,
	"retention_days" integer,
	"visibility" text NOT NULL,
	"deletion_policy" text NOT NULL,
	"export_policy" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"leaderboard_visibility" "leaderboard_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"profile_visibility" text DEFAULT 'INSTITUTION' NOT NULL,
	"show_streaks" boolean DEFAULT false NOT NULL,
	"show_achievements" boolean DEFAULT true NOT NULL,
	"show_event_participation" boolean DEFAULT false NOT NULL,
	"personalized_recommendations" boolean DEFAULT true NOT NULL,
	"ai_memory_enabled" boolean DEFAULT false NOT NULL,
	"ai_coach_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "registration_policy" jsonb DEFAULT '{"mode":"DISABLED"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "is_listed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "delivery_planned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_file_id_stored_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_preferences" ADD CONSTRAINT "privacy_preferences_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_preferences" ADD CONSTRAINT "privacy_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_subject_uq" ON "auth_identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE INDEX "auth_identities_user_idx" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_uq" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_idx" ON "auth_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "notification_deliveries_queue_idx" ON "notification_deliveries" USING btree ("status","run_after") WHERE status = 'QUEUED';--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_idx" ON "notification_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_channel_uq" ON "notification_deliveries" USING btree ("notification_id","channel") WHERE notification_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_token_uq" ON "push_subscriptions" USING btree ("kind","token");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expiry_idx" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_files_key_uq" ON "stored_files" USING btree ("provider","storage_key");--> statement-breakpoint
CREATE INDEX "stored_files_owner_idx" ON "stored_files" USING btree ("institution_id","owner_id");--> statement-breakpoint
CREATE INDEX "consent_records_user_idx" ON "consent_records" USING btree ("user_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "data_deletion_requests_status_idx" ON "data_deletion_requests" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "data_deletion_requests_inflight_uq" ON "data_deletion_requests" USING btree ("user_id","scope") WHERE status IN ('PENDING','PROCESSING');--> statement-breakpoint
CREATE INDEX "data_export_requests_user_idx" ON "data_export_requests" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_export_requests_inflight_uq" ON "data_export_requests" USING btree ("user_id") WHERE status IN ('PENDING','PROCESSING');--> statement-breakpoint
CREATE UNIQUE INDEX "data_retention_policies_uq" ON "data_retention_policies" USING btree ("institution_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_preferences_user_uq" ON "privacy_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_unplanned_idx" ON "notifications" USING btree ("created_at") WHERE delivery_planned_at IS NULL;--> statement-breakpoint
-- ===========================================================================
-- Hand-written section (CampusOS 2.0 Phase 1). Everything below is idempotent.
-- ===========================================================================

-- Existing notifications were delivered in-app under v1. Mark them planned so
-- the new delivery planner never emails a backlog of historical notices.
UPDATE notifications SET delivery_planned_at = created_at WHERE delivery_planned_at IS NULL;
--> statement-breakpoint
-- Accounts issued by the institution (seed, import, admin-created) were
-- provisioned against an institutional address; treat them as verified.
UPDATE users SET email_verified_at = created_at
 WHERE email_verified_at IS NULL AND status = 'ACTIVE';
--> statement-breakpoint
-- Repair (v1 defect D11): `db:push` created resources.search_vector as a plain
-- column, so the later `ADD COLUMN IF NOT EXISTS ... GENERATED` was skipped and
-- full-text search was never populated. Recreate it as a generated column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'resources'
       AND column_name = 'search_vector' AND is_generated = 'NEVER'
  ) THEN
    DROP INDEX IF EXISTS resources_search_idx;
    ALTER TABLE resources DROP COLUMN search_vector;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(topic, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', left(coalesce(extracted_text, ''), 100000)), 'D')
  ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS resources_search_idx ON resources USING GIN (search_vector);
--> statement-breakpoint
-- Consent history is evidence. It must not be rewritable by the application.
DROP TRIGGER IF EXISTS consent_records_no_update ON consent_records;
--> statement-breakpoint
CREATE TRIGGER consent_records_no_update
  BEFORE UPDATE OR DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION campusos_block_audit_mutation();
--> statement-breakpoint
ALTER TABLE rate_limit_buckets DROP CONSTRAINT IF EXISTS rate_limit_buckets_count_ck;
--> statement-breakpoint
ALTER TABLE rate_limit_buckets ADD CONSTRAINT rate_limit_buckets_count_ck CHECK (count >= 0);
--> statement-breakpoint
ALTER TABLE stored_files DROP CONSTRAINT IF EXISTS stored_files_size_ck;
--> statement-breakpoint
ALTER TABLE stored_files ADD CONSTRAINT stored_files_size_ck CHECK (size_bytes > 0);
--> statement-breakpoint
ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_expiry_ck;
--> statement-breakpoint
ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_expiry_ck CHECK (expires_at > created_at);
--> statement-breakpoint
ALTER TABLE privacy_preferences DROP CONSTRAINT IF EXISTS privacy_preferences_profile_ck;
--> statement-breakpoint
ALTER TABLE privacy_preferences ADD CONSTRAINT privacy_preferences_profile_ck
  CHECK (profile_visibility IN ('INSTITUTION', 'PRIVATE'));
--> statement-breakpoint
ALTER TABLE data_deletion_requests DROP CONSTRAINT IF EXISTS data_deletion_requests_scope_ck;
--> statement-breakpoint
ALTER TABLE data_deletion_requests ADD CONSTRAINT data_deletion_requests_scope_ck
  CHECK (scope IN ('ACCOUNT', 'PERSONAL_TRACKER', 'AI_MEMORY'));
--> statement-breakpoint
-- The shared append-only guard now names the table it protects.
CREATE OR REPLACE FUNCTION campusos_block_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Keep updated_at honest on tables added since 0001.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND c.table_name NOT IN ('audit_logs', 'grievance_events', 'consent_records')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION campusos_touch_updated_at()',
      t || '_touch_updated_at', t
    );
  END LOOP;
END $$;
