ALTER TYPE "public"."grievance_status" ADD VALUE 'APPEALED';--> statement-breakpoint
CREATE TABLE "grievance_committee_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"position" text NOT NULL,
	"term_ends_on" date,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grievances" ADD COLUMN "statutory_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grievances" ADD COLUMN "appealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grievances" ADD COLUMN "appeal_reason" text;--> statement-breakpoint
ALTER TABLE "grievances" ADD COLUMN "ombudsperson_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grievance_committee_members" ADD CONSTRAINT "grievance_committee_members_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_committee_members" ADD CONSTRAINT "grievance_committee_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_committee_members" ADD CONSTRAINT "grievance_committee_members_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grievance_committee_member_uq" ON "grievance_committee_members" USING btree ("institution_id","user_id","body");--> statement-breakpoint
CREATE INDEX "grievance_committee_body_idx" ON "grievance_committee_members" USING btree ("institution_id","body");--> statement-breakpoint
ALTER TABLE "grievance_committee_members" ADD CONSTRAINT "grievance_committee_body_ck" CHECK ("body" IN ('SGRC', 'OMBUDSPERSON'));--> statement-breakpoint
ALTER TABLE "grievance_committee_members" ADD CONSTRAINT "grievance_committee_position_ck" CHECK ("position" IN ('CHAIR', 'MEMBER', 'STUDENT_INVITEE', 'OMBUDSPERSON'));
