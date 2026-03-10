-- Exclude draft quotes from client portal
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

  -- 4. Fetch Quotes (exclude drafts)
  SELECT json_agg(q ORDER BY date DESC) INTO client_quotes
  FROM quotes q
  WHERE client_id = target_client_id
    AND q.status != 'draft';

  -- 5. Fetch Photos
  SELECT json_agg(pp ORDER BY created_at DESC) INTO client_photos
  FROM project_photos pp
  WHERE client_id = target_client_id;

  -- 6. Fetch Intervention Reports (completed or signed only, full data for PDF generation)
  SELECT json_agg(
    json_build_object(
      'id', ir.id,
      'title', ir.title,
      'date', ir.date,
      'status', ir.status,
      'report_number', ir.report_number,
      'report_pdf_url', ir.report_pdf_url,
      'signed_at', ir.signed_at,
      'signer_name', ir.signer_name,
      'description', ir.description,
      'work_done', ir.work_done,
      'materials_used', ir.materials_used,
      'photos', ir.photos,
      'client_signature', ir.client_signature,
      'client_name', ir.client_name,
      'intervention_address', ir.intervention_address,
      'intervention_postal_code', ir.intervention_postal_code,
      'intervention_city', ir.intervention_city,
      'start_time', ir.start_time,
      'end_time', ir.end_time,
      'duration_hours', ir.duration_hours,
      'notes', ir.notes
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
