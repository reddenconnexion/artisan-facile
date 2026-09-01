-- ──────────────────────────────────────────────────────────────────────────────
-- Suspendre / annuler la signature d'un devis ou d'un avenant
--
-- Un avenant envoyé au client ne pouvait pas être repris : rien dans l'app ne
-- révoquait son lien, et le seul statut qui bloquait réellement la signature
-- était « Annulé ». Deux angles morts :
--
--   1. Le formulaire enregistre le statut « Refusé » sous la valeur `refused`,
--      alors que `sign_public_quote` ne refusait que `rejected` — valeur que
--      l'app n'écrit jamais. Un devis marqué Refusé restait donc signable, et
--      un devis « Reporté » (`postponed`) aussi. L'artisan croyait avoir fermé
--      la porte ; le client pouvait quand même engager les deux parties.
--   2. `select_quote_options` ne regardait ni le statut (hors accepted/paid),
--      ni la révocation du lien : sur un devis annulé, un client qui avait
--      gardé la page ouverte pouvait encore réécrire les options retenues et
--      les totaux du document.
--
-- Cette migration donne une seule source de vérité — `quote_signature_block_reason`
-- — utilisée par les deux chemins de signature (lien public et portail client)
-- et par la sélection d'options. Le message renvoyé est destiné au client : il
-- dit ce qui se passe et quoi faire, au lieu de « statut : cancelled ».
--
-- La mise en pause proprement dite reste portée par `token_revoked`, que
-- `get_public_quote` refuse déjà : le lien redevient inactif sans toucher au
-- statut du devis, et se réactive d'un clic.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Source de vérité : un devis dans ce statut ne se signe plus ──────────────
-- Renvoie NULL quand la signature est possible, sinon le motif à afficher au
-- client. `billed` et `paid` y entrent aussi : signer un devis déjà facturé le
-- rebasculait en `accepted` et faisait perdre l'état de facturation.
CREATE OR REPLACE FUNCTION public.quote_signature_block_reason(quote_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(quote_status, ''))
    WHEN 'cancelled' THEN 'Ce document a été annulé par l''artisan : il ne peut plus être signé. Contactez-le si vous souhaitez le reprendre.'
    WHEN 'refused'   THEN 'Ce document a été marqué comme refusé : il ne peut plus être signé. Contactez l''artisan pour le rouvrir.'
    WHEN 'rejected'  THEN 'Ce document a été marqué comme refusé : il ne peut plus être signé. Contactez l''artisan pour le rouvrir.'
    WHEN 'postponed' THEN 'La signature de ce document a été suspendue par l''artisan. Contactez-le pour la rouvrir.'
    WHEN 'accepted'  THEN 'Ce document a déjà été accepté.'
    WHEN 'billed'    THEN 'Ce document a déjà été facturé : il ne peut plus être signé.'
    WHEN 'paid'      THEN 'Ce document a déjà été réglé : il ne peut plus être signé.'
    ELSE NULL
  END;
$$;

GRANT EXECUTE ON FUNCTION public.quote_signature_block_reason(TEXT) TO anon, authenticated;

-- ── Signature depuis le lien public ─────────────────────────────────────────
-- Reprise de 20260317100000 (OTP par devis), le contrôle de statut passant par
-- la fonction ci-dessus.
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
    row_count     INT;
    block_reason  TEXT;
BEGIN
    -- 1. Récupérer le devis avec verrou anti-concurrence
    SELECT q.id, q.status, q.signed_at, q.token_expires_at, q.token_revoked, q.client_id, q.require_otp
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
            'error', 'La signature de ce document a été suspendue par l''artisan. Contactez-le pour recevoir un nouveau lien.'
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

-- ── Signature depuis le portail client ──────────────────────────────────────
-- Reprise de 20260312140000, même contrôle de statut. (Un avenant n'y est de
-- toute façon pas signable : seuls les types quote/devis passent.)
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

    IF target_quote.token_revoked = TRUE THEN
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

-- ── Sélection des options par le client ─────────────────────────────────────
-- Reprise de 20260829140000 (jeton uuid), avec le même verrou que la signature :
-- un document qu'on ne peut plus signer ne doit plus voir ses lignes ni ses
-- totaux réécrits depuis le lien public, et un lien suspendu ou expiré n'ouvre
-- plus rien du tout.
CREATE OR REPLACE FUNCTION select_quote_options(
  p_token   UUID,
  p_selected_ids TEXT[]
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          BIGINT;
  v_is_external BOOLEAN;
  v_include_tva BOOLEAN;
  v_items       JSONB;
  v_total_ht    NUMERIC;
BEGIN
  SELECT id, COALESCE(is_external, false), COALESCE(include_tva, true)
    INTO v_id, v_is_external, v_include_tva
  FROM quotes
  WHERE public_token = p_token
    AND quote_signature_block_reason(status) IS NULL
    AND (token_revoked IS NULL OR token_revoked = FALSE)
    AND (token_expires_at IS NULL OR token_expires_at > NOW());

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Toutes les lignes sont conservées, chaque option porte la réponse du client :
  --   • option RETENUE  → flag is_optional retiré (ligne ferme) + option_accepted ;
  --   • option ÉCARTÉE  → conservée, marquée option_declined (trace de l'offre).
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN (item->>'is_optional') = 'true'
           AND (item->>'id') = ANY(p_selected_ids)
      THEN (item - 'is_optional') || '{"option_accepted": true}'::jsonb
      WHEN (item->>'is_optional') = 'true'
      THEN item || '{"option_declined": true}'::jsonb
      ELSE item
    END
  ), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements((SELECT items FROM quotes WHERE id = v_id)) AS item;

  IF v_is_external THEN
    -- Totaux saisis manuellement : on ne touche qu'aux lignes.
    UPDATE quotes SET items = v_items WHERE id = v_id;
  ELSE
    -- Total ferme : ni les titres de section, ni les options écartées.
    SELECT COALESCE(SUM(
      COALESCE(NULLIF(elem->>'quantity', '')::numeric, 0)
      * COALESCE(NULLIF(elem->>'price', '')::numeric, 0)
    ), 0)
    INTO v_total_ht
    FROM jsonb_array_elements(v_items) AS elem
    WHERE (elem->>'type') IS DISTINCT FROM 'section'
      AND (elem->>'is_optional') IS DISTINCT FROM 'true';

    UPDATE quotes
    SET items     = v_items,
        total_ht  = round(v_total_ht, 2),
        total_tva = CASE WHEN v_include_tva THEN round(v_total_ht * 0.20, 2) ELSE 0 END,
        total_ttc = CASE WHEN v_include_tva THEN round(v_total_ht * 1.20, 2) ELSE round(v_total_ht, 2) END
    WHERE id = v_id;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION select_quote_options(UUID, TEXT[]) TO anon, authenticated;
