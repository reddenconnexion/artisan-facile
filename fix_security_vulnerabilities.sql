-- 1. SECURE PROFILES TABLE
-- Drop the insecure public policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;

-- Create a strict policy: Users can ONLY see their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- Note: The 'get_public_quote' function is SECURITY DEFINER, so it will still work 
-- for public quote viewing even with this strict policy.


-- 2. SECURE STORAGE BUCKET
-- Make the bucket private so public URLs no longer work
UPDATE storage.buckets
SET public = false
WHERE id = 'quote_files';

-- Drop broad access policies
DROP POLICY IF EXISTS "Users can view quote files" ON storage.objects;

-- Create strict policy: Users can ONLY view files they own (uploaded by them)
CREATE POLICY "Users can view own quote files"
    ON storage.objects FOR SELECT
    USING ( bucket_id = 'quote_files' AND auth.uid() = owner );
