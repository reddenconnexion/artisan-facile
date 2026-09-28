-- Add 'trade' column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trade TEXT DEFAULT 'general';

-- Add comment to explain what it is
COMMENT ON COLUMN profiles.trade IS 'The primary trade of the artisan (e.g., plumber, electrician, general)';
