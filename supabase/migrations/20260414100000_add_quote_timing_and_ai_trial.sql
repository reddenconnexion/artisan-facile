-- Migration: Track quote creation time and AI trial flow

-- Add creation timing and AI usage tracking to quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS creation_time_seconds INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS used_ai_generation BOOLEAN DEFAULT FALSE;

-- Add AI trial tracking to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_used_ai_trial BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_traditional_quote_time INTEGER;

-- Index on creation_time_seconds for aggregation queries (statistics)
CREATE INDEX IF NOT EXISTS idx_quotes_creation_time ON quotes(user_id, creation_time_seconds)
  WHERE creation_time_seconds IS NOT NULL;
