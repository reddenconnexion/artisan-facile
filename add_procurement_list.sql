-- Migration : Liste de matériel/outillage à commander
-- Permet de noter (texte ou dictée vocale) sur le chantier
-- du matériel manquant, pour le commander plus tard au bureau.
--
-- À exécuter dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS procurement_items (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Contexte du chantier (toutes les références sont facultatives :
    -- l'artisan peut ajouter une ligne « libre » depuis le terrain sans
    -- rattacher de client ou de rapport).
    client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
    project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    intervention_report_id BIGINT REFERENCES intervention_reports(id) ON DELETE SET NULL,
    site_label TEXT,

    -- Contenu
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'u',
    category TEXT DEFAULT 'materiel' CHECK (category IN ('materiel', 'outillage', 'consommable', 'autre')),
    notes TEXT,

    -- Workflow d'achat
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'ordered', 'received', 'cancelled')),
    ordered_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,

    -- Origine de la saisie
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'voice')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procurement_items_user_status
    ON procurement_items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_procurement_items_client
    ON procurement_items(client_id);
CREATE INDEX IF NOT EXISTS idx_procurement_items_report
    ON procurement_items(intervention_report_id);

ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own procurement items"
    ON procurement_items
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Trigger pour maintenir updated_at automatiquement
CREATE OR REPLACE FUNCTION update_procurement_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_procurement_items_updated_at ON procurement_items;
CREATE TRIGGER trg_procurement_items_updated_at
    BEFORE UPDATE ON procurement_items
    FOR EACH ROW
    EXECUTE FUNCTION update_procurement_items_updated_at();
