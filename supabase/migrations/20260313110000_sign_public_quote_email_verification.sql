-- Enforce email verification when signing a public quote.
-- Only the client whose email is on file can sign the quote.
-- If the client has no email registered, signing is blocked (contact artisan to add one).

DROP FUNCTION IF EXISTS sign_public_quote(uuid, text);

CREATE OR REPLACE FUNCTION sign_public_quote(
    lookup_token    UUID,
    signature_base64 TEXT,
    signer_email    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quote_record  RECORD;
  client_email  TEXT;
BEGIN
  -- 1. Récupérer le devis avec verrou anti-concurrence
  SELECT q.id, q.status, q.signed_at, q.token_expires_at, q.token_revoked, q.client_id
  INTO quote_record
  FROM quotes q
  WHERE q.public_token = lookup_token
  FOR UPDATE;

  -- Devis introuvable
  IF quote_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Devis introuvable ou lien invalide');
  END IF;

  -- Token révoqué
  IF quote_record.token_revoked = TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ce lien a été révoqué');
  END IF;

  -- Token expiré
  IF quote_record.token_expires_at IS NOT NULL
     AND quote_record.token_expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ce lien a expiré. Veuillez demander un nouveau lien à votre artisan.');
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
      'error', 'Ce devis ne peut plus être signé (statut: ' || quote_record.status || ')'
    );
  END IF;

  -- 2. Vérification de l'email du destinataire
  SELECT lower(trim(c.email)) INTO client_email
  FROM clients c
  WHERE c.id = quote_record.client_id;

  IF client_email IS NOT NULL AND client_email <> '' THEN
    -- L'email est requis
    IF signer_email IS NULL OR trim(signer_email) = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Veuillez confirmer votre adresse email pour signer ce devis.'
      );
    END IF;

    IF lower(trim(signer_email)) <> client_email THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'L''adresse email ne correspond pas au destinataire de ce devis.'
      );
    END IF;
  END IF;

  -- 3. Valider la signature
  IF signature_base64 IS NULL OR LENGTH(signature_base64) < 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La signature fournie est invalide');
  END IF;

  IF NOT (signature_base64 LIKE 'data:image/%') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Format de signature non reconnu');
  END IF;

  -- 4. Enregistrer
  UPDATE quotes
  SET signature  = signature_base64,
      status     = 'accepted',
      signed_at  = NOW(),
      updated_at = NOW()
  WHERE id = quote_record.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Devis signé avec succès',
    'signed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sign_public_quote(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION sign_public_quote(uuid, text, text) TO authenticated;
