-- Table des factures reçues via PDP/B2BRouter (obligation de réception sept. 2026)

CREATE TABLE IF NOT EXISTS received_invoices (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  b2brouter_id  TEXT UNIQUE,
  supplier_name TEXT,
  supplier_siren TEXT,
  supplier_tin  TEXT,
  invoice_number TEXT,
  invoice_date  DATE,
  due_date      DATE,
  total_ht      NUMERIC(12,2),
  total_ttc     NUMERIC(12,2),
  currency      TEXT DEFAULT 'EUR',
  status        TEXT DEFAULT 'new',
  pdf_url       TEXT,
  raw_payload   JSONB,
  received_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE received_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own received invoices"
  ON received_invoices FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_received_invoices_user_received
  ON received_invoices (user_id, received_at DESC);

COMMENT ON TABLE received_invoices IS 'Factures fournisseurs reçues via la PA B2BRouter (réforme e-facturation)';
