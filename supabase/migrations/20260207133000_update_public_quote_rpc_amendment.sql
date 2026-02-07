-- Update get_public_quote to include amendment details and parent quote data
-- Uses single-statement SQL (with CTE) to avoid client-side semicolon splitting issues
CREATE OR REPLACE FUNCTION get_public_quote(lookup_token UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH view_update AS (
    UPDATE quotes 
    SET last_viewed_at = NOW() 
    WHERE public_token = lookup_token
    RETURNING id
  )
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
    'type', q.type,
    'is_external', q.is_external,
    'signature', q.signature,
    'signed_at', q.signed_at,
    'original_pdf_url', q.original_pdf_url,
    'has_material_deposit', q.has_material_deposit,
    'intervention_address', q.intervention_address,
    'intervention_postal_code', q.intervention_postal_code,
    'intervention_city', q.intervention_city,
    'amendment_details', q.amendment_details,
    'parent_quote_id', q.parent_quote_id,
    'parent_quote_data', CASE WHEN pq.id IS NOT NULL THEN jsonb_build_object(
      'id', pq.id,
      'date', pq.date,
      'title', pq.title,
      'total_ht', pq.total_ht,
      'total_tva', pq.total_tva,
      'total_ttc', pq.total_ttc
    ) ELSE NULL END,
    'client', jsonb_build_object(
      'name', c.name,
      'address', c.address,
      'email', c.email,
      'siren', c.siren,
      'tva_intracom', c.tva_intracom
    ),
    'artisan', jsonb_build_object(
      'id', p.id,
      'company_name', p.company_name,
      'full_name', p.full_name,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'phone', p.phone,
      'professional_email', p.professional_email,
      'email', p.professional_email,
      'siret', p.siret,
      'logo_url', p.logo_url,
      'website', p.website,
      'iban', p.iban,
      'wero_phone', p.wero_phone
    )
  )
  FROM quotes q
  LEFT JOIN quotes pq ON q.parent_quote_id = pq.id
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN profiles p ON q.user_id = p.id
  WHERE q.public_token = lookup_token;
$$;
