-- ──────────────────────────────────────────────────────────────────────────────
-- Pilote automatique : retouches de l'artisan sur les mails prévus.
--
-- L'écran « Pilote automatique » montre chaque mail avant son départ.
-- L'artisan peut en modifier le texte ou le retenir (« Ne pas envoyer »).
-- Une ligne par mail prévu, repéré par la même clé que le journal
-- (autopilot_actions.action_key, ex. « quote_followup:123:2 »).
-- L'Edge Function autopilot-run lit ces lignes avant chaque envoi.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.autopilot_drafts (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_key text NOT NULL,
    subject text,
    body text,
    skipped boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, action_key)
);

ALTER TABLE public.autopilot_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Artisan manages own autopilot drafts" ON public.autopilot_drafts;
CREATE POLICY "Artisan manages own autopilot drafts"
    ON public.autopilot_drafts FOR ALL
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));
