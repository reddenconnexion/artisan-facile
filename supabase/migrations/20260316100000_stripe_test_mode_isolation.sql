-- Migration: Add Stripe test mode fields for accounting isolation
-- Live and test mode Stripe data is stored separately to prevent cross-contamination
-- when switching between STRIPE_SECRET_KEY sk_live_... and sk_test_...

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_test_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_test_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_test_subscription_status TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_test_customer_id
  ON profiles (stripe_test_customer_id)
  WHERE stripe_test_customer_id IS NOT NULL;
