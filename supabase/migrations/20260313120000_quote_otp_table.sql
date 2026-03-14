-- Table pour stocker les OTP de signature de devis
-- Chaque OTP est haché (SHA-256), expire après 15 min, et ne peut être utilisé qu'une fois

CREATE TABLE IF NOT EXISTS quote_otps (
    id          BIGSERIAL PRIMARY KEY,
    quote_id    BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    otp_hash    TEXT NOT NULL,           -- SHA-256 hex du code à 6 chiffres
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
    used_at     TIMESTAMPTZ,             -- NULL = non utilisé
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_otps_quote_id ON quote_otps(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_otps_expires_at ON quote_otps(expires_at);

-- RLS activé : aucune politique = uniquement accessible via service_role (edge function)
ALTER TABLE quote_otps ENABLE ROW LEVEL SECURITY;

-- Nettoyage automatique des OTP expirés (optionnel, à activer via pg_cron si disponible)
-- SELECT cron.schedule('cleanup-quote-otps', '0 * * * *', 'DELETE FROM quote_otps WHERE expires_at < NOW() - INTERVAL ''1 hour''');
