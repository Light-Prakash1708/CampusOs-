CREATE TABLE "campus_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"actor_hash" text NOT NULL,
	"college_key" text NOT NULL,
	"display_name" text NOT NULL,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_active_days" (
	"actor_hash" text NOT NULL,
	"day" date NOT NULL,
	"institution_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "product_active_days_actor_hash_day_pk" PRIMARY KEY("actor_hash","day")
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"actor_hash" text NOT NULL,
	"role" text NOT NULL,
	"event" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campus_interest" ADD CONSTRAINT "campus_interest_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_active_days" ADD CONSTRAINT "product_active_days_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campus_interest_actor_uq" ON "campus_interest" USING btree ("actor_hash");--> statement-breakpoint
CREATE INDEX "campus_interest_key_idx" ON "campus_interest" USING btree ("college_key");--> statement-breakpoint
CREATE INDEX "product_active_days_day_idx" ON "product_active_days" USING btree ("day");--> statement-breakpoint
CREATE INDEX "product_active_days_tenant_idx" ON "product_active_days" USING btree ("institution_id","day");--> statement-breakpoint
CREATE INDEX "product_events_event_time_idx" ON "product_events" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "product_events_tenant_time_idx" ON "product_events" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX "product_events_actor_time_idx" ON "product_events" USING btree ("actor_hash","created_at");