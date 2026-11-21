-- Limite d'essais sur le code de signature (OTP à 6 chiffres).
--
-- sign_public_quote et sign_quote_via_portal sont appelables avec la clé anon
-- et vérifiaient le code sans compter les échecs : quelqu'un qui détient le
-- lien d'un devis pouvait tester les codes en rafale pendant les 15 minutes de
-- validité. On compte désormais les échecs sur chaque code actif ; au 5e échec
-- le code est bloqué, il faut en demander un nouveau (limité à 1/min par devis
-- et par IP côté Edge Function).

ALTER TABLE quote_otps ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;

-- Renvoie l'id du code valide correspondant, ou NULL. Un échec est compté sur
-- tous les codes encore actifs du devis, sans lever d'exception (sinon le
-- compteur serait annulé avec la transaction).
CREATE OR REPLACE FUNCTION public.check_quote_otp(p_quote_id BIGINT, p_code TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hash TEXT := encode(sha256(trim(p_code)::bytea), 'hex');
    v_id   BIGINT;
BEGIN
    SELECT qo.id INTO v_id
    FROM quote_otps qo
    WHERE qo.quote_id        = p_quote_id
      AND qo.otp_hash        = v_hash
      AND qo.used_at         IS NULL
      AND qo.expires_at      > NOW()
      AND qo.failed_attempts < 5
    ORDER BY qo.created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN
        UPDATE quote_otps
        SET failed_attempts = failed_attempts + 1
        WHERE quote_id = p_quote_id
          AND used_at IS NULL
          AND expires_at > NOW();
    END IF;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.check_quote_otp(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;

-- Branche la vérification dans les deux RPC de signature, sans recopier leur
-- corps : on remplace la requête de recherche du code par l'appel au helper.
DO $$
DECLARE
    fn       RECORD;
    def      TEXT;
    new_def  TEXT;
    pattern  TEXT := 'SELECT\s+qo\.id\s+INTO\s+otp_id\s+FROM\s+quote_otps\s+qo\s+WHERE\s+qo\.quote_id\s*=\s*(\w+)\.id\s+AND\s+qo\.otp_hash\s*=\s*encode\(sha256\(trim\(otp_code\)::bytea\),\s*''hex''\)\s+AND\s+qo\.used_at\s+IS NULL\s+AND\s+qo\.expires_at\s*>\s*NOW\(\)\s+ORDER BY\s+qo\.created_at\s+DESC\s+LIMIT\s+1;';
    patched  INTEGER := 0;
BEGIN
    FOR fn IN
        SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('sign_public_quote', 'sign_quote_via_portal')
    LOOP
        def := pg_get_functiondef(fn.oid);
        new_def := regexp_replace(def, pattern, 'otp_id := public.check_quote_otp(\1.id, otp_code);');
        IF new_def <> def THEN
            EXECUTE new_def;
            patched := patched + 1;
        END IF;
    END LOOP;

    IF patched <> 2 THEN
        RAISE EXCEPTION 'check_quote_otp: % fonction(s) de signature modifiée(s) au lieu de 2', patched;
    END IF;
END $$;
