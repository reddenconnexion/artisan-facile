-- ──────────────────────────────────────────────────────────────────────────────
-- Tracking d'ouverture des emails envoyés via SMTP
--
-- Deux tables :
--   `email_sends`  — une ligne par mail envoyé (token unique pour le pixel)
--   `email_opens`  — une ligne par ouverture détectée (historique complet)
--
-- Le pixel transparent 1x1 est injecté dans le HTML par l'edge function
-- `send-document-email`. Quand le client charge le mail, son client mail
-- charge le pixel → l'edge function `track-email-open` enregistre un open.
--
-- Limites connues : les clients mail qui bloquent les images (Gmail web par
-- défaut depuis 2014 charge les images via proxy Google → on détecte une
-- ouverture mais avec l'IP de Google, pas du client) ; les MUA en mode
-- texte ne déclenchent rien.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_sends (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quote_id         BIGINT REFERENCES quotes(id) ON DELETE SET NULL,
    client_id        BIGINT REFERENCES clients(id) ON DELETE SET NULL,
    recipient_email  TEXT NOT NULL,
    subject          TEXT,
    tracking_token   UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    sent_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_sends_user      ON email_sends(user_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_quote     ON email_sends(quote_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_token     ON email_sends(tracking_token);

CREATE TABLE IF NOT EXISTS email_opens (
    id             BIGSERIAL PRIMARY KEY,
    email_send_id  UUID NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
    opened_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_agent     TEXT,
    ip_address     INET
);

CREATE INDEX IF NOT EXISTS idx_email_opens_send ON email_opens(email_send_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_opens ENABLE ROW LEVEL SECURITY;

-- L'utilisateur lit ses propres envois
CREATE POLICY email_sends_select_own ON email_sends
    FOR SELECT USING (auth.uid() = user_id);

-- Pas d'INSERT/UPDATE/DELETE direct depuis le client — uniquement via
-- les edge functions (service-role). Aucune policy d'écriture → bloqué.

-- L'utilisateur lit les opens de ses propres envois (via join)
CREATE POLICY email_opens_select_own ON email_opens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM email_sends s
            WHERE s.id = email_opens.email_send_id
            AND s.user_id = auth.uid()
        )
    );

-- ── Vue de stats agrégées par quote (utilisée par DevisList) ────────────────
CREATE OR REPLACE VIEW email_send_stats AS
SELECT
    s.id                    AS email_send_id,
    s.user_id,
    s.quote_id,
    s.client_id,
    s.recipient_email,
    s.subject,
    s.sent_at,
    s.tracking_token,
    (SELECT count(*)  FROM email_opens o WHERE o.email_send_id = s.id) AS open_count,
    (SELECT min(o.opened_at) FROM email_opens o WHERE o.email_send_id = s.id) AS first_opened_at,
    (SELECT max(o.opened_at) FROM email_opens o WHERE o.email_send_id = s.id) AS last_opened_at
FROM email_sends s;

-- La vue hérite implicitement de la RLS de email_sends grâce à
-- security_invoker (PG 15+) ; on l'active explicitement par sécurité.
ALTER VIEW email_send_stats SET (security_invoker = true);

GRANT SELECT ON email_sends      TO authenticated;
GRANT SELECT ON email_opens      TO authenticated;
GRANT SELECT ON email_send_stats TO authenticated;
