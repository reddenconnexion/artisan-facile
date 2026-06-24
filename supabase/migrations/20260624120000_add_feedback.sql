-- Retours d'utilisation des artisans (feedback in-app)
-- ────────────────────────────────────────────────────────────────────────────
-- Permet à un artisan d'envoyer, depuis n'importe quel écran, un retour :
--   • bug      : quelque chose ne fonctionne pas
--   • ux       : ergonomie / parcours trop compliqué
--   • feature  : idée de nouvelle fonctionnalité
--   • other    : autre remarque
--
-- Chaque retour est rattaché à son auteur (RLS) et capture le contexte utile
-- au triage (page d'où il a été envoyé, navigateur). L'administrateur lit
-- l'ensemble des retours via une fonction SECURITY DEFINER verrouillée par une
-- allowlist d'emails (même principe que get_admin_stats).
--
-- À exécuter dans Supabase SQL Editor (ou via `supabase db push`).

-- ── Table des retours ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    category TEXT NOT NULL DEFAULT 'other'
        CHECK (category IN ('bug', 'ux', 'feature', 'other')),
    message TEXT NOT NULL,
    -- Note de satisfaction optionnelle (1 à 5 étoiles)
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),

    -- Contexte capturé automatiquement (aide au triage, jamais saisi par l'user)
    page TEXT,          -- chemin de l'écran d'où le retour est envoyé
    user_agent TEXT,    -- navigateur / appareil

    -- Suivi côté administrateur
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'planned', 'in_progress', 'done', 'declined')),
    admin_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- L'artisan ne voit et ne crée que ses propres retours. La lecture globale
-- (administrateur) passe exclusivement par get_all_feedback() ci-dessous.
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert their own feedback" ON feedback;
CREATE POLICY "Users insert their own feedback"
    ON feedback
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read their own feedback" ON feedback;
CREATE POLICY "Users read their own feedback"
    ON feedback
    FOR SELECT
    USING (auth.uid() = user_id);

-- ── updated_at automatique ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_updated_at ON feedback;
CREATE TRIGGER trg_feedback_updated_at
    BEFORE UPDATE ON feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_feedback_updated_at();

-- ── Lecture globale réservée à l'administrateur ─────────────────────────────
-- SECURITY DEFINER : contourne le RLS pour agréger tous les retours, mais
-- l'accès est verrouillé par l'allowlist d'emails (cf. add_admin_stats_function.sql).
CREATE OR REPLACE FUNCTION public.get_all_feedback()
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

  SELECT jsonb_build_object(
    'generated_at', now(),
    'counts', jsonb_build_object(
      'total',   (SELECT count(*) FROM feedback),
      'new',     (SELECT count(*) FROM feedback WHERE status = 'new'),
      'bug',     (SELECT count(*) FROM feedback WHERE category = 'bug' AND status NOT IN ('done', 'declined')),
      'ux',      (SELECT count(*) FROM feedback WHERE category = 'ux' AND status NOT IN ('done', 'declined')),
      'feature', (SELECT count(*) FROM feedback WHERE category = 'feature' AND status NOT IN ('done', 'declined'))
    ),
    'items', (
      SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          f.id, f.category, f.message, f.rating, f.page,
          f.status, f.admin_note, f.created_at, f.updated_at,
          usr.email AS author_email
        FROM feedback f
        LEFT JOIN auth.users usr ON usr.id = f.user_id
      ) r
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ── Mise à jour du statut/note réservée à l'administrateur ──────────────────
CREATE OR REPLACE FUNCTION public.set_feedback_status(
  p_id bigint,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  admin_emails text[] := array['rotvener97@gmail.com', 'reddenconnexion@gmail.com'];
  caller_email text;
BEGIN
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();

  IF caller_email IS NULL OR NOT (caller_email = ANY (admin_emails)) THEN
    RAISE EXCEPTION 'Accès refusé : réservé à l''administrateur.'
      USING errcode = '42501';
  END IF;

  IF p_status NOT IN ('new', 'planned', 'in_progress', 'done', 'declined') THEN
    RAISE EXCEPTION 'Statut invalide : %', p_status USING errcode = '22023';
  END IF;

  UPDATE feedback
  SET status = p_status,
      admin_note = COALESCE(p_note, admin_note)
  WHERE id = p_id;
END;
$$;

-- Verrouillage des droits d'exécution : aucun accès anonyme.
REVOKE ALL ON FUNCTION public.get_all_feedback() FROM public;
REVOKE ALL ON FUNCTION public.get_all_feedback() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_all_feedback() TO authenticated;

REVOKE ALL ON FUNCTION public.set_feedback_status(bigint, text, text) FROM public;
REVOKE ALL ON FUNCTION public.set_feedback_status(bigint, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_feedback_status(bigint, text, text) TO authenticated;
