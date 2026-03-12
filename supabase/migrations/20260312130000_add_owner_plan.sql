-- Migration: Add 'owner' plan tier for the app owner (bypasses all limits)
-- After applying this migration, run in the Supabase console:
-- UPDATE profiles SET plan = 'owner' WHERE email = 'your@email.com';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'pro', 'owner'));
