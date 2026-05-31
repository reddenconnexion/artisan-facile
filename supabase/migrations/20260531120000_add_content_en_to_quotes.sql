-- Traduction anglaise du contenu libre d'un devis (titre, notes, descriptions
-- de lignes). Stockée à part pour ne JAMAIS altérer le contenu français source
-- ni les montants. Forme :
--   { "title": "...", "notes": "...", "lines": { "<desc FR>": "<desc EN>" } }
-- Les descriptions sont indexées par leur texte français : une ligne inchangée
-- réutilise sa traduction, une ligne modifiée est retraduite à l'envoi suivant.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS content_en JSONB DEFAULT NULL;

-- Réexpose tous les champs publics + le nouveau content_en, afin que le PDF/
-- portail consulté via un lien "?lang=en" puisse afficher la version anglaise.
CREATE OR REPLACE FUNCTION get_public_quote(lookup_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  v_quote_id BIGINT;
  v_user_id UUID;
BEGIN
  SELECT id, user_id INTO v_quote_id, v_user_id
  FROM quotes
  WHERE public_token = lookup_token
    AND (token_revoked IS NULL OR token_revoked = FALSE)
    AND (token_expires_at IS NULL OR token_expires_at > NOW());

  IF v_quote_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE quotes
  SET last_viewed_at = NOW()
  WHERE id = v_quote_id;

  INSERT INTO public.quote_views (quote_id, user_id, viewed_at)
  VALUES (v_quote_id, v_user_id, NOW());

  SELECT jsonb_build_object(
    'id', q.id,
    'quote_number', q.quote_number,
    'date', q.date,
    'valid_until', q.valid_until,
    'updated_at', q.updated_at,
    'items', q.items,
    'total_ht', q.total_ht,
    'total_tva', q.total_tva,
    'total_ttc', q.total_ttc,
    'include_tva', q.include_tva,
    'notes', q.notes,
    'content_en', q.content_en,
    'status', q.status,
    'title', q.title,
    'type', q.type,
    'is_external', q.is_external,
    'signature', q.signature,
    'signed_at', q.signed_at,
    'bon_pour_accord', q.bon_pour_accord,
    'original_pdf_url', q.original_pdf_url,
    'report_pdf_url', q.report_pdf_url,
    'has_material_deposit', q.has_material_deposit,
    'intervention_address', q.intervention_address,
    'intervention_postal_code', q.intervention_postal_code,
    'intervention_city', q.intervention_city,
    'require_otp', q.require_otp,
    'client', jsonb_build_object(
      'name', c.name,
      'address', c.address,
      'email', c.email,
      'postal_code', c.postal_code,
      'city', c.city,
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
  ) INTO result
  FROM quotes q
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN profiles p ON q.user_id = p.id
  WHERE q.id = v_quote_id;

  RETURN result;
END;
$$;
