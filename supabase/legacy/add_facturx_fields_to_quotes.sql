-- Migration to add Factur-X fields to quotes table

ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS operation_category TEXT DEFAULT 'service', -- 'service', 'goods', 'mixed'
ADD COLUMN IF NOT EXISTS vat_on_debits BOOLEAN DEFAULT false;

COMMENT ON COLUMN quotes.operation_category IS 'Category of operation for Factur-X (Livraison de biens / Prestation de services / Mixte)';
COMMENT ON COLUMN quotes.vat_on_debits IS 'Option pour le paiement de la taxe d''après les débits';
