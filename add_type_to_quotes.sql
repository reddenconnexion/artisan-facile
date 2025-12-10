-- Add 'type' column to quotes table to distinguish between Quotes and Invoices
ALTER TABLE quotes 
ADD COLUMN type text DEFAULT 'quote' CHECK (type IN ('quote', 'invoice'));

-- Comment on column
COMMENT ON COLUMN quotes.type IS 'Type of the document: quote (Devis) or invoice (Facture)';
