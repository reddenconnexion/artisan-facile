-- ──────────────────────────────────────────────────────────────────────────────
-- Distinguer une signature suspendue d'un lien simplement expiré
--
-- `token_revoked` ne dit pas qui l'a levé. Une tâche nocturne (pg_cron, 3h :
-- `cleanup_expired_tokens()`, introduite bien avant la suspension manuelle)
-- révoque tout lien expiré depuis plus de 7 jours — du ménage de sécurité, pas
-- une décision de l'artisan. Sur cette base, 126 documents sur 253 portaient
-- déjà ce drapeau, dont 33 devis SIGNÉS.
--
-- La fonctionnalité de suspension lisait `token_revoked` comme « l'artisan a
-- fermé ce document » : elle annonçait « Signature suspendue » sur la moitié du
-- portefeuille, et le filigrane du PDF marquait « SUSPENDU — ne peut plus être
-- signé » sur des devis signés depuis des mois. Faux, et visible du client.
--
-- `signature_suspended_at` porte donc l'intention : il n'est écrit que par
-- l'action explicite de l'artisan, et effacé à la réouverture. La révocation du
-- lien reste portée par `token_revoked` (c'est lui que get_public_quote
-- vérifie) ; la nouvelle colonne dit seulement si elle vient d'une décision ou
-- du ménage. Rétroactivement NULL partout : aucun document existant n'a été
-- suspendu à la main.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.quotes
    ADD COLUMN IF NOT EXISTS signature_suspended_at TIMESTAMPTZ;

COMMENT ON COLUMN public.quotes.signature_suspended_at IS
    'Date à laquelle l''artisan a suspendu la signature. NULL = jamais suspendu à la main : un token_revoked sans cette date vient de l''expiration du lien (cleanup_expired_tokens).';

-- Le message d'erreur du client suit la même distinction : « suspendue par
-- l'artisan » quand c'en est une, « lien expiré » sinon — sur un lien nettoyé,
-- annoncer une suspension envoyait le client réclamer une décision qui n'avait
-- jamais été prise.
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
    row_count     INT;
    block_reason  TEXT;
BEGIN
    -- 1. Récupérer le devis avec verrou anti-concurrence
    SELECT q.id, q.status, q.signed_at, q.token_expires_at, q.token_revoked, q.client_id,
           q.require_otp, q.signature_suspended_at
    INTO quote_record
    FROM quotes q
    WHERE q.public_token = lookup_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Devis introuvable ou lien invalide');
    END IF;

    IF quote_record.token_revoked = TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', CASE
                WHEN quote_record.signature_suspended_at IS NOT NULL
                    THEN 'La signature de ce document a été suspendue par l''artisan. Contactez-le pour recevoir un nouveau lien.'
                ELSE 'Ce lien n''est plus valable. Demandez-en un nouveau à votre artisan.'
            END
        );
    END IF;

    IF quote_record.token_expires_at IS NOT NULL
       AND quote_record.token_expires_at < NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ce lien a expiré. Veuillez demander un nouveau lien à votre artisan.'
        );
    END IF;

    IF quote_record.signed_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ce devis a déjà été signé le ' || to_char(quote_record.signed_at, 'DD/MM/YYYY')
        );
    END IF;

    block_reason := quote_signature_block_reason(quote_record.status);
    IF block_reason IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', block_reason);
    END IF;

    -- 2. Vérification OTP — uniquement si l'artisan l'a activée ET que le client a un email
    IF quote_record.require_otp = TRUE THEN
        SELECT lower(trim(c.email)) INTO client_email
        FROM clients c
        WHERE c.id = quote_record.client_id;

        IF client_email IS NOT NULL AND client_email <> '' THEN
            IF otp_code IS NULL OR trim(otp_code) = '' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Un code de vérification est requis pour signer ce devis.'
                );
            END IF;

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

            UPDATE quote_otps SET used_at = NOW() WHERE id = otp_id;
        END IF;
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

    GET DIAGNOSTICS row_count = ROW_COUNT;
    IF row_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La signature n''a pas pu être enregistrée. Veuillez réessayer.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success',   true,
        'message',   'Devis signé avec succès',
        'signed_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION sign_public_quote(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION sign_public_quote(uuid, text, text) TO authenticated;

-- Même distinction côté portail client.
CREATE OR REPLACE FUNCTION sign_quote_via_portal(
    portal_token_input uuid,
    quote_id_input bigint,
    signature_base64 text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_client_id bigint;
    target_quote quotes%ROWTYPE;
    block_reason text;
BEGIN
    -- 1. Validate portal token and get client
    SELECT id INTO target_client_id
    FROM clients
    WHERE portal_token = portal_token_input;

    IF target_client_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Lien de portail invalide');
    END IF;

    -- 2. Fetch the quote and validate ownership
    SELECT * INTO target_quote
    FROM quotes
    WHERE id = quote_id_input AND client_id = target_client_id;

    IF target_quote.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Devis introuvable');
    END IF;

    -- 3. Reject if already signed, suspendu, annulé, refusé…
    IF target_quote.signed_at IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'Ce devis a déjà été signé');
    END IF;

    block_reason := public.quote_signature_block_reason(target_quote.status);
    IF block_reason IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', block_reason);
    END IF;

    IF target_quote.signature_suspended_at IS NOT NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La signature de ce devis a été suspendue par l''artisan. Contactez-le.'
        );
    END IF;

    IF target_quote.type NOT IN ('quote', 'devis') THEN
        RETURN json_build_object('success', false, 'error', 'Seuls les devis peuvent être signés');
    END IF;

    -- 4. Validate signature format
    IF signature_base64 NOT LIKE 'data:image/%' THEN
        RETURN json_build_object('success', false, 'error', 'Format de signature invalide');
    END IF;

    -- 5. Save signature and update status
    UPDATE quotes
    SET
        signature = signature_base64,
        signed_at = NOW(),
        status = 'accepted'
    WHERE id = quote_id_input;

    RETURN json_build_object('success', true, 'signed_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION sign_quote_via_portal(uuid, bigint, text) TO anon;
GRANT EXECUTE ON FUNCTION sign_quote_via_portal(uuid, bigint, text) TO authenticated;
