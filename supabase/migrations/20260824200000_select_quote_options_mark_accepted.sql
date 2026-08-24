-- ──────────────────────────────────────────────────────────────────────────────
-- select_quote_options : dire aussi quelles options ont été RETENUES
-- (suivi de 20260824190000)
--
-- Contexte : une option retenue perdait son flag `is_optional` pour entrer dans
-- le chiffrage ferme — c'est la bonne règle pour l'argent, mais elle effaçait
-- toute trace de son origine. Sur le devis signé, on lisait les options
-- écartées (« (Option non retenue) ») sans pouvoir dire si les autres avaient
-- été retenues ou si elles avaient toujours fait partie du devis de base.
--
-- Correctif : l'option retenue est marquée `option_accepted` en même temps que
-- son flag `is_optional` est retiré. Le PDF l'imprime « (Option retenue) », et
-- elle reste comptée partout comme une ligne ferme — le marquage est un
-- libellé, il ne change aucun montant.
--
-- Les trois états d'une option sont dès lors lisibles sur le document :
--   • proposée, sans réponse    → is_optional            → « (Option) », hors total ;
--   • retenue par le client     → option_accepted        → « (Option retenue) », dans le total ;
--   • écartée par le client     → option_declined        → « (Option non retenue) », hors total.
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

  -- Toutes les lignes sont conservées, chaque option porte la réponse du client :
  --   • option RETENUE  → flag is_optional retiré (ligne ferme) + option_accepted ;
  --   • option ÉCARTÉE  → conservée, marquée option_declined (trace de l'offre).
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN (item->>'is_optional') = 'true'
           AND (item->>'id') = ANY(p_selected_ids)
      THEN (item - 'is_optional') || '{"option_accepted": true}'::jsonb
      WHEN (item->>'is_optional') = 'true'
      THEN item || '{"option_declined": true}'::jsonb
      ELSE item
    END
  ), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements((SELECT items FROM quotes WHERE id = v_id)) AS item;

  IF v_is_external THEN
    -- Totaux saisis manuellement : on ne touche qu'aux lignes.
    UPDATE quotes SET items = v_items WHERE id = v_id;
  ELSE
    -- Total ferme : ni les titres de section, ni les options écartées.
    SELECT COALESCE(SUM(
      COALESCE(NULLIF(elem->>'quantity', '')::numeric, 0)
      * COALESCE(NULLIF(elem->>'price', '')::numeric, 0)
    ), 0)
    INTO v_total_ht
    FROM jsonb_array_elements(v_items) AS elem
    WHERE (elem->>'type') IS DISTINCT FROM 'section'
      AND (elem->>'is_optional') IS DISTINCT FROM 'true';

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
