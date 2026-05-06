-- ──────────────────────────────────────────────────────────────────────────────
-- RPC `get_my_profile_safe()` — version "safe" du profil sans clés sensibles
--
-- Avant : le frontend faisait `SELECT * FROM profiles` et recevait dans son
-- état React TOUTE la colonne `ai_preferences` (incluant la clé OpenAI brute)
-- ainsi que la `pdp_config.api_key`. Risques :
--   - XSS = vol immédiat de la clé
--   - Cache offline = clé sur disque
--   - Logs d'erreur React Query qui auraient pu sérialiser le state
--
-- Cette RPC :
--   1. Lit le profil côté serveur (SECURITY DEFINER)
--   2. Calcule des flags `has_openai_api_key`, `openai_api_key_last4`, `has_pdp_api_key`
--   3. SUPPRIME les valeurs sensibles avant de retourner
--   4. Le frontend reçoit donc juste les flags utiles à l'UI ("Clé configurée ✓")
--
-- Les Edge Functions (`ai-proxy`, `voice-transcribe`, `plan-vision`) continuent
-- de lire la clé directement via service-role — elles seules en ont besoin.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_profile_safe()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid          UUID := auth.uid();
    v_profile      JSONB;
    v_ai_prefs     JSONB;
    v_pdp_config   JSONB;
    v_openai_key   TEXT;
    v_pdp_key      TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT to_jsonb(p) INTO v_profile
    FROM profiles p WHERE id = v_uid;

    IF v_profile IS NULL THEN
        RETURN NULL;
    END IF;

    -- ── Préférences IA : extraire la clé pour les flags, puis la retirer ──
    v_ai_prefs   := v_profile->'ai_preferences';
    v_openai_key := v_ai_prefs->>'openai_api_key';

    v_profile := v_profile
        || jsonb_build_object(
            'has_openai_api_key',    (v_openai_key IS NOT NULL AND length(v_openai_key) > 0),
            'openai_api_key_last4',  CASE WHEN v_openai_key IS NOT NULL AND length(v_openai_key) >= 4
                                          THEN right(v_openai_key, 4)
                                          ELSE NULL END
        );

    IF v_ai_prefs IS NOT NULL THEN
        v_ai_prefs := v_ai_prefs - 'openai_api_key' - 'gemini_api_key';
        v_profile := jsonb_set(v_profile, '{ai_preferences}', v_ai_prefs);
    END IF;

    -- ── Config PDP : même traitement ──
    v_pdp_config := v_profile->'pdp_config';
    v_pdp_key    := v_pdp_config->>'api_key';

    v_profile := v_profile
        || jsonb_build_object(
            'has_pdp_api_key', (v_pdp_key IS NOT NULL AND length(v_pdp_key) > 0)
        );

    IF v_pdp_config IS NOT NULL THEN
        v_pdp_config := v_pdp_config - 'api_key';
        v_profile := jsonb_set(v_profile, '{pdp_config}', v_pdp_config);
    END IF;

    RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION get_my_profile_safe() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_my_profile_safe() TO authenticated;
