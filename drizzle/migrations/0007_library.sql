CREATE TABLE "library_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"title" text NOT NULL,
	"authors" text,
	"isbn" text,
	"publisher" text,
	"edition" text,
	"published_year" integer,
	"department_id" uuid,
	"subject_id" uuid,
	"shelf" text,
	"total_copies" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"issued_by_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"renewals" integer DEFAULT 0 NOT NULL,
	"returned_at" timestamp with time zone,
	"returned_to_id" uuid,
	"fine_waived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"ready_until" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resource_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_returned_to_id_users_id_fk" FOREIGN KEY ("returned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_saves" ADD CONSTRAINT "resource_saves_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_saves" ADD CONSTRAINT "resource_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_saves" ADD CONSTRAINT "resource_saves_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_books_inst_idx" ON "library_books" USING btree ("institution_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "library_books_isbn_uq" ON "library_books" USING btree ("institution_id","isbn") WHERE isbn IS NOT NULL;--> statement-breakpoint
CREATE INDEX "library_loans_user_idx" ON "library_loans" USING btree ("user_id","returned_at");--> statement-breakpoint
CREATE INDEX "library_loans_book_idx" ON "library_loans" USING btree ("book_id","returned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "library_loans_open_uq" ON "library_loans" USING btree ("book_id","user_id") WHERE returned_at IS NULL;--> statement-breakpoint
CREATE INDEX "library_reservations_book_idx" ON "library_reservations" USING btree ("book_id","status","created_at");--> statement-breakpoint
CREATE INDEX "library_reservations_user_idx" ON "library_reservations" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "library_reservations_open_uq" ON "library_reservations" USING btree ("book_id","user_id") WHERE status IN ('WAITING', 'READY');--> statement-breakpoint
CREATE UNIQUE INDEX "resource_saves_uq" ON "resource_saves" USING btree ("user_id","resource_id");--> statement-breakpoint
-- Hand-written ---------------------------------------------------------------
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_copies_ck" CHECK (total_copies BETWEEN 0 AND 10000);--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_year_ck" CHECK (published_year IS NULL OR published_year BETWEEN 1450 AND 2200);--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_dates_ck" CHECK (due_at > issued_at AND (returned_at IS NULL OR returned_at >= issued_at) AND renewals BETWEEN 0 AND 20);--> statement-breakpoint
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_status_ck" CHECK (status IN ('WAITING','READY','FULFILLED','EXPIRED','CANCELLED'));
