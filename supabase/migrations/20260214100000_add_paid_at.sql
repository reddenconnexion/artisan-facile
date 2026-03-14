-- Add missing payment tracking columns to quotes table
ALTER TABLE "public"."quotes" 
ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS "payment_method" TEXT;

-- Add index on paid_at for reporting performance
CREATE INDEX IF NOT EXISTS "quotes_paid_at_idx" ON "public"."quotes" ("paid_at");
