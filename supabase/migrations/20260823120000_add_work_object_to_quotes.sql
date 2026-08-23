-- Objet des travaux : paragraphe descriptif du périmètre, distinct du titre.
--
-- Le titre (quotes.title) reste le nom court du projet : il sert de nom de
-- dossier projet à l'acceptation, d'intitulé dans les emails au client et de
-- base aux heuristiques de type (situation / clôture / acompte). Il ne peut
-- donc pas porter une description de plusieurs lignes.
--
-- work_object accueille cette description : ce qui est compris, ce qui ne
-- l'est pas, et les constats qui conditionnent le prix (longueurs relevées,
-- alimentation existante...). C'est la référence du périmètre quand un
-- avenant doit être justifié plus tard.
alter table quotes
    add column if not exists work_object text;

comment on column quotes.work_object is 'Objet des travaux : paragraphe de périmètre affiché sous le titre sur le devis (facultatif)';

-- get_public_quote : exposer work_object au client final (lien public).
-- Définition reprise de 20260822130000, avec work_object.
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
    'invoice_number', q.invoice_number,
    'date', q.date,
    'valid_until', q.valid_until,
    'updated_at', q.updated_at,
    'items', public.client_facing_items(q.items, q.client_display_mode),
    'total_ht', q.total_ht,
    'total_tva', q.total_tva,
    'total_ttc', q.total_ttc,
    'include_tva', q.include_tva,
    'notes', q.notes,
    'content_en', q.content_en,
    'status', q.status,
    'title', q.title,
    'work_object', q.work_object,
    'type', q.type,
    'client_display_mode', q.client_display_mode,
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
      'invoice_number', pq.invoice_number,
      'date', pq.date,
      'title', pq.title,
      'total_ht', pq.total_ht,
      'total_tva', pq.total_tva,
      'total_ttc', pq.total_ttc,
      -- Situations d'avancement uniquement (facturation par tranches).
      'progress_total', (
        SELECT COALESCE(SUM(total_ttc), 0)
        FROM quotes ci
        WHERE ci.parent_id = pq.id
          AND ci.type = 'invoice'
          AND ci.status != 'cancelled'
          AND COALESCE(ci.title, '') !~* 'cl[oô]ture'
          AND ( (ci.amendment_details -> 'situation') IS NOT NULL
                OR COALESCE(ci.title, '') ~* 'situation' )
      ),
      -- Acomptes déjà versés (tout le reste, hors clôture), à déduire du solde.
      'deposit_total', (
        SELECT COALESCE(SUM(total_ttc), 0)
        FROM quotes ci
        WHERE ci.parent_id = pq.id
          AND ci.type = 'invoice'
          AND ci.status != 'cancelled'
          AND COALESCE(ci.title, '') !~* 'cl[oô]ture'
          AND NOT ( (ci.amendment_details -> 'situation') IS NOT NULL
                    OR COALESCE(ci.title, '') ~* 'situation' )
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
