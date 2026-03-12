-- Allow clients to sign a quote directly from their portal
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

    -- 3. Reject if already signed or not a quote
    IF target_quote.status IN ('accepted', 'paid', 'cancelled') THEN
        RETURN json_build_object('success', false, 'error', 'Ce devis a déjà été traité');
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

-- Grant execute to anonymous users (portal is public)
GRANT EXECUTE ON FUNCTION sign_quote_via_portal(uuid, bigint, text) TO anon;
GRANT EXECUTE ON FUNCTION sign_quote_via_portal(uuid, bigint, text) TO authenticated;
