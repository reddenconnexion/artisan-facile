-- ──────────────────────────────────────────────────────────────────────────────
-- Pilote automatique : secret de l'appel horaire gardé dans le Vault.
--
-- pg_cron appelle `autopilot-run` avec l'en-tête x-cron-secret. Plutôt qu'un
-- secret d'Edge Function à recopier à la main dans le Vault (deux copies à
-- garder identiques, et une valeur à faire circuler), le secret est généré
-- dans le Vault (`autopilot_cron_secret`) et la fonction le vérifie par cette
-- RPC, réservée à la service_role. CRON_SECRET reste accepté s'il est défini.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.autopilot_cron_secret_matches(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(length(p_secret) >= 32, false) AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'autopilot_cron_secret' AND decrypted_secret = p_secret
  );
$$;

REVOKE ALL ON FUNCTION public.autopilot_cron_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autopilot_cron_secret_matches(text) TO service_role;
