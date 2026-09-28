CREATE TABLE "college_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"college_name" text NOT NULL,
	"university" text,
	"city" text NOT NULL,
	"website" text,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_role" text NOT NULL,
	"student_count" integer,
	"message" text,
	"status" text DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "college_requests_status_idx" ON "college_requests" USING btree ("status","created_at");