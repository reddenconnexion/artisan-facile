-- Adds soft-archive capability to quotes.
-- archived_at = NULL means quote is active. A timestamp means the artisan put
-- the quote aside (typically because it's too old to follow up). Archived quotes
-- are excluded from dashboard counters and the follow-up center, but can be
-- restored from the "Archives" tab.

ALTER TABLE quotes
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_archived_at
    ON quotes(user_id, archived_at)
    WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN quotes.archived_at IS
    'Timestamp when the artisan archived this quote. NULL = active. Used to hide stale follow-up candidates from dashboard counters and the relance center while keeping the record available for later restore.';
