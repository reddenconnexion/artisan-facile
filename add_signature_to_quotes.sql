-- Add signature column to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signature text;
