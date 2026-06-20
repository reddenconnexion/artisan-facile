-- Comparateur achats fournisseurs
-- ────────────────────────────────────────────────────────────────────────────
-- L'artisan charge ses factures de matériel (PDF). Chaque ligne produit est
-- extraite puis rangée dans un comparateur : pour un même produit, on retrouve
-- le prix payé chez chaque fournisseur et donc le meilleur fournisseur.
--
-- Deux tables :
--   • supplier_invoices  : une facture fournisseur importée (en-tête + fichier)
--   • supplier_purchases : une ligne produit d'une facture (sert au comparateur)
--
-- À exécuter dans Supabase SQL Editor (ou via `supabase db push`).

-- ── Factures fournisseurs importées ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_invoices (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    supplier_name TEXT,
    invoice_number TEXT,
    invoice_date DATE,

    total_ht NUMERIC(12, 2),
    total_ttc NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'EUR',

    -- Fichier d'origine (stocké dans le bucket public `quote_files`)
    file_path TEXT,
    file_url TEXT,

    item_count INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'manual')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Lignes produits (alimentent le comparateur) ─────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_purchases (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invoice_id BIGINT REFERENCES supplier_invoices(id) ON DELETE CASCADE,

    -- Fournisseur recopié sur la ligne pour comparer sans jointure
    supplier_name TEXT,

    product_name TEXT NOT NULL,
    -- Clé normalisée (minuscule, sans accent ni ponctuation) servant à regrouper
    -- le même produit acheté chez plusieurs fournisseurs.
    product_key TEXT NOT NULL,
    reference TEXT,

    quantity NUMERIC(12, 3) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'u',
    unit_price NUMERIC(12, 4),   -- prix unitaire HT
    total_price NUMERIC(12, 2),  -- montant de la ligne

    purchase_date DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_user
    ON supplier_invoices(user_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_purchases_user_key
    ON supplier_purchases(user_id, product_key);
CREATE INDEX IF NOT EXISTS idx_supplier_purchases_invoice
    ON supplier_purchases(invoice_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own supplier invoices" ON supplier_invoices;
CREATE POLICY "Users manage their own supplier invoices"
    ON supplier_invoices
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own supplier purchases" ON supplier_purchases;
CREATE POLICY "Users manage their own supplier purchases"
    ON supplier_purchases
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ── updated_at automatique sur les factures ─────────────────────────────────
CREATE OR REPLACE FUNCTION update_supplier_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_invoices_updated_at ON supplier_invoices;
CREATE TRIGGER trg_supplier_invoices_updated_at
    BEFORE UPDATE ON supplier_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_supplier_invoices_updated_at();
