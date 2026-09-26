CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"organization" text NOT NULL,
	"description" text,
	"location" text,
	"work_mode" text DEFAULT 'ONSITE' NOT NULL,
	"compensation" text,
	"apply_url" text,
	"deadline" timestamp with time zone,
	"eligibility" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"department_id" uuid,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"source" text NOT NULL,
	"source_name" text,
	"source_ref" text,
	"submitted_by_id" uuid,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"status" text DEFAULT 'SAVED' NOT NULL,
	"note" text,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_tracking" ADD CONSTRAINT "opportunity_tracking_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_tracking" ADD CONSTRAINT "opportunity_tracking_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_tracking" ADD CONSTRAINT "opportunity_tracking_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunities_inst_status_idx" ON "opportunities" USING btree ("institution_id","status","deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_source_ref_uq" ON "opportunities" USING btree ("institution_id","source_name","source_ref") WHERE source_ref IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_tracking_uq" ON "opportunity_tracking" USING btree ("user_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "opportunity_tracking_user_idx" ON "opportunity_tracking" USING btree ("user_id","status");--> statement-breakpoint
-- Hand-written ---------------------------------------------------------------
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_kind_ck" CHECK (kind IN ('INTERNSHIP','JOB','HACKATHON','COMPETITION','SCHOLARSHIP','FELLOWSHIP'));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_status_ck" CHECK (status IN ('PENDING','PUBLISHED','REJECTED','CLOSED'));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_source_ck" CHECK (source IN ('COLLEGE','STUDENT','FEED') AND (source <> 'FEED' OR (source_name IS NOT NULL AND source_ref IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_mode_ck" CHECK (work_mode IN ('ONSITE','REMOTE','HYBRID'));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_url_ck" CHECK (apply_url IS NULL OR apply_url ~ '^https?://');--> statement-breakpoint
ALTER TABLE "opportunity_tracking" ADD CONSTRAINT "opportunity_tracking_status_ck" CHECK (status IN ('SAVED','APPLIED','INTERVIEWING','OFFER','REJECTED','WITHDRAWN'));
