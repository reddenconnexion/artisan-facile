-- =====================================================
-- PLANIFICATION DU RAPPORT HEBDOMADAIRE DES RETOURS ARTISANS
-- =====================================================
-- Invoque l'edge function `weekly-feedback-report` chaque lundi à 08h00 (UTC),
-- qui agrège les retours de la semaine, génère l'analyse IA, stocke le rapport
-- dans feedback_reports et envoie l'email à l'administrateur.
--
-- À exécuter UNE FOIS dans le SQL Editor de Supabase (Dashboard → SQL Editor).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. EXTENSIONS REQUISES ----------------------------------------------------
--    pg_cron : planification ; pg_net : appels HTTP sortants depuis Postgres.
--    (Dashboard → Database → Extensions, ou via SQL ci-dessous.)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. SECRETS (Supabase Vault) -----------------------------------------------
--    On stocke l'URL du projet et le secret partagé dans le Vault pour ne pas
--    écrire d'information sensible en clair dans la définition du job cron.
--
--    ⚠️ Remplacez les deux valeurs ci-dessous :
--      • <PROJECT_URL>  : https://vpqcmfsxrpctaiaydhsu.supabase.co
--      • <CRON_SECRET>  : une chaîne aléatoire (ex: `openssl rand -hex 32`).
--
--    Cette MÊME valeur <CRON_SECRET> doit être renseignée comme variable
--    d'environnement de la fonction (Dashboard → Edge Functions → Secrets) :
--      CRON_SECRET = <CRON_SECRET>
--    ainsi que (pour l'analyse + l'email) :
--      GEMINI_API_KEY, RESEND_API_KEY, EMAIL_FROM (optionnel),
--      REPORT_RECIPIENTS (optionnel, emails séparés par des virgules ;
--                         défaut = administrateurs de l'allowlist).

SELECT vault.create_secret('https://vpqcmfsxrpctaiaydhsu.supabase.co', 'project_url')
  WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url');

SELECT vault.create_secret('<CRON_SECRET>', 'weekly_feedback_cron_secret')
  WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'weekly_feedback_cron_secret');

-- 3. PLANIFICATION DU JOB ----------------------------------------------------
--    '0 8 * * 1' = chaque lundi à 08:00 UTC. Le rapport couvre les 7 jours
--    précédents (period_days par défaut = 7 côté fonction).
--    On dé-planifie d'abord un éventuel job existant pour rester idempotent.
SELECT cron.unschedule('weekly-feedback-report')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-feedback-report');

SELECT cron.schedule(
  'weekly-feedback-report',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/weekly-feedback-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'weekly_feedback_cron_secret')
    ),
    body := jsonb_build_object('period_days', 7),
    timeout_milliseconds := 60000
  );
  $$
);

-- 4. VÉRIFICATIONS UTILES ----------------------------------------------------
-- Jobs actifs :              SELECT jobid, jobname, schedule FROM cron.job;
-- Historique d'exécution :   SELECT * FROM cron.job_run_details
--                              WHERE jobname = 'weekly-feedback-report'
--                              ORDER BY start_time DESC LIMIT 10;
-- Supprimer le job :         SELECT cron.unschedule('weekly-feedback-report');
