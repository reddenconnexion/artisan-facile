-- Add public_token to quotes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'public_token') THEN
        ALTER TABLE quotes ADD COLUMN public_token UUID DEFAULT gen_random_uuid();
    END IF;
END $$;

-- RPC to get a quote by its public token (Partial data for safety)
CREATE OR REPLACE FUNCTION get_public_quote(lookup_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', q.id,
    'date', q.date,
    'valid_until', q.valid_until,
    'items', q.items,
    'total_ht', q.total_ht,
    'total_tva', q.total_tva,
    'total_ttc', q.total_ttc,
    'notes', q.notes,
    'status', q.status,
    'title', q.title,
    'signature', q.signature,
    'client', jsonb_build_object(
      'name', c.name,
      'address', c.address,
      'email', c.email
    ),
    'artisan', jsonb_build_object(
      'company_name', p.company_name,
      'full_name', p.full_name,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'phone', p.phone,
      'email', p.professional_email,
      'siret', p.siret,
      'logo_url', p.logo_url
    )
  ) INTO result
  FROM quotes q
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN profiles p ON q.user_id = p.id
  WHERE q.public_token = lookup_token;

  RETURN result;
END;
$$;

-- RPC to sign a quote by its public token
DROP FUNCTION IF EXISTS sign_public_quote(uuid, text);
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
