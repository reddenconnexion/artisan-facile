-- Fix: get_my_profile_safe returned 400 ("cannot delete from scalar") whenever
-- ai_preferences or pdp_config was a JSON null/scalar instead of an object.
-- v_profile->'key' on a missing/null jsonb key returns a jsonb null whose
-- IS NOT NULL guard evaluates true, so the subsequent `-` operator blew up.
-- Guard with jsonb_typeof = 'object' instead.

CREATE OR REPLACE FUNCTION public.get_my_profile_safe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    RETURN v_profile;
END;
$function$;
