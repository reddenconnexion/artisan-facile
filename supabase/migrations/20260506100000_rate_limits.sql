-- ──────────────────────────────────────────────────────────────────────────────
-- Rate limiting partagé pour les Edge Functions coûteuses (IA, transcription,
-- vision, e-facturation). Algorithme : fenêtre fixe avec compteur atomique.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limits (
    bucket_key   TEXT        PRIMARY KEY,
    count        INTEGER     NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx ON rate_limits(window_start);

-- Aucun accès direct depuis le frontend — RLS verrouillée.
-- Les Edge Functions appellent la RPC `check_rate_limit` en service-role.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC atomique : vérifie + incrémente le compteur d'une fenêtre fixe.
-- Le `FOR UPDATE` lock évite les conditions de course en concurrence.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_key            TEXT,
    p_max_requests   INTEGER,
    p_window_seconds INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now          TIMESTAMPTZ := NOW();
    v_window_start TIMESTAMPTZ := v_now - (p_window_seconds || ' seconds')::INTERVAL;
    v_count        INTEGER;
    v_existing_ws  TIMESTAMPTZ;
    v_reset_at     TIMESTAMPTZ;
BEGIN
    -- Lock atomique
    SELECT count, window_start INTO v_count, v_existing_ws
    FROM rate_limits WHERE bucket_key = p_key FOR UPDATE;

    -- Fenêtre absente ou expirée : réinitialiser
    IF NOT FOUND OR v_existing_ws < v_window_start THEN
        INSERT INTO rate_limits (bucket_key, count, window_start, updated_at)
        VALUES (p_key, 1, v_now, v_now)
        ON CONFLICT (bucket_key) DO UPDATE
            SET count = 1, window_start = v_now, updated_at = v_now;
        RETURN jsonb_build_object(
            'allowed',   true,
            'remaining', p_max_requests - 1,
            'reset_at',  v_now + (p_window_seconds || ' seconds')::INTERVAL
        );
    END IF;

    v_reset_at := v_existing_ws + (p_window_seconds || ' seconds')::INTERVAL;

    -- Limite atteinte
    IF v_count >= p_max_requests THEN
        RETURN jsonb_build_object(
            'allowed',             false,
            'retry_after_seconds', GREATEST(1, EXTRACT(EPOCH FROM (v_reset_at - v_now))::INTEGER),
            'reset_at',            v_reset_at
        );
    END IF;

    -- Incrémenter dans la fenêtre courante
    UPDATE rate_limits
       SET count = count + 1, updated_at = v_now
     WHERE bucket_key = p_key;

    RETURN jsonb_build_object(
        'allowed',   true,
        'remaining', p_max_requests - v_count - 1,
        'reset_at',  v_reset_at
    );
END;
$$;

-- Accès uniquement service_role (pas authenticated, sinon un utilisateur
-- malicieux pourrait spammer avec la clé d'un autre pour saturer son quota).
REVOKE ALL ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
