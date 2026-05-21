-- ──────────────────────────────────────────────────────────────────────────────
-- Envoi direct de documents par email depuis l'adresse pro de l'artisan
--
-- Stocke la config SMTP dans `profiles.smtp_config` (JSONB). Champs :
--   - host       (string)        ex: "smtp.gmail.com"
--   - port       (int)           ex: 465 ou 587
--   - secure     (bool)          true = SSL/TLS implicite (465), false = STARTTLS (587)
--   - username   (string)        login SMTP (souvent l'email pro)
--   - password   (string)        mot de passe d'application — JAMAIS renvoyé au client
--   - from_email (string)        adresse expéditeur affichée (le mail pro)
--   - from_name  (string)        nom affiché ("Mon Entreprise")
--
-- Le password est strippé par `get_my_profile_safe()` ; seul un flag
-- `has_smtp_password` est renvoyé au frontend. Le password n'est lu que
-- côté serveur (Edge Functions avec service-role) pour effectuer l'envoi.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS smtp_config JSONB;

-- Mise à jour de get_my_profile_safe pour strip le password SMTP
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

    -- ── Config SMTP : retirer le password, exposer un flag ──
    v_smtp_config := v_profile->'smtp_config';
    v_smtp_pwd    := v_smtp_config->>'password';

    v_profile := v_profile
        || jsonb_build_object(
            'has_smtp_password', (v_smtp_pwd IS NOT NULL AND length(v_smtp_pwd) > 0)
        );

    IF v_smtp_config IS NOT NULL THEN
        v_smtp_config := v_smtp_config - 'password';
        v_profile := jsonb_set(v_profile, '{smtp_config}', v_smtp_config);
    END IF;

    RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION get_my_profile_safe() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_my_profile_safe() TO authenticated;
