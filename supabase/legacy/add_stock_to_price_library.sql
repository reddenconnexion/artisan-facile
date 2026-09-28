-- Add stock management columns to price_library
ALTER TABLE price_library ADD COLUMN IF NOT EXISTS stock_quantity numeric DEFAULT 0;
ALTER TABLE price_library ADD COLUMN IF NOT EXISTS min_stock_alert numeric DEFAULT 1;
ALTER TABLE price_library ADD COLUMN IF NOT EXISTS last_stock_update timestamptz DEFAULT now();

-- Add a comment to explain usage
COMMENT ON COLUMN price_library.stock_quantity IS 'Current stock count for material items';
