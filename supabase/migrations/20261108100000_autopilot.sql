-- ──────────────────────────────────────────────────────────────────────────────
-- Pilote automatique (plan Pro)
--
-- L'Edge Function `autopilot-run` (lancée chaque heure par pg_cron, cf.
-- DEPLOYMENT.md) relance seule les devis non signés, rappelle les factures en
-- retard, demande un avis Google après paiement et envoie le résumé du soir.
--
--   - profiles.autopilot_settings : interrupteurs de l'artisan
--     ({ enabled, quotes, invoices, reviews, summary }). NULL = jamais activé.
--   - clients.autopilot_paused : « ne plus relancer ce client automatiquement ».
--   - autopilot_actions : journal de ce que l'appli a fait (récap du tableau de
--     bord, résumé du soir) et verrou anti-doublon (une relance donnée n'est
--     envoyée qu'une fois, même si deux exécutions se chevauchent).
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS autopilot_settings jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS autopilot_paused boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.autopilot_actions (
    id bigserial PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('quote_followup', 'invoice_reminder', 'review_request', 'summary')),
    -- « quote_followup:123:2 » : type, document, étape. NULL pour le résumé.
    action_key text,
    quote_id bigint REFERENCES public.quotes(id) ON DELETE SET NULL,
    client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL,
    step integer,
    label text,
    recipient text,
    subject text,
    body text,
    amount numeric(12, 2),
    -- Canal d'envoi : 'smtp' (adresse pro de l'artisan), 'platform' (au nom de
    -- l'entreprise, réponses vers l'artisan) ou 'push' (résumé).
    channel text,
    status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    error text,
    -- Jour calendaire à Paris (plafond quotidien, un mail par client et par jour).
    day date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Une relance donnée part une seule fois ; un échec libère la place (nouvel
-- essai le lendemain).
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_actions_sent_once
    ON public.autopilot_actions (user_id, action_key)
    WHERE status = 'sent' AND action_key IS NOT NULL;

-- Un résumé par jour.
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_actions_summary_once
    ON public.autopilot_actions (user_id, day)
    WHERE kind = 'summary';

CREATE INDEX IF NOT EXISTS autopilot_actions_user_created_idx
    ON public.autopilot_actions (user_id, created_at DESC);

ALTER TABLE public.autopilot_actions ENABLE ROW LEVEL SECURITY;

-- L'artisan lit son journal ; seule l'Edge Function (service_role) écrit.
DROP POLICY IF EXISTS "Artisan reads own autopilot actions" ON public.autopilot_actions;
CREATE POLICY "Artisan reads own autopilot actions"
    ON public.autopilot_actions FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));
