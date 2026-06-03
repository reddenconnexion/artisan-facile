-- ──────────────────────────────────────────────────────────────────────────────
-- "Reporter" une relance — colonne de snooze sur les devis
--
-- Les suggestions de relance quotidiennes proposent trois actions : Valider
-- (envoyer), Modifier (éditer) ou Reporter. "Reporter" repousse la relance d'un
-- nombre de jours : on stocke la date jusqu'à laquelle le devis ne doit plus
-- apparaître dans les relances dues. NULL = pas de report.
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotes' AND column_name = 'relance_snoozed_until'
    ) THEN
        ALTER TABLE public.quotes ADD COLUMN relance_snoozed_until TIMESTAMPTZ;
    END IF;
END $$;

-- Index partiel : seules les lignes effectivement reportées sont indexées
-- (la grande majorité des devis a relance_snoozed_until = NULL).
CREATE INDEX IF NOT EXISTS idx_quotes_relance_snoozed
    ON public.quotes (relance_snoozed_until)
    WHERE relance_snoozed_until IS NOT NULL;
