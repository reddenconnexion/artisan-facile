-- ──────────────────────────────────────────────────────────────────────────────
-- Expiration et révocation du `clients.portal_token` pour /p/:token
--
-- Avant cette migration, le `portal_token` n'avait aucune expiration : un lien
-- partagé en 2024 fonctionnait toujours en 2026. C'est une faille de sécurité
-- (lien fuité = accès permanent au portail client avec devis et factures).
--
-- Cette migration :
--   1. Ajoute `portal_token_expires_at` (TIMESTAMPTZ) et `portal_token_revoked` (BOOLEAN)
--   2. Backfill : 1 an d'expiration depuis NOW() pour ne pas casser les liens existants
--   3. Met à jour les 3 RPC qui dépendent de portal_token pour vérifier l'état :
--        - get_portal_data
--        - get_portal_messages
--        - send_portal_message_client
--      Retournent { error: 'expired' | 'revoked' } au lieu de NULL pour permettre
--      au frontend d'afficher un message précis.
--   4. Ajoute deux RPC artisan (authentifiées) : regenerate_client_portal_token
--      et revoke_client_portal_token
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS portal_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS portal_token_revoked    BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill : les tokens existants reçoivent 1 an de validité depuis maintenant
-- (assez long pour ne pas casser les liens en circulation, assez court pour que
-- les liens vraiment vieux finissent par expirer)
UPDATE clients
   SET portal_token_expires_at = NOW() + INTERVAL '1 year'
 WHERE portal_token IS NOT NULL
   AND portal_token_expires_at IS NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- get_portal_data : vérifie l'expiration et la révocation
