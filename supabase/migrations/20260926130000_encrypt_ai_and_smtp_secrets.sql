-- Chiffrement au repos des secrets tiers de l'artisan.
--
-- `profiles.ai_preferences.openai_api_key` (clé OpenAI ou Gemini) et
-- `profiles.smtp_config.password` étaient stockés en clair : un accès à la
-- base (fuite de backup, script de support, compromission d'une autre Edge
-- Function via service_role) exposait les identifiants tiers de tous les
-- artisans. On les déplace dans Supabase Vault (chiffrement pgsodium) et on
-- ne garde plus en base qu'un `*_secret_id` (uuid) — inutilisable sans
-- accès `service_role`.
--
-- Le schéma `vault` n'est pas exposé via PostgREST : les Edge Functions
-- (qui appellent la base en `service_role` via le client JS, donc via
-- PostgREST) ont besoin de fonctions `public.vault_*` en relais.

-- ── Fonctions relais vers Supabase Vault (service_role uniquement) ──

CREATE OR REPLACE FUNCTION public.vault_create_secret(p_secret text, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
    RETURN vault.create_secret(p_secret, p_name);
END;
$$;

REVOKE ALL ON FUNCTION public.vault_create_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_create_secret(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_create_secret(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.vault_update_secret(p_secret_id uuid, p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
    PERFORM vault.update_secret(p_secret_id, p_secret);
END;
$$;

REVOKE ALL ON FUNCTION public.vault_update_secret(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_update_secret(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_update_secret(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.vault_read_secret(p_secret_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret text;
BEGIN
    IF p_secret_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE id = p_secret_id;

    RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_read_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_read_secret(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_read_secret(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.vault_delete_secret(p_secret_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
    IF p_secret_id IS NULL THEN
        RETURN;
    END IF;
    DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_delete_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_delete_secret(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_delete_secret(uuid) TO service_role;

-- ── Bascule des secrets déjà en base vers Vault ──
-- Exécuté par le rôle de migration (postgres), qui a un accès direct au
-- schéma `vault` (contrairement à service_role via PostgREST).

DO $$
DECLARE
    r RECORD;
    v_secret_id uuid;
BEGIN
    FOR r IN
        SELECT id, ai_preferences, smtp_config
        FROM profiles
        WHERE coalesce(length(ai_preferences->>'openai_api_key'), 0) > 0
           OR coalesce(length(smtp_config->>'password'), 0) > 0
    LOOP
        IF coalesce(length(r.ai_preferences->>'openai_api_key'), 0) > 0 THEN
            v_secret_id := vault.create_secret(
                r.ai_preferences->>'openai_api_key',
                'ai_api_key_' || r.id::text
            );

            UPDATE profiles
            SET ai_preferences = (ai_preferences - 'openai_api_key' - 'gemini_api_key')
                || jsonb_build_object(
                    'openai_api_key_secret_id', v_secret_id,
                    'openai_api_key_last4', right(r.ai_preferences->>'openai_api_key', 4)
                )
            WHERE id = r.id;
        END IF;

        IF coalesce(length(r.smtp_config->>'password'), 0) > 0 THEN
            v_secret_id := vault.create_secret(
                r.smtp_config->>'password',
                'smtp_password_' || r.id::text
            );

            UPDATE profiles
            SET smtp_config = (smtp_config - 'password')
                || jsonb_build_object('password_secret_id', v_secret_id)
            WHERE id = r.id;
        END IF;
    END LOOP;
END;
$$;

-- ── get_my_profile_safe() : dériver has_openai_api_key / has_smtp_password
-- des *_secret_id désormais utilisés, et ne jamais renvoyer ces ids au
-- client (un uuid seul est inoffensif sans service_role, mais autant ne
-- pas exposer d'état interne inutilement). ──

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

    -- ── Préférences IA ──
    v_ai_prefs := v_profile->'ai_preferences';

    v_profile := v_profile
        || jsonb_build_object(
            'has_openai_api_key',   (v_ai_prefs->>'openai_api_key_secret_id') IS NOT NULL,
            'openai_api_key_last4', v_ai_prefs->>'openai_api_key_last4'
        );

    IF jsonb_typeof(v_ai_prefs) = 'object' THEN
        -- `openai_api_key`/`gemini_api_key` : legacy, ne devraient plus
        -- exister après la bascule ci-dessus, mais on les retire par
        -- défense en profondeur si jamais réécrits par un ancien client.
        v_ai_prefs := v_ai_prefs - 'openai_api_key' - 'gemini_api_key' - 'openai_api_key_secret_id';
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

    v_profile := v_profile
        || jsonb_build_object(
            'has_smtp_password', (v_smtp_config->>'password_secret_id') IS NOT NULL
        );

    IF jsonb_typeof(v_smtp_config) = 'object' THEN
        -- `password` : legacy, cf. commentaire ci-dessus.
        v_smtp_config := v_smtp_config - 'password' - 'password_secret_id';
        v_profile := jsonb_set(v_profile, '{smtp_config}', v_smtp_config);
    END IF;

    RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION get_my_profile_safe() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_my_profile_safe() TO authenticated;
