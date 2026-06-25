-- Charges professionnelles déductibles de l'artisan
-- ────────────────────────────────────────────────────────────────────────────
-- Permet à l'artisan de saisir ses charges récurrentes (loyer, véhicule,
-- assurance décennale, matériel, sous-traitance…), mensuelles ou annuelles, par
-- catégorie. Ces charges alimentent le conseiller comptable pour comparer le
-- régime micro (abattement forfaitaire) au régime réel (déduction des charges
-- réelles) et chiffrer l'intérêt d'un changement de statut.
--
-- À exécuter dans Supabase SQL Editor (ou via `supabase db push`).

CREATE TABLE IF NOT EXISTS business_charges (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    label TEXT NOT NULL,
    -- Catégorie (cf. CHARGE_CATEGORIES côté frontend). Champ libre côté base
    -- pour ne pas bloquer l'évolution des catégories ; validé côté application.
    category TEXT NOT NULL DEFAULT 'autre',
    -- Montant HT du poste, dans la périodicité indiquée.
    amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    periodicity TEXT NOT NULL DEFAULT 'annual'
        CHECK (periodicity IN ('monthly', 'annual')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_charges_user
    ON business_charges(user_id, created_at DESC);

-- ── RLS : chaque artisan ne voit et ne gère que ses propres charges ──────────
ALTER TABLE business_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own charges" ON business_charges;
CREATE POLICY "Users read their own charges"
    ON business_charges FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert their own charges" ON business_charges;
CREATE POLICY "Users insert their own charges"
    ON business_charges FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update their own charges" ON business_charges;
CREATE POLICY "Users update their own charges"
    ON business_charges FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete their own charges" ON business_charges;
CREATE POLICY "Users delete their own charges"
    ON business_charges FOR DELETE
    USING (auth.uid() = user_id);

-- ── updated_at automatique ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_business_charges_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_charges_updated_at ON business_charges;
CREATE TRIGGER trg_business_charges_updated_at
    BEFORE UPDATE ON business_charges
    FOR EACH ROW
    EXECUTE FUNCTION update_business_charges_updated_at();
