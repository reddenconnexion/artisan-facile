-- Update get_public_quote to include report_pdf_url
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
    'report_pdf_url', q.report_pdf_url,
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
      'total_ttc', pq.total_ttc,
      'progress_total', (
        SELECT COALESCE(SUM(total_ttc), 0)
        FROM quotes
        WHERE parent_id = pq.id
        AND type = 'invoice'
        AND status != 'cancelled'
      )
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

-- Update get_portal_data to include intervention reports (completed/signed only)
CREATE OR REPLACE FUNCTION get_portal_data(token_input uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  client_data json;
  artisan_profile json;
  client_quotes json;
  client_photos json;
  client_reports json;
  target_client_id bigint;
  target_user_id uuid;
BEGIN
  -- 1. Identify Client and User (Artisan) from Token
  SELECT id, user_id INTO target_client_id, target_user_id
  FROM clients
  WHERE portal_token = token_input;

  IF target_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Fetch Client Data
  SELECT row_to_json(c) INTO client_data
  FROM clients c
  WHERE id = target_client_id;

  -- 3. Fetch Artisan Profile
  SELECT row_to_json(p) INTO artisan_profile
  FROM profiles p
  WHERE id = target_user_id;

  -- 4. Fetch Quotes
  SELECT json_agg(q ORDER BY date DESC) INTO client_quotes
  FROM quotes q
  WHERE client_id = target_client_id;

  -- 5. Fetch Photos
  SELECT json_agg(pp ORDER BY created_at DESC) INTO client_photos
  FROM project_photos pp
  WHERE client_id = target_client_id;

  -- 6. Fetch Intervention Reports (completed or signed only, with PDF link)
  SELECT json_agg(
    json_build_object(
      'id', ir.id,
      'title', ir.title,
      'date', ir.date,
      'status', ir.status,
      'report_number', ir.report_number,
      'report_pdf_url', ir.report_pdf_url,
      'signed_at', ir.signed_at,
      'signer_name', ir.signer_name
    )
    ORDER BY ir.date DESC
  ) INTO client_reports
  FROM intervention_reports ir
  WHERE ir.client_id = target_client_id
    AND ir.status IN ('completed', 'signed');

  -- 7. Construct Response
  RETURN json_build_object(
    'client', client_data,
    'artisan', artisan_profile,
    'quotes', COALESCE(client_quotes, '[]'::json),
    'photos', COALESCE(client_photos, '[]'::json),
    'reports', COALESCE(client_reports, '[]'::json)
  );
END;
$$;
