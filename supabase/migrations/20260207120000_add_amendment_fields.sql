-- Add support for Amendments (Avenants)
ALTER TABLE "public"."quotes" ADD COLUMN IF NOT EXISTS "parent_quote_id" bigint REFERENCES "public"."quotes"("id");
ALTER TABLE "public"."quotes" ADD COLUMN IF NOT EXISTS "amendment_details" jsonb DEFAULT '{}'::jsonb;

-- Update RLS if necessary (usually implicit if owner based)
-- Add index for performance
CREATE INDEX IF NOT EXISTS "quotes_parent_quote_id_idx" ON "public"."quotes" USING btree ("parent_quote_id");
