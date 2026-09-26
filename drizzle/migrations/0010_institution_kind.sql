ALTER TABLE "institutions" ADD COLUMN "kind" text DEFAULT 'COLLEGE' NOT NULL;--> statement-breakpoint
-- Hand-written: only the two known kinds. Existing rows are colleges (default).
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_kind_ck" CHECK ("kind" IN ('COLLEGE', 'PERSONAL'));
