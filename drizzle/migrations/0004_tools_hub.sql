CREATE TABLE "tool_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tool_key" text NOT NULL,
	"open_count" integer DEFAULT 1 NOT NULL,
	"last_opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_usage" ADD CONSTRAINT "tool_usage_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_usage" ADD CONSTRAINT "tool_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tool_usage_user_tool_uq" ON "tool_usage" USING btree ("user_id","tool_key");--> statement-breakpoint
-- Hand-written ---------------------------------------------------------------
ALTER TABLE "tool_usage" ADD CONSTRAINT "tool_usage_open_count_ck" CHECK (open_count >= 1);
--> statement-breakpoint
-- "Readdressal" was a misspelling of "Redressal" and the routes were renamed.
-- Rewrite links already stored in notifications so they point at the new
-- paths directly (the old paths also redirect, so this is belt and braces).
UPDATE notifications
   SET action_url = replace(action_url, '/readdressal', '/redressal')
 WHERE action_url LIKE '%/readdressal%';
