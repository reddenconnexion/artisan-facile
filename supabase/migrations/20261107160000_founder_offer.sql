-- ──────────────────────────────────────────────────────────────────────────────
-- Offre « Membre fondateur » : 9,90 €/mois (ou 99 €/an) bloqué à vie pour les
-- 50 premiers abonnés Pro, avec 30 jours d'essai.
--
-- `founder_since`        : posé par le webhook Stripe quand une souscription
--                          au tarif fondateur aboutit. Une place prise le reste
--                          (même après résiliation) : le compteur ne remonte pas.
-- `subscription_trial_end` : fin de l'essai gratuit (Stripe `trial_end`), pour
--                          afficher « Essai gratuit · 1er prélèvement le … ».
-- `founder_spots_left()` : places restantes, lisible par tous (page d'accueil
--                          publique comprise) sans exposer qui est fondateur.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founder_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_trial_end TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.founder_spots_left()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, 50 - COUNT(*)::integer)
  FROM public.profiles
  WHERE founder_since IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.founder_spots_left() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founder_spots_left() TO anon, authenticated, service_role;
