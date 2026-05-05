-- ──────────────────────────────────────────────────────────────────────────────
-- Portal Messages : messagerie entre artisan et client via le portail partagé
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_messages (
    id          BIGSERIAL PRIMARY KEY,
    client_id   BIGINT  NOT NULL REFERENCES clients(id)      ON DELETE CASCADE,
    user_id     UUID    NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
    sender_type TEXT    NOT NULL CHECK (sender_type IN ('client', 'artisan')),
    content     TEXT    NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 2000),
    sender_name TEXT,          -- nom affiché (prénom client ou nom entreprise artisan)
    read_at     TIMESTAMPTZ,   -- horodatage lecture par le destinataire
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_portal_messages_client_id   ON portal_messages(client_id);
CREATE INDEX idx_portal_messages_user_unread ON portal_messages(user_id, read_at)
    WHERE read_at IS NULL AND sender_type = 'client';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;

-- L'artisan peut lire ses messages
CREATE POLICY "artisan_select_portal_messages" ON portal_messages
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- L'artisan peut insérer ses réponses
CREATE POLICY "artisan_insert_portal_messages" ON portal_messages
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND sender_type = 'artisan');

-- L'artisan peut marquer les messages comme lus
CREATE POLICY "artisan_update_portal_messages" ON portal_messages
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

-- ── Realtime ─────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE portal_messages;

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC : lecture des messages du portail client (accessible sans auth)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_portal_messages(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client_id BIGINT;
    v_messages  JSONB;
BEGIN
    SELECT id INTO v_client_id FROM clients WHERE portal_token = p_token;
    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Token invalide');
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
-- RPC : envoi d'un message par le client (accessible sans auth)
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
    SELECT id, user_id, name INTO v_client FROM clients WHERE portal_token = p_token;
    IF v_client.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token invalide');
    END IF;

    IF p_content IS NULL OR trim(p_content) = '' OR length(p_content) > 2000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message invalide (1-2000 caractères)');
    END IF;

    -- Anti-flood : max 10 messages par heure par portail
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

-- Accès public pour les portails clients (pages sans authentification)
GRANT EXECUTE ON FUNCTION get_portal_messages(UUID)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION send_portal_message_client(UUID, TEXT, TEXT)     TO anon, authenticated;
