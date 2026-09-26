ALTER TABLE "institutions" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Append-only tables stay append-only, with one narrow exception: rows that
-- belong to the public demo tenant may be DELETED so the demo can be reset.
-- UPDATE is still never allowed, and real colleges are unaffected.
CREATE OR REPLACE FUNCTION campusos_block_audit_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM institutions i WHERE i.id = OLD.institution_id AND i.is_demo
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
