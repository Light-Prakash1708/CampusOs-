CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"subscription_id" uuid,
	"invoice_number" text NOT NULL,
	"financial_year" text NOT NULL,
	"sequence" integer NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"description" text NOT NULL,
	"seats" integer NOT NULL,
	"unit_price_paise" bigint NOT NULL,
	"subtotal_paise" bigint NOT NULL,
	"tax_rate_bp" integer DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint NOT NULL,
	"sac_code" text,
	"status" text DEFAULT 'ISSUED' NOT NULL,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"void_reason" text,
	"seller" jsonb NOT NULL,
	"buyer" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"status" text DEFAULT 'PILOT' NOT NULL,
	"seats" integer NOT NULL,
	"price_per_seat_paise" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"billing_name" text,
	"billing_address" text,
	"gstin" text,
	"place_of_supply" text,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_fy_seq_uq" ON "invoices" USING btree ("financial_year","sequence");--> statement-breakpoint
CREATE INDEX "invoices_institution_idx" ON "invoices" USING btree ("institution_id","issue_date");--> statement-breakpoint
CREATE INDEX "invoices_open_idx" ON "invoices" USING btree ("status") WHERE status = 'ISSUED';--> statement-breakpoint
CREATE INDEX "subscriptions_institution_idx" ON "subscriptions" USING btree ("institution_id","created_at");