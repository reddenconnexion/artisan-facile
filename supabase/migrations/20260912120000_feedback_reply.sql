-- Réponse de l'administrateur à un retour d'artisan
-- ────────────────────────────────────────────────────────────────────────────
-- Jusqu'ici, un retour envoyé via la modale « Donner mon avis » ne pouvait
-- recevoir qu'un changement de statut : aucune réponse écrite ne parvenait
-- à l'artisan (aucune colonne dédiée, aucun écran pour la consulter).
--
-- Ce correctif ajoute une réponse texte visible par l'auteur du retour :
--   • admin_reply / admin_reply_at : réponse de l'administrateur + date d'envoi
--   • set_feedback_status() accepte désormais un paramètre p_reply
--   • la lecture de ses propres retours (avec réponse) passe par la policy
--     RLS déjà existante « Users read their own feedback », donc l'écran
--     côté artisan interroge directement la table (pas de RPC nécessaire).

ALTER TABLE feedback
    ADD COLUMN IF NOT EXISTS admin_reply TEXT,
    ADD COLUMN IF NOT EXISTS admin_reply_at TIMESTAMPTZ;

-- ── Mise à jour du statut / de la note / de la réponse ──────────────────────
-- Remplace l'ancienne signature à 3 arguments : sans ce DROP, les deux
-- fonctions coexisteraient (p_reply ayant une valeur par défaut) et un appel
-- à 3 arguments deviendrait ambigu pour Postgres.
DROP FUNCTION IF EXISTS public.set_feedback_status(bigint, text, text);

CREATE OR REPLACE FUNCTION public.set_feedback_status(
  p_id bigint,
  p_status text,
  p_note text DEFAULT NULL,
  p_reply text DEFAULT NULL
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
      admin_note = COALESCE(p_note, admin_note),
      admin_reply = COALESCE(p_reply, admin_reply),
      admin_reply_at = CASE WHEN p_reply IS NOT NULL THEN NOW() ELSE admin_reply_at END
  WHERE id = p_id;
END;
$$;

-- ── Expose la réponse dans la vue admin (get_all_feedback) ──────────────────
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
          f.status, f.admin_note, f.admin_reply, f.admin_reply_at,
          f.created_at, f.updated_at,
          usr.email AS author_email
        FROM feedback f
        LEFT JOIN auth.users usr ON usr.id = f.user_id
      ) r
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_feedback_status(bigint, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.set_feedback_status(bigint, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_feedback_status(bigint, text, text, text) TO authenticated;
