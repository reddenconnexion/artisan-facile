-- Add ai_preferences column to profiles table to store AI settings (API keys, rates, zones, instructions)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_preferences JSONB DEFAULT '{}'::jsonb;

-- Comment on column
COMMENT ON COLUMN profiles.ai_preferences IS 'Stores AI configuration: api_keys, hourly_rate, travel_zones, instructions';
