-- ──────────────────────────────────────────────────────────────────────────────
-- get_public_quote : distinguer acompte et situation dans l'ajustement financier
-- de l'avenant (suivi de 20260705120000).
--
-- Un avenant COMPLÈTE le devis initial (modèle additif) ; il ne le remplace pas.
-- Jusqu'ici parent_quote_data.progress_total additionnait TOUTES les factures
-- rattachées au devis parent — acomptes compris. Un simple acompte matériel était
-- donc pris pour une situation d'avancement, et le PDF de l'avenant basculait à
-- tort en mode « remplacement » : « Nouveau Total Projet = acompte + avenant »
-- (ex. 140 − 80 = 60 €) au lieu de « devis initial + avenant » (305 €), sans jamais
-- déduire l'acompte pour afficher le vrai reste à régler.
--
-- Correctif, symétrique à celui du formulaire artisan (DevisForm) :
--   - progress_total ne compte plus que les vraies situations d'avancement ;
--   - deposit_total (nouveau) expose la somme des acomptes déjà versés, à déduire.
-- Les factures de clôture sont exclues des deux.
--
-- Classification alignée sur le JS : une facture est une SITUATION si
-- amendment_details.situation est présent OU si son titre contient « situation ».
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
    'items', public.client_facing_items(q.items, q.client_display_mode),
    'total_ht', q.total_ht,
    'total_tva', q.total_tva,
    'total_ttc', q.total_ttc,
    'include_tva', q.include_tva,
    'notes', q.notes,
    'content_en', q.content_en,
    'status', q.status,
    'title', q.title,
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
