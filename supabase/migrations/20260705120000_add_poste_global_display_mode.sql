-- ──────────────────────────────────────────────────────────────────────────────
-- Présentation client « Poste global » d'un devis détaillé
--
-- Troisième mode de présentation (client_display_mode) après « detailed » et
-- « grouped ». Là où « grouped » se contentait de masquer les colonnes Qté/PU
-- mais laissait CHAQUE ligne fourniture visible (un disjoncteur, un mètre de
-- câble…), « poste_global » FUSIONNE, section par section (Lot) :
--
--   • les fournitures obligatoires d'une même section  → UN seul poste
--     (libellé + un total HT unique — aucune quantité, aucun prix unitaire,
--      aucune référence, aucun composant) ;
--   • la main d'œuvre obligatoire d'une même section   → UNE seule ligne
--     (libellé de la prestation + total) ;
--   • les éléments vendus à l'unité (prises, spots, points lumineux) restent
--     quantifiés (« Prises encastrées — 17 u — total HT ») ;
--   • les lignes Option restent présentées séparément (une ligne chacune,
--     avec leur id pour rester sélectionnables sur le lien public).
--
-- SÉCURITÉ (non négociable) : la fusion se fait CÔTÉ SERVEUR, dans le même
-- périmètre SECURITY DEFINER que get_public_quote / get_portal_data. Les postes
-- sont RECONSTRUITS à partir d'une liste blanche de clés : aucune donnée interne
-- (buying_price, components, internal_note, reference) ni aucun quantitatif de
-- composant ne peut transiter vers le client, même agrégé.
--
-- INTÉGRITÉ : le montant d'un poste est la somme des montants EXACTS des lignes
-- détaillées sous-jacentes, arrondie une seule fois à la fin. Un contrôle
-- d'égalité (main d'œuvre incluse) vérifie que la somme des postes émis égale la
-- somme du détail à l'arrondi près ; en cas d'écart, on lève une erreur explicite
-- plutôt que de produire un devis faux.
--
-- La TVA (y compris la franchise en base, art. 293 B du CGI) n'est pas touchée :
-- seuls les items d'affichage changent, les totaux total_ht/tva/ttc restent ceux
-- stockés.
--
-- get_public_quote est reprise de 20260704130000 et get_portal_data de
-- 20260704120000 ; seule l'expression de `items` change (client_facing_items).
-- ──────────────────────────────────────────────────────────────────────────────

-- Étendre le mode d'affichage client au troisième mode.
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_client_display_mode_check;
ALTER TABLE quotes
    ADD CONSTRAINT quotes_client_display_mode_check
    CHECK (client_display_mode IN ('detailed', 'grouped', 'poste_global'));

COMMENT ON COLUMN quotes.client_display_mode IS
    'Présentation du devis côté client (PDF/lien public) : detailed = ligne à ligne, grouped = fournitures sans quantités, poste_global = un poste fusionné par section. Le détail reste toujours intact côté artisan.';

