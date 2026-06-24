-- Rapports hebdomadaires des retours artisans
-- ────────────────────────────────────────────────────────────────────────────
-- Chaque lundi (via pg_cron → edge function `weekly-feedback-report`), les
-- retours envoyés par les artisans la semaine écoulée sont agrégés et analysés
-- par l'IA. Le résultat (synthèse + plan d'amélioration priorisé) est stocké ici
-- puis envoyé par email à l'administrateur. La page admin /app/admin/reports lit
-- l'historique via get_feedback_reports() (SECURITY DEFINER + allowlist), comme
-- get_admin_stats / get_all_feedback.
--
-- À exécuter dans Supabase SQL Editor (ou via `supabase db push`).

-- ── Table des rapports ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_reports (
    id BIGSERIAL PRIMARY KEY,

    -- Période couverte par le rapport (bornes incluses côté start, exclues côté end)
    period_start TIMESTAMPTZ NOT NULL,
    period_end   TIMESTAMPTZ NOT NULL,

    -- Nombre de retours analysés sur la période
    feedback_count INTEGER NOT NULL DEFAULT 0,

    -- Synthèse courte (1-2 phrases) affichée en tête de rapport
    summary TEXT,

    -- Analyse structurée renvoyée par l'IA : satisfaction, thèmes, plan d'action,
    -- quick wins. Schéma libre côté front (cf. AdminFeedbackReports.jsx).
    analysis JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Modèle IA utilisé + version, pour traçabilité
    model TEXT,

    -- Suivi de l'envoi email
    email_sent    BOOLEAN NOT NULL DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    email_error   TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_period
    ON feedback_reports(period_end DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Aucun accès direct. L'edge function écrit via la service role (bypass RLS),
-- et l'administrateur lit via get_feedback_reports() ci-dessous.
ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;
-- (Pas de policy : table fermée par défaut une fois RLS activé.)

-- ── Lecture de l'historique réservée à l'administrateur ──────────────────────
CREATE OR REPLACE FUNCTION public.get_feedback_reports(p_limit integer DEFAULT 26)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  admin_emails text[] := array['rotvener97@gmail.com', 'reddenconnexion@gmail.com'];
  caller_email text;
  result jsonb;
BEGIN
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();

  IF caller_email IS NULL OR NOT (caller_email = ANY (admin_emails)) THEN
    RAISE EXCEPTION 'Accès refusé : réservé à l''administrateur.'
      USING errcode = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.period_end DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      fr.id, fr.period_start, fr.period_end, fr.feedback_count,
      fr.summary, fr.analysis, fr.model,
      fr.email_sent, fr.email_sent_at, fr.created_at
    FROM feedback_reports fr
    ORDER BY fr.period_end DESC
    LIMIT GREATEST(p_limit, 1)
  ) r;

  RETURN result;
END;
$$;

-- Verrouillage des droits d'exécution : aucun accès anonyme.
REVOKE ALL ON FUNCTION public.get_feedback_reports(integer) FROM public;
REVOKE ALL ON FUNCTION public.get_feedback_reports(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_feedback_reports(integer) TO authenticated;
