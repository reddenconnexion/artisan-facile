-- Migration to add last_followup_at to quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMP WITH TIME ZONE;
