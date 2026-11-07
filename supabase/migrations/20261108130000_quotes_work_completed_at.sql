-- ──────────────────────────────────────────────────────────────────────────────
-- Date de fin de chantier : `quotes.work_completed_at`.
--
-- Le pilote automatique demande l'avis Google au moment où l'artisan termine
-- le chantier et quitte les lieux. `work_stage` dit si le chantier est terminé
-- mais pas depuis quand ; le rattrapage (téléphone sans réseau au départ du
-- chantier) a besoin de cette date. Posée par trigger, quel que soit l'écran
-- qui termine le chantier (page Affaire, suivi des chantiers, pointage).
-- Les chantiers déjà terminés gardent une date vide : pas de demande d'avis
-- rétroactive.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS work_completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_work_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.work_stage = 'completed' THEN
    IF OLD.work_stage IS DISTINCT FROM 'completed' THEN
      NEW.work_completed_at := now();
    END IF;
  ELSE
    NEW.work_completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_work_completed_at ON public.quotes;
CREATE TRIGGER set_work_completed_at
  BEFORE UPDATE OF work_stage ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_work_completed_at();
