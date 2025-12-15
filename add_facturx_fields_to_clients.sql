-- Migration to add Factur-X fields to clients table

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS siren TEXT,
ADD COLUMN IF NOT EXISTS tva_intracom TEXT,
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'professional'; -- 'professional' or 'individual'

COMMENT ON COLUMN clients.siren IS 'SIREN number (9 digits) for Factur-X compliance';
COMMENT ON COLUMN clients.tva_intracom IS 'Intra-community VAT number';
COMMENT ON COLUMN clients.type IS 'Client type: professional (B2B) or individual (B2C)';
