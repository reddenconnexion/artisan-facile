-- Lien direct entre un rapport d'intervention et sa facture de clôture
ALTER TABLE intervention_reports
  ADD COLUMN IF NOT EXISTS invoice_id bigint REFERENCES quotes(id) ON DELETE SET NULL;
