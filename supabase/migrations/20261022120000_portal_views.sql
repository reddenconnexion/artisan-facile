-- ──────────────────────────────────────────────────────────────────────────────
-- Compteur d'ouvertures du portail client (/p/:token)
--
-- Seules les ouvertures de devis (/q/) étaient tracées (quote_views) : on ne
-- savait pas si les clients ouvraient réellement leur espace. Cette table
-- enregistre une ouverture par client et par tranche de 30 minutes, via une
-- RPC qui vérifie le jeton (non révoqué, non expiré) comme get_portal_data.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_views (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id   UUID   NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.portal_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artisan_can_read_own_portal_views" ON public.portal_views;
CREATE POLICY "artisan_can_read_own_portal_views"
  ON public.portal_views FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_portal_views_client_id ON public.portal_views(client_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_views_user_id   ON public.portal_views(user_id);

CREATE OR REPLACE FUNCTION public.record_portal_view(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id BIGINT;
  v_user_id   UUID;
BEGIN
  SELECT id, user_id INTO v_client_id, v_user_id
  FROM clients
  WHERE portal_token = p_token
    AND portal_token_revoked = FALSE
    AND (portal_token_expires_at IS NULL OR portal_token_expires_at > NOW());

  IF v_client_id IS NULL THEN
    RETURN;
  END IF;

  -- Rechargements rapprochés : une seule ouverture par tranche de 30 minutes
  IF EXISTS (
    SELECT 1 FROM portal_views
    WHERE client_id = v_client_id AND viewed_at > NOW() - INTERVAL '30 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO portal_views (client_id, user_id) VALUES (v_client_id, v_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_portal_view(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_portal_view(uuid) TO anon, authenticated;
