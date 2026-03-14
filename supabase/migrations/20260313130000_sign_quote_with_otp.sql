-- Mise à jour de sign_public_quote pour exiger la vérification OTP
-- Remplace la vérification email côté client (faible) par une vérification OTP serveur

-- Supprimer les anciennes versions de la fonction
DROP FUNCTION IF EXISTS sign_public_quote(uuid, text, text);
DROP FUNCTION IF EXISTS sign_public_quote(uuid, text);

CREATE OR REPLACE FUNCTION sign_public_quote(
    lookup_token      UUID,
    signature_base64  TEXT,
    otp_code          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    quote_record  RECORD;
    client_email  TEXT;
    otp_id        BIGINT;
BEGIN
    -- 1. Récupérer le devis avec verrou anti-concurrence
    SELECT q.id, q.status, q.signed_at, q.token_expires_at, q.token_revoked, q.client_id
    INTO quote_record
    FROM quotes q
    WHERE q.public_token = lookup_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Devis introuvable ou lien invalide');
    END IF;

    -- Token révoqué
    IF quote_record.token_revoked = TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ce lien a été révoqué');
    END IF;

    -- Token expiré
    IF quote_record.token_expires_at IS NOT NULL
       AND quote_record.token_expires_at < NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ce lien a expiré. Veuillez demander un nouveau lien à votre artisan.'
        );
    END IF;

    -- Déjà signé
    IF quote_record.signed_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ce devis a déjà été signé le ' || to_char(quote_record.signed_at, 'DD/MM/YYYY')
        );
    END IF;

    -- Statut non signable
    IF quote_record.status IN ('cancelled', 'rejected', 'accepted') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ce devis ne peut plus être signé (statut : ' || quote_record.status || ')'
        );
    END IF;

    -- 2. Vérification OTP si le client a un email
    SELECT lower(trim(c.email)) INTO client_email
    FROM clients c
    WHERE c.id = quote_record.client_id;

    IF client_email IS NOT NULL AND client_email <> '' THEN
        -- OTP obligatoire
        IF otp_code IS NULL OR trim(otp_code) = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Un code de vérification est requis pour signer ce devis.'
            );
        END IF;

        -- Chercher un OTP valide (non utilisé, non expiré, hash correspondant)
        SELECT qo.id INTO otp_id
        FROM quote_otps qo
        WHERE qo.quote_id    = quote_record.id
          AND qo.otp_hash    = encode(sha256(trim(otp_code)::bytea), 'hex')
          AND qo.used_at     IS NULL
          AND qo.expires_at  > NOW()
        ORDER BY qo.created_at DESC
        LIMIT 1;

        IF otp_id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Code de vérification invalide ou expiré. Veuillez en demander un nouveau.'
            );
        END IF;

        -- Marquer l'OTP comme utilisé (one-time use)
        UPDATE quote_otps SET used_at = NOW() WHERE id = otp_id;
    END IF;

    -- 3. Valider le format de la signature
    IF signature_base64 IS NULL OR length(signature_base64) < 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'La signature fournie est invalide');
    END IF;

    IF NOT (signature_base64 LIKE 'data:image/%') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Format de signature non reconnu');
    END IF;

    -- 4. Enregistrer la signature
    UPDATE quotes
    SET signature  = signature_base64,
        status     = 'accepted',
        signed_at  = NOW(),
        updated_at = NOW()
    WHERE id = quote_record.id;

    RETURN jsonb_build_object(
        'success',   true,
        'message',   'Devis signé avec succès',
        'signed_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION sign_public_quote(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION sign_public_quote(uuid, text, text) TO authenticated;
