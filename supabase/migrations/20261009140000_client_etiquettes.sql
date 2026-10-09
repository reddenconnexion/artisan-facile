-- ──────────────────────────────────────────────────────────────────────────────
-- Étiquettes de tableau électrique liées aux fiches clients
--
-- Pendant de `client_plans` : le module « Étiquettes Tableau » ne gardait
-- son projet qu'en localStorage (un seul à la fois, perdu en changeant
-- d'appareil). Chaque jeu d'étiquettes est désormais rattaché à un client et
-- retrouvé depuis sa fiche.
--
-- `data` : { brand, circuits: [...], customRowSize } — même format que
-- l'export JSON du module.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_etiquettes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   BIGINT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Tableau principal',
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_etiquettes_client_id_idx
  ON public.client_etiquettes (client_id);

ALTER TABLE public.client_etiquettes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own client_etiquettes" ON public.client_etiquettes;
CREATE POLICY "Users manage own client_etiquettes"
  ON public.client_etiquettes FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    -- On ne rattache des étiquettes qu'à ses propres clients.
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.update_client_etiquettes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_etiquettes_updated_at ON public.client_etiquettes;
CREATE TRIGGER client_etiquettes_updated_at
  BEFORE UPDATE ON public.client_etiquettes
  FOR EACH ROW EXECUTE FUNCTION public.update_client_etiquettes_updated_at();
