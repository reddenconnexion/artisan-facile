-- Fix: restrict profiles SELECT to authenticated users reading their own row only.
-- The previous policy "Public profiles are viewable by everyone." used `using (true)`
-- which allowed any anonymous user with the anon key to read ALL profiles,
-- including sensitive fields like ai_preferences (API keys), iban, wero_phone, email.
-- SECURITY DEFINER functions (get_portal_data, get_public_quote) bypass RLS and
-- will continue to work correctly after this change.

DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;

CREATE POLICY "Users can view own profile."
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);
