-- Add parent_id to quotes to link deposits (acomptes) to original quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES quotes(id);

COMMENT ON COLUMN quotes.parent_id IS 'Reference to the original quote if this is a deposit (acompte) or related invoice';
