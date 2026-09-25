CREATE TABLE "tracker_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"amount" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_goal_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'PERSONAL' NOT NULL,
	"cadence" text DEFAULT 'DAILY' NOT NULL,
	"target_per_period" integer DEFAULT 1 NOT NULL,
	"unit" text,
	"start_date" date NOT NULL,
	"target_date" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"title" text NOT NULL,
	"due_date" date,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"source" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"ref_id" uuid,
	"idempotency_key" text NOT NULL,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracker_checkins" ADD CONSTRAINT "tracker_checkins_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_checkins" ADD CONSTRAINT "tracker_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_checkins" ADD CONSTRAINT "tracker_checkins_goal_id_tracker_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."tracker_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_goal_steps" ADD CONSTRAINT "tracker_goal_steps_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_goal_steps" ADD CONSTRAINT "tracker_goal_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_goal_steps" ADD CONSTRAINT "tracker_goal_steps_goal_id_tracker_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."tracker_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_goals" ADD CONSTRAINT "tracker_goals_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_goals" ADD CONSTRAINT "tracker_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_tasks" ADD CONSTRAINT "tracker_tasks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_tasks" ADD CONSTRAINT "tracker_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_tasks" ADD CONSTRAINT "tracker_tasks_goal_id_tracker_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."tracker_goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_checkins_goal_day_uq" ON "tracker_checkins" USING btree ("goal_id","local_date");--> statement-breakpoint
CREATE INDEX "tracker_checkins_user_day_idx" ON "tracker_checkins" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "tracker_goal_steps_goal_idx" ON "tracker_goal_steps" USING btree ("goal_id","position");--> statement-breakpoint
CREATE INDEX "tracker_goals_user_idx" ON "tracker_goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "tracker_tasks_user_idx" ON "tracker_tasks" USING btree ("user_id","done_at","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_uq" ON "user_achievements" USING btree ("user_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_events_idempotency_uq" ON "xp_events" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "xp_events_user_idx" ON "xp_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "xp_events_board_idx" ON "xp_events" USING btree ("institution_id","verified","local_date");--> statement-breakpoint
-- Hand-written ---------------------------------------------------------------
-- Value checks the services also enforce; the database is the last line.
ALTER TABLE "tracker_goals" ADD CONSTRAINT "tracker_goals_category_ck"
  CHECK (category IN ('STUDY','SKILL','HEALTH','READING','CAREER','PERSONAL'));--> statement-breakpoint
ALTER TABLE "tracker_goals" ADD CONSTRAINT "tracker_goals_cadence_ck"
  CHECK (cadence IN ('DAILY','WEEKLY','ONCE'));--> statement-breakpoint
ALTER TABLE "tracker_goals" ADD CONSTRAINT "tracker_goals_status_ck"
  CHECK (status IN ('ACTIVE','PAUSED','COMPLETED','ARCHIVED'));--> statement-breakpoint
ALTER TABLE "tracker_goals" ADD CONSTRAINT "tracker_goals_target_ck"
  CHECK (target_per_period BETWEEN 1 AND 20 AND (cadence <> 'WEEKLY' OR target_per_period <= 7));--> statement-breakpoint
ALTER TABLE "tracker_goals" ADD CONSTRAINT "tracker_goals_dates_ck"
  CHECK (target_date IS NULL OR target_date >= start_date);--> statement-breakpoint
ALTER TABLE "tracker_checkins" ADD CONSTRAINT "tracker_checkins_count_ck"
  CHECK (count BETWEEN 1 AND 50 AND (amount IS NULL OR amount BETWEEN 0 AND 100000));--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_amount_ck"
  CHECK (amount <> 0 AND amount BETWEEN -1000 AND 1000);--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_source_ck"
  CHECK (source IN ('EVENT_ATTENDED','CERTIFICATE_EARNED','GOAL_CHECKIN','GOAL_COMPLETED','STREAK_MILESTONE','CHALLENGE_COMPLETED','REVERSAL'));--> statement-breakpoint
-- The XP ledger is append-only: corrections are new (negative) rows. Deleting
-- is still allowed, because erasure requests must be able to remove it.
CREATE OR REPLACE FUNCTION campusos_xp_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'xp_events is append-only; record a REVERSAL instead' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER xp_events_no_update BEFORE UPDATE ON "xp_events"
  FOR EACH ROW EXECUTE FUNCTION campusos_xp_events_append_only();
