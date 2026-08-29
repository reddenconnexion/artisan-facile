-- ──────────────────────────────────────────────────────────────────────────────
-- select_quote_options : comparer le jeton au bon type (correctif de 20260427120000)
--
-- La fonction déclarait `p_token TEXT` et le comparait à `quotes.public_token`,
-- qui est de type UUID. PostgreSQL n'a pas d'opérateur `uuid = text` : chaque
-- appel échouait en 42883, que PostgREST renvoie au client en 404. La fonction
-- n'a donc jamais rien enregistré depuis son introduction.
--
-- Le portail appelait bien la RPC avant de signer, sans vérifier son retour :
-- l'échec passait inaperçu et le devis était signé au prix ferme, comme si le
-- client n'avait rien retenu. Le devis n° 223 a été signé ainsi le 29/08/2026 à
-- 2 181,91 € alors que la cliente avait coché 230 € d'options — et réglé
-- l'acompte correspondant.
--
-- Correctif : `p_token` passe en UUID, comme `lookup_token` dans
-- `get_public_quote` et `sign_public_quote`, qui fonctionnent depuis toujours
-- pour cette raison. Le portail transmet la même chaîne d'URL qu'à ces deux
-- fonctions ; PostgREST la convertit en UUID, aucun changement côté client.
--
-- Le type d'un paramètre fait partie de la signature : CREATE OR REPLACE ne
-- suffit pas, et laisser l'ancienne version en place créerait une surcharge
-- ambiguë (PostgREST répondrait 300). On la supprime donc explicitement.
-- ──────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS select_quote_options(TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION select_quote_options(
  p_token   UUID,
  p_selected_ids TEXT[]
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          BIGINT;
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

GRANT EXECUTE ON FUNCTION select_quote_options(UUID, TEXT[]) TO anon, authenticated;
