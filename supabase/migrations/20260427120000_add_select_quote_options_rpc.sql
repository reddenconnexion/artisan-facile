-- RPC publique (SECURITY DEFINER) appelée depuis le portail client
-- pour confirmer les lignes optionnelles sélectionnées avant signature.
-- Supprime du devis les lignes optionnelles non sélectionnées.

CREATE OR REPLACE FUNCTION select_quote_options(
  p_token   TEXT,
  p_selected_ids TEXT[]
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM quotes
  WHERE public_token = p_token
    AND status NOT IN ('accepted', 'paid');

  IF NOT FOUND THEN RETURN FALSE; END IF;

  UPDATE quotes
  SET items = (
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    FROM jsonb_array_elements(items) AS item
    WHERE (item->>'is_optional') IS DISTINCT FROM 'true'
       OR (item->>'id') = ANY(p_selected_ids)
  )
  WHERE id = v_id;

  RETURN TRUE;
END;
$$;
