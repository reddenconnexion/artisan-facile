-- ──────────────────────────────────────────────────────────────────────────────
-- Le portail client contournait entièrement l'OTP
--
-- `sign_public_quote` (lien de devis public) exige un code de vérification
-- dès que `quotes.require_otp = true` et que le client a un email — renfort
-- livré par la migration 20260927100000 pour tout devis >= 3000 €. Mais
-- `sign_quote_via_portal`, le second chemin de signature (depuis le portail
-- client, authentifié par le seul `portal_token`), ne vérifiait aucun code :
-- un devis à fort montant restait signable sans second facteur tant qu'on
-- passait par le portail plutôt que par le lien public.
--
-- Cette migration réplique dans `sign_quote_via_portal` exactement la même
-- vérification OTP que `sign_public_quote` (même table `quote_otps`, même
-- hash, même fenêtre de validité) — un code demandé pour un devis via l'un
-- des deux chemins fonctionne pour l'autre, `request-quote-otp` ayant été
-- étendu pour accepter aussi `{ portalToken, quoteId, email }`.
--
-- ATTENTION déploiement : cette migration doit être appliquée EN MÊME TEMPS
-- que le déploiement du front (ClientPortal.jsx sait désormais demander et
-- saisir un code) — sinon un client avec un devis require_otp=true resterait
-- bloqué sur le portail entre les deux.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sign_quote_via_portal(
    portal_token_input uuid,
    quote_id_input bigint,
    signature_base64 text,
    otp_code text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_client_id bigint;
    target_quote quotes%ROWTYPE;
    block_reason text;
    client_email text;
    otp_id bigint;
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

    -- 4. Vérification OTP — même règle que sign_public_quote : uniquement si
    -- l'artisan l'a activée ET que le client a un email.
    IF target_quote.require_otp = TRUE THEN
        SELECT lower(trim(c.email)) INTO client_email
        FROM clients c
        WHERE c.id = target_client_id;

        IF client_email IS NOT NULL AND client_email <> '' THEN
            IF otp_code IS NULL OR trim(otp_code) = '' THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'Un code de vérification est requis pour signer ce devis.'
                );
            END IF;

            SELECT qo.id INTO otp_id
            FROM quote_otps qo
            WHERE qo.quote_id    = target_quote.id
              AND qo.otp_hash    = encode(sha256(trim(otp_code)::bytea), 'hex')
              AND qo.used_at     IS NULL
              AND qo.expires_at  > NOW()
            ORDER BY qo.created_at DESC
            LIMIT 1;

            IF otp_id IS NULL THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'Code de vérification invalide ou expiré. Veuillez en demander un nouveau.'
                );
            END IF;

            UPDATE quote_otps SET used_at = NOW() WHERE id = otp_id;
        END IF;
    END IF;

    -- 5. Validate signature format
    IF signature_base64 NOT LIKE 'data:image/%' THEN
        RETURN json_build_object('success', false, 'error', 'Format de signature invalide');
    END IF;

    -- 6. Save signature and update status
    UPDATE quotes
    SET
        signature = signature_base64,
        signed_at = NOW(),
        status = 'accepted'
    WHERE id = quote_id_input;

    RETURN json_build_object('success', true, 'signed_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION sign_quote_via_portal(uuid, bigint, text, text) TO anon;
GRANT EXECUTE ON FUNCTION sign_quote_via_portal(uuid, bigint, text, text) TO authenticated;

-- L'ancienne signature à 3 arguments (sans otp_code) doit disparaître :
-- la laisser cohabiter permettrait de continuer à signer sans code en
-- appelant simplement l'ancienne surcharge.
DROP FUNCTION IF EXISTS sign_quote_via_portal(uuid, bigint, text);