-- <<BEGIN poste_global pure functions>>
-- ──────────────────────────────────────────────────────────────────────────────
-- build_poste_global_items(items) : fusionne les lignes détaillées en postes.
--
-- Fonction PURE (aucun accès table) : elle prend le tableau JSONB des lignes
-- détaillées et renvoie le tableau des lignes telles que le client doit les voir
-- en mode « poste global ». Reconstruction par liste blanche → étanche par
-- construction aux champs internes.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.build_poste_global_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_out       jsonb;
  v_sum_in    numeric;   -- somme EXACTE de toutes les lignes détaillées
  v_sum_out   numeric;   -- somme EXACTE des lignes de sortie (postes + unité + options)
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN COALESCE(p_items, '[]'::jsonb);
  END IF;

  WITH raw AS (
    SELECT
      elem,
      ord,
      elem->>'type' AS jtype,
      -- Index de section = nombre de titres de section rencontrés jusqu'ici.
      -- Une ligne sans section (avant tout titre) reste dans le bucket 0.
      SUM(CASE WHEN elem->>'type' = 'section' THEN 1 ELSE 0 END)
        OVER (ORDER BY ord ROWS UNBOUNDED PRECEDING) AS sect_idx
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord)
  ),
  titles AS (
    SELECT sect_idx, elem->>'description' AS title
    FROM raw
    WHERE jtype = 'section'
  ),
  classified AS (
    SELECT
      r.elem,
      r.ord,
      r.sect_idx,
      CASE WHEN COALESCE(r.jtype, 'service') = 'material' THEN 'material' ELSE 'service' END AS grp,
      -- Montant EXACT de la ligne, calculé comme au moment de l'enregistrement
      -- du devis : (quantity || 0) * (price || 0).
      COALESCE(NULLIF(r.elem->>'quantity', '')::numeric, 0)
        * COALESCE(NULLIF(r.elem->>'price', '')::numeric, 0) AS amount,
      COALESCE((r.elem->>'is_optional')::boolean, false) AS is_opt,
      -- « À l'unité » : flag explicite par ligne s'il est présent (surcharge
      -- artisan), sinon défaut déduit de l'unité (u / pièce / point…).
      CASE
        WHEN r.elem ? 'display_per_unit'
          THEN COALESCE((r.elem->>'display_per_unit')::boolean, false)
        ELSE lower(trim(COALESCE(r.elem->>'unit', ''))) IN
             ('u', 'unité', 'unite', 'pièce', 'piece', 'pce', 'pc', 'point', 'pt', 'points')
      END AS per_unit_raw
    FROM raw r
    WHERE COALESCE(r.jtype, 'service') <> 'section'
  ),
  lines AS (
    SELECT
      c.*,
      (c.grp = 'material' AND c.per_unit_raw) AS per_unit,
      -- Fusionnable = obligatoire ET pas vendu à l'unité → entre dans le poste.
      (NOT c.is_opt AND NOT (c.grp = 'material' AND c.per_unit_raw)) AS mergeable
    FROM classified c
  ),
  -- (A) Poste main d'œuvre : une ligne par section.
  labor_postes AS (
    SELECT
      sect_idx, 0 AS slot, 0 AS ord2,
      jsonb_build_object(
        'type', 'service',
        'is_poste', true,
        'description', COALESCE(
          NULLIF(string_agg(NULLIF(trim(elem->>'description'), ''), ' ; ' ORDER BY ord), ''),
          (SELECT title FROM titles t WHERE t.sect_idx = l.sect_idx),
          'Main d''œuvre'
        ),
        'line_total', round(sum(amount), 2)
      ) AS obj,
      sum(amount) AS amt_exact
    FROM lines l
    WHERE grp = 'service' AND mergeable
    GROUP BY sect_idx
  ),
  -- (B) Poste fournitures : une ligne par section, libellé = titre de section.
  material_postes AS (
    SELECT
      sect_idx, 1 AS slot, 0 AS ord2,
      jsonb_build_object(
        'type', 'material',
        'is_poste', true,
        'description', COALESCE(
          (SELECT title FROM titles t WHERE t.sect_idx = l.sect_idx),
          CASE WHEN count(*) = 1 THEN NULLIF(trim(min(elem->>'description')), '') END,
          'Fournitures et matériel'
        ),
        'line_total', round(sum(amount), 2)
      ) AS obj,
      sum(amount) AS amt_exact
    FROM lines l
    WHERE grp = 'material' AND mergeable
    GROUP BY sect_idx
  ),
  -- (C) Fournitures vendues à l'unité (obligatoires) : restent quantifiées.
  per_unit_lines AS (
    SELECT
      sect_idx, 2 AS slot, ord AS ord2,
      jsonb_build_object(
        'type', 'material',
        'per_unit', true,
        'description', trim(elem->>'description'),
        'quantity', COALESCE(NULLIF(elem->>'quantity', '')::numeric, 0),
        'unit', COALESCE(NULLIF(elem->>'unit', ''), 'u'),
        'line_total', round(amount, 2)
      ) AS obj,
      amount AS amt_exact
    FROM lines
    WHERE grp = 'material' AND per_unit AND NOT is_opt
  ),
  -- (D) Options : présentées séparément, une ligne chacune, id préservé.
  option_lines AS (
    SELECT
      sect_idx, 3 AS slot, ord AS ord2,
      jsonb_strip_nulls(jsonb_build_object(
        'type', grp,
        'is_optional', true,
        'id', elem->'id',
        'option_group', NULLIF(elem->>'option_group', ''),
        'option_group_required', (elem->>'option_group_required')::boolean,
        'description', trim(elem->>'description'),
        'per_unit', CASE WHEN grp = 'material' AND per_unit THEN true ELSE NULL END,
        'quantity', CASE WHEN grp = 'material' AND per_unit
                         THEN COALESCE(NULLIF(elem->>'quantity', '')::numeric, 0) ELSE NULL END,
        'unit', CASE WHEN grp = 'material' AND per_unit
                     THEN COALESCE(NULLIF(elem->>'unit', ''), 'u') ELSE NULL END,
        'line_total', round(amount, 2)
      )) AS obj,
      amount AS amt_exact
    FROM lines
    WHERE is_opt
  ),
  emitted AS (
    SELECT * FROM labor_postes
    UNION ALL SELECT * FROM material_postes
    UNION ALL SELECT * FROM per_unit_lines
    UNION ALL SELECT * FROM option_lines
  )
  SELECT
    COALESCE(jsonb_agg(obj ORDER BY sect_idx, slot, ord2), '[]'::jsonb),
    COALESCE(sum(amt_exact), 0)
  INTO v_out, v_sum_out
  FROM emitted;

  SELECT COALESCE(sum(
           COALESCE(NULLIF(elem->>'quantity', '')::numeric, 0)
             * COALESCE(NULLIF(elem->>'price', '')::numeric, 0)
         ), 0)
  INTO v_sum_in
  FROM jsonb_array_elements(p_items) AS e(elem)
  WHERE COALESCE(elem->>'type', 'service') <> 'section';

  -- Contrôle d'égalité (main d'œuvre incluse). Comparé sur les montants exacts :
  -- l'arrondi n'intervient que sur l'affichage de chaque poste, jamais ici.
  IF abs(COALESCE(v_sum_in, 0) - COALESCE(v_sum_out, 0)) > 0.0001 THEN
    RAISE EXCEPTION
      'Poste global incohérent : somme des postes (%) ≠ somme du détail (%). Devis non produit.',
      round(COALESCE(v_sum_out, 0), 2), round(COALESCE(v_sum_in, 0), 2);
  END IF;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.build_poste_global_items(jsonb) IS
  'Fusionne les lignes détaillées d''un devis en postes globaux par section (liste blanche de clés, aucun champ interne). Lève une erreur si la somme des postes s''écarte de la somme du détail.';

