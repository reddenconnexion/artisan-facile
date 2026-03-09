ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS include_tva BOOLEAN DEFAULT true;

-- Backfill existing rows based on whether TVA was applied
UPDATE quotes
SET include_tva = (total_tva > 0 OR (total_ht = 0 AND total_tva = 0))
WHERE include_tva IS NULL;
