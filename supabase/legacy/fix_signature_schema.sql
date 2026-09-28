-- Add signature column to quotes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'signature') THEN
        ALTER TABLE quotes ADD COLUMN signature TEXT;
    END IF;
END $$;

-- Add signed_at column to quotes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'signed_at') THEN
        ALTER TABLE quotes ADD COLUMN signed_at TIMESTAMPTZ;
    END IF;
END $$;

-- Re-apply the signing function to ensure it matches the schema
CREATE OR REPLACE FUNCTION sign_public_quote(lookup_token UUID, signature_base64 TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE quotes
  SET signature = signature_base64,
      status = 'accepted',
      signed_at = NOW()
  WHERE public_token = lookup_token;
  
  RETURN FOUND;
END;
$$;