-- ──────────────────────────────────────────────────────────────────────────────
-- client_facing_items(items, mode) : aiguilleur commun aux deux RPC publiques.
--   • poste_global → fusion en postes ;
--   • detailed / grouped → simple expurgation des champs internes.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.client_facing_items(p_items jsonb, p_mode text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_mode = 'poste_global' THEN public.build_poste_global_items(p_items)
    ELSE public.strip_internal_item_fields(p_items)
  END;
$$;

COMMENT ON FUNCTION public.client_facing_items(jsonb, text) IS
  'Rend les lignes d''un devis telles que le client doit les voir selon client_display_mode, en retirant toute donnée interne.';
-- <<END poste_global pure functions>>

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC pour l'aperçu artisan et le PDF joint à l'email (chemin C1) : même fusion
-- serveur, source unique. Ne lit aucune table — transforme les items fournis par
-- l'artisan (ses propres données) ; réservé aux utilisateurs authentifiés.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_client_facing_items(p_items jsonb, p_mode text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT public.client_facing_items(p_items, p_mode);
$$;

REVOKE ALL ON FUNCTION public.get_client_facing_items(jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_client_facing_items(jsonb, text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- get_public_quote : items rendus selon client_display_mode (poste_global inclus)
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
-- get_portal_data : items de chaque devis rendus selon leur client_display_mode
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

    -- Devis (hors brouillons) — items rendus selon le mode d'affichage client
    SELECT json_agg(
            jsonb_set(
              to_jsonb(q),
              '{items}',
              public.client_facing_items(q.items, q.client_display_mode)
            )::json
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
