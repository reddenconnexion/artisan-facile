-- ──────────────────────────────────────────────────────────────────────────────
-- Journal des échanges avec le client (emails, appels, SMS, relances)
--
-- Constat (18/10/2026) : la table n'avait jamais été créée en production — son
-- script dormait dans supabase/legacy. Chaque envoi de devis, relance, appel
-- ou SMS tentait d'y écrire et recevait une 404 de l'API, sans rien afficher :
-- l'historique de la fiche client restait vide et les relances ignoraient le
-- dernier contact.
--
-- Écarts avec le script legacy :
--   - pas de contrainte CHECK sur `type` : l'app écrit aussi 'manual'
--     (relance faite hors appli), que la contrainte d'origine refusait ;
--   - le client doit appartenir à l'utilisateur (pas d'écriture sur la fiche
--     d'un autre compte en devinant un id) ;
--   - suppression en cascade avec le compte, index pour l'historique.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_interactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id bigint NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    type text NOT NULL,
    date timestamptz NOT NULL DEFAULT now(),
    details text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_interactions_user_client_date_idx
    ON public.client_interactions (user_id, client_id, date DESC);

CREATE INDEX IF NOT EXISTS client_interactions_client_id_idx
    ON public.client_interactions (client_id);

ALTER TABLE public.client_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own client interactions" ON public.client_interactions;
CREATE POLICY "Users can view own client interactions"
    ON public.client_interactions FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can log interactions on own clients" ON public.client_interactions;
CREATE POLICY "Users can log interactions on own clients"
    ON public.client_interactions FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_interactions.client_id AND c.user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can update own client interactions" ON public.client_interactions;
CREATE POLICY "Users can update own client interactions"
    ON public.client_interactions FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own client interactions" ON public.client_interactions;
CREATE POLICY "Users can delete own client interactions"
    ON public.client_interactions FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);
