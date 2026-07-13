-- ──────────────────────────────────────────────────────────────────────────────
-- select_quote_options : rendre « fermes » les options retenues (suivi de 20260427120000)
--
-- Contexte : une ligne optionnelle porte `is_optional = true`. Le total ferme d'un
-- devis exclut partout ces lignes (devis public `mandatoryHT`, PDF `buildQuoteForPdf`,
-- calcul interne `calculateTotal`, acompte matériel). Or, jusqu'ici, quand le client
-- RETENAIT une option avant signature, la ligne était bien conservée mais gardait son
-- flag `is_optional = true`, et surtout `sign_public_quote` ne recalcule pas les totaux.
--
-- Conséquence : une option pourtant retenue et signée n'était pas comptée dans le
-- total ferme côté artisan (total interne, acompte matériel, facture de clôture).
--
-- Correctif, au moment où le client confirme ses options :
--   1. on supprime les options NON retenues (comportement inchangé) ;
--   2. on retire le flag `is_optional` des options retenues (elles deviennent fermes) ;
--   3. on recalcule total_ht / total_tva / total_ttc à partir des lignes conservées,
--      pour que le total stocké reflète immédiatement la sélection du client.
--
-- Les devis externes (`is_external`), dont les totaux sont saisis à la main, ne sont
-- pas recalculés : seules leurs lignes sont mises à jour.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION select_quote_options(
  p_token   TEXT,
  p_selected_ids TEXT[]
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          UUID;
  v_is_external BOOLEAN;
  v_include_tva BOOLEAN;
  v_items       JSONB;
  v_total_ht    NUMERIC;
BEGIN
  SELECT id, COALESCE(is_external, false), COALESCE(include_tva, true)
    INTO v_id, v_is_external, v_include_tva
  FROM quotes
  WHERE public_token = p_token
    AND status NOT IN ('accepted', 'paid');

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- (1)+(2) Reconstruit la liste des lignes : options non retenues supprimées,
  -- flag is_optional retiré sur les options retenues (→ lignes fermes).
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN (item->>'is_optional') = 'true'
           AND (item->>'id') = ANY(p_selected_ids)
      THEN item - 'is_optional'
      ELSE item
    END
  ), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements((SELECT items FROM quotes WHERE id = v_id)) AS item
  WHERE (item->>'is_optional') IS DISTINCT FROM 'true'
     OR (item->>'id') = ANY(p_selected_ids);

  IF v_is_external THEN
    -- Totaux saisis manuellement : on ne touche qu'aux lignes.
    UPDATE quotes SET items = v_items WHERE id = v_id;
  ELSE
    -- (3) Recalcule le total ferme (hors lignes de section) sur les lignes conservées.
    SELECT COALESCE(SUM(
      COALESCE(NULLIF(elem->>'quantity', '')::numeric, 0)
      * COALESCE(NULLIF(elem->>'price', '')::numeric, 0)
    ), 0)
    INTO v_total_ht
    FROM jsonb_array_elements(v_items) AS elem
    WHERE (elem->>'type') IS DISTINCT FROM 'section';

    UPDATE quotes
    SET items     = v_items,
        total_ht  = round(v_total_ht, 2),
        total_tva = CASE WHEN v_include_tva THEN round(v_total_ht * 0.20, 2) ELSE 0 END,
        total_ttc = CASE WHEN v_include_tva THEN round(v_total_ht * 1.20, 2) ELSE round(v_total_ht, 2) END
    WHERE id = v_id;
  END IF;

  RETURN TRUE;
END;
$$;
