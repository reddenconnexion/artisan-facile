-- ──────────────────────────────────────────────────────────────────────────────
-- Factures récurrentes (contrats de maintenance, abonnements)
--
-- Permet à l'artisan de définir un modèle de facture qui sera générée
-- automatiquement à intervalle régulier (mensuel, trimestriel, annuel...).
-- Cas d'usage typique : contrat de maintenance d'une chaudière à 25€/mois,
-- entretien annuel d'un système de climatisation, prélèvement trimestriel.
--
-- Workflow :
--   1. L'artisan crée un modèle (client, items, fréquence, prochaine échéance)
--   2. Une RPC `generate_due_recurring_invoices()` parcourt les modèles dus
--      et crée une vraie facture (ligne dans `quotes` avec type='invoice')
--   3. Le `next_due_date` du modèle est avancé à la prochaine période
--   4. Cette RPC peut être déclenchée :
--        - Manuellement depuis l'UI (bouton "Générer maintenant")
--        - Par pg_cron quotidien (à activer si l'extension est disponible)
--        - Par un Edge Function appelée depuis Vercel Cron / cron-job.org
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recurring_invoices (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id   BIGINT  NOT NULL REFERENCES clients(id)    ON DELETE CASCADE,

    -- Contenu du modèle (copie dans quotes lors de la génération)
    title                     TEXT    NOT NULL,
    description               TEXT,
    items                     JSONB   NOT NULL DEFAULT '[]'::jsonb,
    include_tva               BOOLEAN NOT NULL DEFAULT TRUE,
    intervention_address      TEXT,
    intervention_postal_code  TEXT,
    intervention_city         TEXT,

    -- Fréquence et calendrier
    frequency       TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'biannual', 'annual')),
    next_due_date   DATE NOT NULL,
    end_date        DATE,                              -- optionnel : date de fin du contrat
    active          BOOLEAN NOT NULL DEFAULT TRUE,     -- pause/reprise sans suppression

    -- Suivi
    generated_count          INTEGER     NOT NULL DEFAULT 0,
    last_generated_at        TIMESTAMPTZ,
    last_generated_quote_id  BIGINT      REFERENCES quotes(id) ON DELETE SET NULL,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recurring_invoices_user_id_idx     ON recurring_invoices(user_id);
