-- Add wero_phone column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wero_phone TEXT;
