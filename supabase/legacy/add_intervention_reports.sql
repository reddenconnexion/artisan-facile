-- Migration : Rapports d'intervention pour dépannages
-- À exécuter dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS intervention_reports (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
    quote_id BIGINT REFERENCES quotes(id) ON DELETE SET NULL,

    -- Numéro de rapport (généré automatiquement ou saisi manuellement)
    report_number TEXT,

    -- Date de l'intervention
    date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Informations générales
    title TEXT NOT NULL,
    description TEXT,
    work_done TEXT,

    -- Adresse du chantier / lieu d'intervention
    intervention_address TEXT,
    intervention_postal_code TEXT,
    intervention_city TEXT,

    -- Suivi du temps
    start_time TIME,
    end_time TIME,
    duration_hours NUMERIC(5, 2),

    -- Matériaux utilisés (tableau JSON : [{description, quantity, unit, price}])
    materials_used JSONB DEFAULT '[]'::jsonb,

    -- Nom du client dénormalisé pour affichage rapide
    client_name TEXT,

    -- Statut : brouillon, terminé, signé
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'signed')),

    -- Signature électronique du client (base64 PNG)
    client_signature TEXT,
    signed_at TIMESTAMPTZ,
    signer_name TEXT,

    -- Notes internes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activer la sécurité par lignes (RLS)
ALTER TABLE intervention_reports ENABLE ROW LEVEL SECURITY;

-- Politique RLS : chaque utilisateur ne voit que ses propres rapports
CREATE POLICY "Users can manage their own intervention reports"
    ON intervention_reports
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Index pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_intervention_reports_user_id ON intervention_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_intervention_reports_client_id ON intervention_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_intervention_reports_date ON intervention_reports(date DESC);
CREATE INDEX IF NOT EXISTS idx_intervention_reports_status ON intervention_reports(status);