-- Retourne :
--   - NULL si le token n'existe pas du tout (404 implicite)
--   - { error: 'revoked' } si le token a été révoqué
--   - { error: 'expired', expired_at: '...' } si le token est expiré
--   - { client, artisan, quotes, photos, reports } sinon (succès)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_portal_data(token_input uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_client_id  bigint;
    target_user_id    uuid;
    v_revoked         boolean;
    v_expires_at      timestamptz;
    client_data       json;
    artisan_profile   json;
    client_quotes     json;
    client_photos     json;
    client_reports    json;
BEGIN
    -- Identifier client + artisan + état du token
    SELECT id, user_id, portal_token_revoked, portal_token_expires_at
      INTO target_client_id, target_user_id, v_revoked, v_expires_at
      FROM clients
     WHERE portal_token = token_input;

    IF target_client_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_revoked THEN
        RETURN json_build_object('error', 'revoked');
    END IF;

    IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
        RETURN json_build_object('error', 'expired', 'expired_at', v_expires_at);
    END IF;

    -- Données client
    SELECT row_to_json(c) INTO client_data
      FROM clients c
     WHERE id = target_client_id;

    -- Profil artisan
    SELECT row_to_json(p) INTO artisan_profile
      FROM profiles p
     WHERE id = target_user_id;

    -- Devis (hors brouillons)
    SELECT json_agg(q ORDER BY date DESC) INTO client_quotes
      FROM quotes q
     WHERE client_id = target_client_id
       AND q.status != 'draft';

    -- Photos
    SELECT json_agg(pp ORDER BY created_at DESC) INTO client_photos
      FROM project_photos pp
     WHERE client_id = target_client_id;

    -- Rapports d'intervention
    SELECT json_agg(
        json_build_object(
            'id', ir.id,
            'title', ir.title,
            'date', ir.date,
            'status', ir.status,
            'report_number', ir.report_number,
            'report_pdf_url', ir.report_pdf_url,
            'signed_at', ir.signed_at,
            'signer_name', ir.signer_name,
            'description', ir.description,
            'work_done', ir.work_done,
            'materials_used', ir.materials_used,
            'photos', ir.photos,
            'client_signature', ir.client_signature,
            'client_name', ir.client_name,
            'intervention_address', ir.intervention_address,
            'intervention_postal_code', ir.intervention_postal_code,
            'intervention_city', ir.intervention_city,
            'start_time', ir.start_time,
            'end_time', ir.end_time,
            'duration_hours', ir.duration_hours,
            'notes', ir.notes
        )
        ORDER BY ir.date DESC
    ) INTO client_reports
      FROM intervention_reports ir
     WHERE ir.client_id = target_client_id
       AND ir.status IN ('completed', 'signed');

    RETURN json_build_object(
        'client',   client_data,
        'artisan',  artisan_profile,
        'quotes',   COALESCE(client_quotes,  '[]'::json),
        'photos',   COALESCE(client_photos,  '[]'::json),
        'reports',  COALESCE(client_reports, '[]'::json)
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- get_portal_messages : aussi vérifier l'expiration / révocation
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_portal_messages(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client_id  BIGINT;
    v_revoked    BOOLEAN;
    v_expires    TIMESTAMPTZ;
    v_messages   JSONB;
BEGIN
    SELECT id, portal_token_revoked, portal_token_expires_at
      INTO v_client_id, v_revoked, v_expires
      FROM clients WHERE portal_token = p_token;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('error', 'invalid');
    END IF;
    IF v_revoked THEN
        RETURN jsonb_build_object('error', 'revoked');
    END IF;
    IF v_expires IS NOT NULL AND v_expires < NOW() THEN
        RETURN jsonb_build_object('error', 'expired', 'expired_at', v_expires);
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id',          pm.id,
            'sender_type', pm.sender_type,
            'content',     pm.content,
            'sender_name', pm.sender_name,
            'created_at',  pm.created_at,
            'read_at',     pm.read_at
        ) ORDER BY pm.created_at ASC
    ) INTO v_messages
    FROM portal_messages pm
    WHERE pm.client_id = v_client_id;

    RETURN jsonb_build_object('messages', COALESCE(v_messages, '[]'::jsonb));
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- send_portal_message_client : refuse les messages sur portails expirés / révoqués
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_portal_message_client(
    p_token       UUID,
    p_content     TEXT,
    p_sender_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client RECORD;
    v_new_id BIGINT;
BEGIN
    SELECT id, user_id, name, portal_token_revoked, portal_token_expires_at
      INTO v_client
      FROM clients WHERE portal_token = p_token;

    IF v_client.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token invalide');
    END IF;
    IF v_client.portal_token_revoked THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ce lien a été révoqué par l''artisan.');
    END IF;
    IF v_client.portal_token_expires_at IS NOT NULL AND v_client.portal_token_expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ce lien a expiré. Demandez un nouveau lien à votre artisan.');
    END IF;

    IF p_content IS NULL OR trim(p_content) = '' OR length(p_content) > 2000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message invalide (1-2000 caractères)');
    END IF;

    -- Anti-flood : 10 messages / heure / portail
    IF (
        SELECT COUNT(*) FROM portal_messages
        WHERE client_id = v_client.id
          AND sender_type = 'client'
          AND created_at > NOW() - INTERVAL '1 hour'
    ) >= 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Limite de messages atteinte, réessayez dans une heure');
    END IF;

    INSERT INTO portal_messages (client_id, user_id, sender_type, content, sender_name)
    VALUES (
        v_client.id,
        v_client.user_id,
        'client',
        trim(p_content),
        COALESCE(NULLIF(trim(p_sender_name), ''), v_client.name)
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC artisan : régénérer un portal_token (révoque l'ancien, en crée un nouveau,
-- avec 1 an d'expiration). Authentifiée, vérifie que le client appartient bien
-- à l'utilisateur.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION regenerate_client_portal_token(p_client_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_token  UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Vérifier la propriété du client
    IF NOT EXISTS (
        SELECT 1 FROM clients
         WHERE id = p_client_id AND user_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client introuvable');
    END IF;

    v_new_token  := gen_random_uuid();
    v_expires_at := NOW() + INTERVAL '1 year';

    UPDATE clients
       SET portal_token            = v_new_token,
           portal_token_expires_at = v_expires_at,
           portal_token_revoked    = FALSE
     WHERE id = p_client_id;

    RETURN jsonb_build_object(
        'success',    true,
        'token',      v_new_token,
        'expires_at', v_expires_at
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC artisan : révoquer un portal_token (rend le lien immédiatement inutilisable
-- sans en générer un nouveau)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION revoke_client_portal_token(p_client_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM clients
         WHERE id = p_client_id AND user_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client introuvable');
    END IF;

    UPDATE clients
       SET portal_token_revoked = TRUE
     WHERE id = p_client_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION regenerate_client_portal_token(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_client_portal_token(BIGINT)      TO authenticated;
