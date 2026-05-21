-- Fix défensif : la version précédente de `get_my_profile_safe()` plantait
-- quand `smtp_config` est NULL (cas par défaut pour les profils existants
-- juste après l'ajout de la colonne). On utilise désormais `jsonb_typeof`
-- pour vérifier que la valeur est bien un objet avant d'appliquer `-`.
--
-- Même fix appliqué à `ai_preferences` et `pdp_config` par cohérence.

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
    v_smtp_config  JSONB;
    v_openai_key   TEXT;
    v_pdp_key      TEXT;
    v_smtp_pwd     TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT to_jsonb(p) INTO v_profile
    FROM profiles p WHERE id = v_uid;

    IF v_profile IS NULL THEN
        RETURN NULL;
    END IF;

    -- ── Préférences IA ──
    v_ai_prefs   := v_profile->'ai_preferences';
    v_openai_key := v_ai_prefs->>'openai_api_key';

    v_profile := v_profile
        || jsonb_build_object(
            'has_openai_api_key',    (v_openai_key IS NOT NULL AND length(v_openai_key) > 0),
            'openai_api_key_last4',  CASE WHEN v_openai_key IS NOT NULL AND length(v_openai_key) >= 4
                                          THEN right(v_openai_key, 4)
                                          ELSE NULL END
        );

    IF jsonb_typeof(v_ai_prefs) = 'object' THEN
        v_ai_prefs := v_ai_prefs - 'openai_api_key' - 'gemini_api_key';
        v_profile := jsonb_set(v_profile, '{ai_preferences}', v_ai_prefs);
    END IF;

    -- ── Config PDP ──
    v_pdp_config := v_profile->'pdp_config';
    v_pdp_key    := v_pdp_config->>'api_key';

    v_profile := v_profile
        || jsonb_build_object(
            'has_pdp_api_key', (v_pdp_key IS NOT NULL AND length(v_pdp_key) > 0)
        );

    IF jsonb_typeof(v_pdp_config) = 'object' THEN
        v_pdp_config := v_pdp_config - 'api_key';
        v_profile := jsonb_set(v_profile, '{pdp_config}', v_pdp_config);
    END IF;

    -- ── Config SMTP ──
    v_smtp_config := v_profile->'smtp_config';
    v_smtp_pwd    := v_smtp_config->>'password';

    v_profile := v_profile
        || jsonb_build_object(
            'has_smtp_password', (v_smtp_pwd IS NOT NULL AND length(v_smtp_pwd) > 0)
        );

    IF jsonb_typeof(v_smtp_config) = 'object' THEN
        v_smtp_config := v_smtp_config - 'password';
        v_profile := jsonb_set(v_profile, '{smtp_config}', v_smtp_config);
    END IF;

    RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION get_my_profile_safe() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_my_profile_safe() TO authenticated;
