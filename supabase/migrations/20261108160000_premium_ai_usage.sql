-- ──────────────────────────────────────────────────────────────────────────────
-- Plafond mensuel des appels Claude par compte Pro.
--
-- Les chiffrages Pro (visite technique, Assistant du devis) passent par Claude
-- sur la clé Anthropic du serveur : chaque appel est payé par l'éditeur. Sans
-- plafond, un compte Pro pouvait en enchaîner sans limite (seul le garde-fou
-- de 30 appels / heure s'appliquait).
--
-- Compteur à part de `usage_tracking` : la politique de celle-ci laisse
-- l'utilisateur écrire sa propre ligne, il pourrait donc remettre son compteur
-- à zéro. Ici l'utilisateur ne peut que LIRE ses lignes ; le compteur n'avance
-- que par `claim_premium_ai_call`, qui ne sait qu'incrémenter.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.premium_ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- 'YYYY-MM'
  calls INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, month)
);

ALTER TABLE public.premium_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their premium AI usage" ON public.premium_ai_usage;
CREATE POLICY "Users read their premium AI usage"
  ON public.premium_ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Réserve un appel Claude pour l'utilisateur connecté si son plafond du mois
-- n'est pas atteint. Atomique : deux appels simultanés ne peuvent pas passer
-- tous les deux au-dessus de la limite. Renvoie false au plafond.
CREATE OR REPLACE FUNCTION public.claim_premium_ai_call(p_month text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claimed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_month !~ '^\d{4}-\d{2}$' THEN
    RETURN false;
  END IF;

  INSERT INTO premium_ai_usage (user_id, month, calls, updated_at)
  VALUES (v_uid, p_month, 1, NOW())
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    calls = premium_ai_usage.calls + 1,
    updated_at = NOW()
  WHERE premium_ai_usage.calls < p_limit
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_premium_ai_call(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_premium_ai_call(text, integer) TO authenticated;
