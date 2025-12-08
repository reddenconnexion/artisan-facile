-- Add google_review_url column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS google_review_url TEXT;

-- Comment on column
COMMENT ON COLUMN profiles.google_review_url IS 'URL for Google Business Reviews';
