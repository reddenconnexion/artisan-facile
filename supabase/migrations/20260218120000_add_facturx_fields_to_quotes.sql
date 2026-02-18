-- Add Factur-X fields to quotes table (operation_category + vat_on_debits)
-- These columns were used in the frontend but never created in the DB.

ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS operation_category TEXT DEFAULT 'service',
ADD COLUMN IF NOT EXISTS vat_on_debits BOOLEAN DEFAULT false;

COMMENT ON COLUMN quotes.operation_category IS 'Category of operation for Factur-X: service, goods, mixed';
COMMENT ON COLUMN quotes.vat_on_debits IS 'Option pour le paiement de la TVA d''après les débits';
