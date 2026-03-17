-- Vérification OTP optionnelle par devis
-- Par défaut désactivée (require_otp = false), l'artisan peut l'activer
-- au cas par cas depuis la fiche du devis.

-- 1. Ajouter la colonne require_otp à quotes
ALTER TABLE public.quotes
    ADD COLUMN IF NOT EXISTS require_otp BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Mettre à jour get_public_quote pour exposer require_otp au frontend
CREATE OR REPLACE FUNCTION get_public_quote(lookup_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  UPDATE quotes
  SET last_viewed_at = NOW()
  WHERE public_token = lookup_token;

  SELECT jsonb_build_object(
    'id', q.id,
    'date', q.date,
    'valid_until', q.valid_until,
    'items', q.items,
    'total_ht', q.total_ht,
    'total_tva', q.total_tva,
    'total_ttc', q.total_ttc,
    'notes', q.notes,
    'status', q.status,
    'title', q.title,
    'type', q.type,
    'is_external', q.is_external,
    'signature', q.signature,
    'signed_at', q.signed_at,
    'original_pdf_url', q.original_pdf_url,
    'has_material_deposit', q.has_material_deposit,
    'intervention_address', q.intervention_address,
    'intervention_postal_code', q.intervention_postal_code,
    'intervention_city', q.intervention_city,
    'require_otp', q.require_otp,
    'client', jsonb_build_object(
      'name', c.name,
      'address', c.address,
      'email', c.email,
      'siren', c.siren,
      'tva_intracom', c.tva_intracom
    ),
    'artisan', jsonb_build_object(
      'id', p.id,
      'company_name', p.company_name,
      'full_name', p.full_name,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'phone', p.phone,
      'professional_email', p.professional_email,
      'email', p.professional_email,
      'siret', p.siret,
      'logo_url', p.logo_url,
      'website', p.website,
      'iban', p.iban,
      'wero_phone', p.wero_phone
    )
  ) INTO result
  FROM quotes q
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN profiles p ON q.user_id = p.id
  WHERE q.public_token = lookup_token;

  RETURN result;
END;
$$;

-- 3. Recréer sign_public_quote : OTP requis seulement si require_otp = true
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
        RETURN jsonb_build_object('success', false, 'error', 'Ce lien a été révoqué');
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

    IF quote_record.status IN ('cancelled', 'rejected', 'accepted') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ce devis ne peut plus être signé (statut : ' || quote_record.status || ')'
        );
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
