-- ──────────────────────────────────────────────────────────────────────────────
-- Confidentialité du chiffrage interne des lignes de devis
--
-- Les lignes de devis (quotes.items, JSONB) portent désormais des champs
-- strictement privés à l'artisan :
--   - buying_price  : prix d'achat de la ligne (existait déjà)
--   - components    : fournitures du « chiffrage interne » d'une ligne groupée
--                     (description, quantité, unité, prix d'achat)
--   - internal_note : note libre interne (repères chantier, fournisseur…)
--
-- Or deux RPC SECURITY DEFINER renvoyaient q.items TEL QUEL à des visiteurs
-- non authentifiés :
--   - get_public_quote  (lien public /q/:token)
--   - get_portal_data   (portail client /p/:token)
-- Le prix d'achat fuyait donc déjà vers le client ; le chiffrage interne
-- (dont tout l'intérêt est de rester invisible sur un devis « groupé »)
-- aurait fui de la même façon.
--
-- Cette migration ajoute strip_internal_item_fields() et l'applique aux deux
-- RPC. Les fonctions sont reprises à l'identique de leurs dernières versions
-- (20260702190000 pour get_public_quote, 20260507100000 pour get_portal_data),
-- seul le rendu de `items` change.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.strip_internal_item_fields(p_items jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_items IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(p_items) <> 'array' THEN p_items
    ELSE COALESCE(
      (
        SELECT jsonb_agg(
                 CASE WHEN jsonb_typeof(elem) = 'object'
                      THEN elem - 'buying_price' - 'components' - 'internal_note'
                      ELSE elem
                 END
                 ORDER BY ord
               )
          FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord)
      ),
      '[]'::jsonb
    )
  END;
$$;

COMMENT ON FUNCTION public.strip_internal_item_fields(jsonb) IS
  'Retire des lignes de devis les champs privés artisan (buying_price, components, internal_note) avant toute exposition publique.';

-- ──────────────────────────────────────────────────────────────────────────────
-- get_public_quote : items nettoyés
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_quote(lookup_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    'items', public.strip_internal_item_fields(q.items),
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
    'deposit_percentage', q.deposit_percentage,
    'intervention_address', q.intervention_address,
    'intervention_postal_code', q.intervention_postal_code,
    'intervention_city', q.intervention_city,
    'require_otp', q.require_otp,
    'amendment_details', q.amendment_details,
    'parent_id', q.parent_id,
    'parent_quote_id', q.parent_quote_id,
    'parent_quote_data', CASE WHEN pq.id IS NOT NULL THEN jsonb_build_object(
      'id', pq.id,
      'quote_number', pq.quote_number,
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
  LEFT JOIN quotes pq ON q.parent_quote_id = pq.id
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN profiles p ON q.user_id = p.id
  WHERE q.id = v_quote_id;

  RETURN result;
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────────────
-- get_portal_data : items des devis nettoyés
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_portal_data(token_input uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_client_id  bigint;
    target_user_id    uuid;
    v_revoked         boolean;
    v_expires_at      timestamptz;
    client_data       json;
    artisan_profile   json;
    client_quotes     json;
    client_photos     json;
    client_reports    json;
BEGIN
    -- Identifier client + artisan + état du token
    SELECT id, user_id, portal_token_revoked, portal_token_expires_at
      INTO target_client_id, target_user_id, v_revoked, v_expires_at
      FROM clients
     WHERE portal_token = token_input;

    IF target_client_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_revoked THEN
        RETURN json_build_object('error', 'revoked');
    END IF;

    IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
        RETURN json_build_object('error', 'expired', 'expired_at', v_expires_at);
    END IF;

    -- Données client
    SELECT row_to_json(c) INTO client_data
      FROM clients c
     WHERE id = target_client_id;

    -- Profil artisan
    SELECT row_to_json(p) INTO artisan_profile
      FROM profiles p
     WHERE id = target_user_id;

    -- Devis (hors brouillons) — items expurgés des champs privés artisan
    SELECT json_agg(
            jsonb_set(to_jsonb(q), '{items}', public.strip_internal_item_fields(q.items))::json
            ORDER BY q.date DESC
        ) INTO client_quotes
      FROM quotes q
     WHERE client_id = target_client_id
       AND q.status != 'draft';

    -- Photos
    SELECT json_agg(pp ORDER BY created_at DESC) INTO client_photos
      FROM project_photos pp
     WHERE client_id = target_client_id;

    -- Rapports d'intervention
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

    RETURN json_build_object(
        'client',   client_data,
        'artisan',  artisan_profile,
        'quotes',   COALESCE(client_quotes,  '[]'::json),
        'photos',   COALESCE(client_photos,  '[]'::json),
        'reports',  COALESCE(client_reports, '[]'::json)
    );
END;
$$;