CREATE INDEX IF NOT EXISTS recurring_invoices_client_id_idx   ON recurring_invoices(client_id);
CREATE INDEX IF NOT EXISTS recurring_invoices_next_due_active ON recurring_invoices(next_due_date) WHERE active = TRUE;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE recurring_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_recurring" ON recurring_invoices
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "insert_own_recurring" ON recurring_invoices
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "update_own_recurring" ON recurring_invoices
    FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "delete_own_recurring" ON recurring_invoices
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────────
-- Fonction interne : génère 1 facture à partir d'un modèle donné.
-- Retourne l'id de la facture créée. Avance next_due_date selon la fréquence.
-- Désactive automatiquement le modèle si end_date est dépassée.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _generate_one_recurring_invoice(p_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record       recurring_invoices%ROWTYPE;
    v_total_ht     NUMERIC := 0;
    v_total_tva    NUMERIC := 0;
    v_total_ttc    NUMERIC := 0;
    v_new_quote_id BIGINT;
    v_client_name  TEXT;
    v_period_label TEXT;
    v_next_due     DATE;
BEGIN
    SELECT * INTO v_record FROM recurring_invoices WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Modèle de facture récurrente introuvable';
    END IF;

    -- Calcul des totaux à partir des items
    SELECT
        COALESCE(SUM(
            COALESCE((item->>'price')::NUMERIC, 0)
            * COALESCE(NULLIF((item->>'quantity')::TEXT, '')::NUMERIC, 1)
        ), 0)
    INTO v_total_ht
    FROM jsonb_array_elements(v_record.items) AS item;

    IF v_record.include_tva THEN
        SELECT COALESCE(SUM(
            COALESCE((item->>'price')::NUMERIC, 0)
            * COALESCE(NULLIF((item->>'quantity')::TEXT, '')::NUMERIC, 1)
            * COALESCE(NULLIF((item->>'tva_rate')::TEXT, '')::NUMERIC, 20) / 100
        ), 0)
        INTO v_total_tva
        FROM jsonb_array_elements(v_record.items) AS item;
    END IF;

    v_total_ttc := v_total_ht + v_total_tva;

    -- Récupérer le nom client pour le snapshot dénormalisé
    SELECT name INTO v_client_name FROM clients WHERE id = v_record.client_id;

    -- Libellé de la période courante
    v_period_label := to_char(CURRENT_DATE, 'TMMonth YYYY');

    -- Créer la facture
    INSERT INTO quotes (
        user_id, client_id, client_name, type, status,
        date, valid_until,
        title, items, total_ht, total_tva, total_ttc, include_tva,
        intervention_address, intervention_postal_code, intervention_city,
        created_at, updated_at
    ) VALUES (
        v_record.user_id, v_record.client_id, v_client_name, 'invoice', 'sent',
        CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
        v_record.title || ' — ' || v_period_label,
        v_record.items, v_total_ht, v_total_tva, v_total_ttc, v_record.include_tva,
        v_record.intervention_address, v_record.intervention_postal_code, v_record.intervention_city,
        NOW(), NOW()
    )
    RETURNING id INTO v_new_quote_id;

    -- Avancer la prochaine échéance
    v_next_due := CASE v_record.frequency
        WHEN 'weekly'    THEN v_record.next_due_date + INTERVAL '7 days'
        WHEN 'monthly'   THEN v_record.next_due_date + INTERVAL '1 month'
        WHEN 'quarterly' THEN v_record.next_due_date + INTERVAL '3 months'
        WHEN 'biannual'  THEN v_record.next_due_date + INTERVAL '6 months'
        WHEN 'annual'    THEN v_record.next_due_date + INTERVAL '1 year'
    END;

    UPDATE recurring_invoices
       SET next_due_date           = v_next_due,
           generated_count         = generated_count + 1,
           last_generated_at       = NOW(),
           last_generated_quote_id = v_new_quote_id,
           -- Désactivation auto si la date de fin est dépassée
           active = CASE WHEN end_date IS NOT NULL AND v_next_due > end_date THEN FALSE ELSE active END,
           updated_at              = NOW()
     WHERE id = p_id;

    RETURN v_new_quote_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC publique : génère TOUTES les factures dues (à appeler par un cron/CRON).
-- Service-role uniquement pour éviter qu'un utilisateur déclenche celle des autres.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_due_recurring_invoices()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record   RECORD;
    v_count    INTEGER := 0;
    v_quote_id BIGINT;
BEGIN
    FOR v_record IN
        SELECT id FROM recurring_invoices
         WHERE active = TRUE
           AND next_due_date <= CURRENT_DATE
           AND (end_date IS NULL OR next_due_date <= end_date)
    LOOP
        v_quote_id := _generate_one_recurring_invoice(v_record.id);
        v_count    := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'generated', v_count);
END;
$$;

REVOKE ALL ON FUNCTION generate_due_recurring_invoices()        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION generate_due_recurring_invoices()    TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC artisan : génère manuellement la facture d'un de ses modèles
-- (avec vérif d'ownership). Utile pour le bouton "Générer maintenant" dans l'UI.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_my_recurring_invoice(p_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner    UUID;
    v_quote_id BIGINT;
BEGIN
    SELECT user_id INTO v_owner FROM recurring_invoices WHERE id = p_id;
    IF v_owner IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Modèle introuvable');
    END IF;
    IF v_owner != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Action non autorisée');
    END IF;

    v_quote_id := _generate_one_recurring_invoice(p_id);
    RETURN jsonb_build_object('success', true, 'quote_id', v_quote_id);
END;
$$;

GRANT EXECUTE ON FUNCTION generate_my_recurring_invoice(BIGINT) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- ACTIVATION DU CRON (à exécuter manuellement quand l'extension est disponible)
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule(
--       'generate-recurring-invoices',
--       '0 4 * * *',  -- tous les jours à 4h du matin (heure UTC)
--       $$ SELECT generate_due_recurring_invoices(); $$
--   );
--
-- Alternative sans pg_cron : créer une Edge Function `cron-recurring-invoices`
-- appelée par Vercel Cron (vercel.json) ou cron-job.org sur un horaire quotidien.
-- ──────────────────────────────────────────────────────────────────────────────
