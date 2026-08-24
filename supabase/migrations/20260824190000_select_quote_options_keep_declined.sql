-- ──────────────────────────────────────────────────────────────────────────────
-- select_quote_options : garder la trace des options écartées (suivi de 20260713120000)
--
-- Contexte : à la signature, la RPC SUPPRIMAIT du devis les options que le
-- client n'avait pas retenues. Le devis signé ne portait donc plus aucune trace
-- de ce qui avait été proposé — ni pour le client, ni pour l'artisan en cas de
-- discussion ultérieure (« vous ne m'aviez pas parlé de la tranchée »).
--
-- Correctif : l'option écartée reste dans le devis, marquée `option_declined`,
-- et garde son flag `is_optional`. Tout ce qui compte de l'argent filtre déjà
-- `is_optional` — total ferme, sous-totaux du PDF, acompte matériel, facture de
-- clôture, marge, liste d'achat, heures estimées : le montant d'une option
-- écartée n'entre nulle part. Le PDF l'imprime « (Option non retenue) », hors
-- total.
--
-- Le total signé est donc identique à ce qu'il était : seules les lignes
-- conservées changent. Le recalcul exclut désormais explicitement les lignes
-- optionnelles restantes (avant, la suppression suffisait à les écarter).
--
-- Les devis externes (`is_external`), dont les totaux sont saisis à la main, ne
-- sont toujours pas recalculés : seules leurs lignes sont mises à jour.
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

  -- Toutes les lignes sont conservées :
  --   • option RETENUE  → flag is_optional retiré : elle devient ferme ;
  --   • option ÉCARTÉE  → conservée, marquée option_declined (trace de l'offre).
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN (item->>'is_optional') = 'true'
           AND (item->>'id') = ANY(p_selected_ids)
      THEN item - 'is_optional'
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
