-- Update the CHECK constraint for quotes.type to include 'amendment'
ALTER TABLE "public"."quotes" DROP CONSTRAINT IF EXISTS "quotes_type_check";
ALTER TABLE "public"."quotes" ADD CONSTRAINT "quotes_type_check" CHECK (type IN ('quote', 'invoice', 'amendment'));
