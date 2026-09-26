CREATE TABLE "membership_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"from_institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"department_id" uuid,
	"program_id" uuid,
	"section_id" uuid,
	"year" integer NOT NULL,
	"roll_number" text NOT NULL,
	"document_file_id" uuid,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"email_domain_match" boolean DEFAULT false NOT NULL,
	"review_started_by_id" uuid,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_from_institution_id_institutions_id_fk" FOREIGN KEY ("from_institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_document_file_id_stored_files_id_fk" FOREIGN KEY ("document_file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_review_started_by_id_users_id_fk" FOREIGN KEY ("review_started_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_requests_open_uq" ON "membership_requests" USING btree ("user_id") WHERE status IN ('PENDING', 'UNDER_REVIEW');--> statement-breakpoint
CREATE INDEX "membership_requests_queue_idx" ON "membership_requests" USING btree ("institution_id","status","created_at");--> statement-breakpoint
CREATE INDEX "membership_requests_user_idx" ON "membership_requests" USING btree ("user_id","created_at");--> statement-breakpoint
-- Hand-written: closed vocabularies.
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_status_ck" CHECK ("status" IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'));--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_reason_ck" CHECK ("decision_reason" IS NULL OR "decision_reason" IN ('ID_UNCLEAR', 'ID_EXPIRED', 'INFO_MISMATCH', 'WRONG_INSTITUTION', 'DUPLICATE', 'NEEDS_MORE_INFO', 'OTHER'));--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_year_ck" CHECK ("year" BETWEEN 1 AND 8);--> statement-breakpoint
ALTER TABLE "membership_requests" ADD CONSTRAINT "membership_requests_note_ck" CHECK ("decision_note" IS NULL OR char_length("decision_note") <= 300);
