CREATE TABLE "event_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"verification_code" text NOT NULL,
	"kind" text DEFAULT 'PARTICIPATION' NOT NULL,
	"recipient_name" text NOT NULL,
	"issued_by_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "event_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"checked_in_by_id" uuid,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"reporter_id" uuid,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "event_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"priority" "announcement_priority" DEFAULT 'NORMAL' NOT NULL,
	"audience" text DEFAULT 'FOLLOWERS' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "status" text DEFAULT 'REGISTERED' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "attendee_institution_id" uuid;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "team_name" text;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "category" text DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "visibility" text DEFAULT 'INSTITUTION' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "organizer_type" text DEFAULT 'COLLEGE' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "organizer_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "verification" text DEFAULT 'VERIFIED_COLLEGE' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "mode" text DEFAULT 'OFFLINE' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "online_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "price_inr" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "certificate_offered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "team_size_min" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "team_size_max" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "eligibility" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "rules" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "prizes" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "agenda" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "faqs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "social_links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "registration_mode" text DEFAULT 'INSTANT' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "waitlist_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "moderation_note" text;--> statement-breakpoint
ALTER TABLE "event_certificates" ADD CONSTRAINT "event_certificates_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_certificates" ADD CONSTRAINT "event_certificates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_certificates" ADD CONSTRAINT "event_certificates_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_certificates" ADD CONSTRAINT "event_certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_certificates" ADD CONSTRAINT "event_certificates_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_checked_in_by_id_users_id_fk" FOREIGN KEY ("checked_in_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_saves" ADD CONSTRAINT "event_saves_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_saves" ADD CONSTRAINT "event_saves_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_saves" ADD CONSTRAINT "event_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_updates" ADD CONSTRAINT "event_updates_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_updates" ADD CONSTRAINT "event_updates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_updates" ADD CONSTRAINT "event_updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_certificates_code_uq" ON "event_certificates" USING btree ("verification_code");--> statement-breakpoint
CREATE UNIQUE INDEX "event_certificates_registration_uq" ON "event_certificates" USING btree ("registration_id","kind");--> statement-breakpoint
CREATE INDEX "event_certificates_user_idx" ON "event_certificates" USING btree ("user_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_checkins_registration_uq" ON "event_checkins" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "event_checkins_event_idx" ON "event_checkins" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_reports_once_uq" ON "event_reports" USING btree ("event_id","reporter_id");--> statement-breakpoint
CREATE INDEX "event_reports_status_idx" ON "event_reports" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "event_saves_uq" ON "event_saves" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_saves_user_idx" ON "event_saves" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_updates_event_idx" ON "event_updates" USING btree ("event_id","created_at");--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_attendee_institution_id_institutions_id_fk" FOREIGN KEY ("attendee_institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_registrations_code_uq" ON "event_registrations" USING btree ("event_id","code");--> statement-breakpoint
CREATE INDEX "event_registrations_user_idx" ON "event_registrations" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "event_registrations_event_status_idx" ON "event_registrations" USING btree ("event_id","status","registered_at");--> statement-breakpoint
CREATE INDEX "events_discovery_idx" ON "events" USING btree ("visibility","status","starts_at");--> statement-breakpoint
CREATE INDEX "events_city_idx" ON "events" USING btree ("city","starts_at");--> statement-breakpoint
-- ===========================================================================
-- Hand-written section (Events 2.0). Idempotent.
-- ===========================================================================
UPDATE event_registrations SET status = 'CANCELLED' WHERE cancelled_at IS NOT NULL AND status = 'REGISTERED';
--> statement-breakpoint
UPDATE event_registrations SET code = upper(substr(md5(id::text), 1, 6)) WHERE code IS NULL;
--> statement-breakpoint
UPDATE event_registrations r SET attendee_institution_id = u.institution_id
  FROM users u WHERE u.id = r.user_id AND r.attendee_institution_id IS NULL;
--> statement-breakpoint
UPDATE events SET published_at = created_at WHERE published_at IS NULL AND status IN ('SCHEDULED', 'COMPLETED');
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_category_ck;
  ALTER TABLE events ADD CONSTRAINT events_category_ck CHECK (category IN
    ('HACKATHON','FEST','COMPETITION','CASE_COMPETITION','DEBATE','MUN','WORKSHOP','SEMINAR','SPORTS',
     'CULTURAL','ENTREPRENEURSHIP','CLUB','CAREER','NETWORKING','OPEN_MIC','OTHER'));
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_visibility_ck;
  ALTER TABLE events ADD CONSTRAINT events_visibility_ck CHECK (visibility IN ('INSTITUTION','PUBLIC'));
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_organizer_type_ck;
  ALTER TABLE events ADD CONSTRAINT events_organizer_type_ck CHECK (organizer_type IN ('COLLEGE','CLUB','STUDENT','EXTERNAL'));
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_verification_ck;
  ALTER TABLE events ADD CONSTRAINT events_verification_ck CHECK (verification IN
    ('VERIFIED_COLLEGE','VERIFIED_CLUB','VERIFIED_ORGANIZER','COMMUNITY','PENDING'));
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_mode_ck;
  ALTER TABLE events ADD CONSTRAINT events_mode_ck CHECK (mode IN ('OFFLINE','ONLINE','HYBRID'));
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_registration_mode_ck;
  ALTER TABLE events ADD CONSTRAINT events_registration_mode_ck CHECK (registration_mode IN ('INSTANT','APPROVAL','INVITE_ONLY'));
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_price_ck;
  ALTER TABLE events ADD CONSTRAINT events_price_ck CHECK (price_inr >= 0);
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_team_ck;
  ALTER TABLE events ADD CONSTRAINT events_team_ck CHECK (team_size_min >= 1 AND team_size_max >= team_size_min);
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_capacity_ck;
  ALTER TABLE events ADD CONSTRAINT events_capacity_ck CHECK (capacity IS NULL OR capacity > 0);
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_deadline_ck;
  ALTER TABLE events ADD CONSTRAINT events_deadline_ck CHECK (registration_deadline IS NULL OR registration_deadline <= ends_at);
  ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_status_ck;
  ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_status_ck CHECK (status IN
    ('REGISTERED','WAITLISTED','PENDING_APPROVAL','REJECTED','CANCELLED'));
  ALTER TABLE event_checkins DROP CONSTRAINT IF EXISTS event_checkins_method_ck;
  ALTER TABLE event_checkins ADD CONSTRAINT event_checkins_method_ck CHECK (method IN ('QR','CODE','MANUAL'));
  ALTER TABLE event_reports DROP CONSTRAINT IF EXISTS event_reports_reason_ck;
  ALTER TABLE event_reports ADD CONSTRAINT event_reports_reason_ck CHECK (reason IN ('FAKE','SPAM','WRONG_DETAILS','INAPPROPRIATE','OTHER'));
END $$;
--> statement-breakpoint
-- Capacity and deadline are enforced by the database, not only the service.
-- The trigger locks the event row, which serialises concurrent registrations
-- for the same event: two students clicking the last seat at the same instant
-- cannot both get it.
CREATE OR REPLACE FUNCTION campusos_event_registration_guard()
RETURNS trigger AS $$
DECLARE
  ev RECORD;
  taken integer;
BEGIN
  SELECT capacity, registration_deadline, status INTO ev FROM events WHERE id = NEW.event_id FOR UPDATE;
  IF TG_OP = 'INSERT' AND ev.registration_deadline IS NOT NULL AND now() > ev.registration_deadline THEN
    RAISE EXCEPTION 'registration for this event has closed' USING ERRCODE = 'check_violation',
      CONSTRAINT = 'event_registration_deadline';
  END IF;
  IF NEW.status = 'REGISTERED' AND ev.capacity IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'REGISTERED') THEN
    SELECT count(*) INTO taken FROM event_registrations
     WHERE event_id = NEW.event_id AND status = 'REGISTERED' AND id <> NEW.id;
    IF taken >= ev.capacity THEN
      RAISE EXCEPTION 'this event is full' USING ERRCODE = 'check_violation',
        CONSTRAINT = 'event_registration_capacity';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_registrations_guard ON event_registrations;
--> statement-breakpoint
CREATE TRIGGER event_registrations_guard
  BEFORE INSERT OR UPDATE OF status ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION campusos_event_registration_guard();
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
      AND c.table_name IN ('event_registrations')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION campusos_touch_updated_at()', t || '_touch_updated_at', t);
  END LOOP;
END $$;
