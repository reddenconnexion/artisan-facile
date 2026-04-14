-- Migration: Track quote creation time and method for AI trial onboarding

-- Add creation tracking to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS creation_time_seconds INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS creation_method TEXT DEFAULT 'manual' CHECK (creation_method IN ('manual', 'ai'));

-- Add AI trial tracking to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_trial_used BOOLEAN DEFAULT false;

-- Index for efficient first-quote lookups
CREATE INDEX IF NOT EXISTS idx_quotes_user_method ON quotes(user_id, creation_method, created_at);
