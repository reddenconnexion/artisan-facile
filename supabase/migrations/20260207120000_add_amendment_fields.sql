-- Add support for Amendments (Avenants)
ALTER TABLE "public"."quotes" ADD COLUMN "parent_quote_id" uuid REFERENCES "public"."quotes"("id");
ALTER TABLE "public"."quotes" ADD COLUMN "amendment_details" jsonb DEFAULT '{}'::jsonb;

-- Update RLS if necessary (usually implicit if owner based)
-- Add index for performance
CREATE INDEX "quotes_parent_quote_id_idx" ON "public"."quotes" USING btree ("parent_quote_id");
