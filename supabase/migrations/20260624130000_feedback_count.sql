-- Compteur de retours « nouveaux » pour la pastille de navigation (admin)
-- ────────────────────────────────────────────────────────────────────────────
-- Le RLS empêche un artisan de lire les retours des autres. Cette fonction
-- SECURITY DEFINER renvoie le nombre de retours encore au statut 'new'.
-- Contrairement à get_all_feedback(), elle NE lève PAS d'exception pour un
-- non-admin : elle renvoie simplement 0 (la pastille n'apparaît que pour
-- l'administrateur, et on évite de polluer le gestionnaire d'erreurs global).
--
-- À exécuter dans Supabase SQL Editor (ou via `supabase db push`).

CREATE OR REPLACE FUNCTION public.get_new_feedback_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  admin_emails text[] := array['rotvener97@gmail.com', 'reddenconnexion@gmail.com'];
  caller_email text;
  n integer;
BEGIN
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();

  IF caller_email IS NULL OR NOT (caller_email = ANY (admin_emails)) THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO n FROM feedback WHERE status = 'new';
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.get_new_feedback_count() FROM public;
REVOKE ALL ON FUNCTION public.get_new_feedback_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_new_feedback_count() TO authenticated;
