-- Table pour stocker chaque ouverture de devis par le client
CREATE TABLE IF NOT EXISTS public.quote_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id BIGINT NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS : l'artisan peut lire les vues de ses propres devis
ALTER TABLE public.quote_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artisan_can_read_own_quote_views" ON public.quote_views;
CREATE POLICY "artisan_can_read_own_quote_views"
  ON public.quote_views FOR SELECT
  USING (user_id = auth.uid());

-- Realtime : permet les notifications en direct dans l'app artisan
ALTER PUBLICATION supabase_realtime ADD TABLE public.quote_views;

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_quote_views_quote_id ON public.quote_views(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_views_user_id ON public.quote_views(user_id);

-- Mise à jour de get_public_quote pour enregistrer chaque ouverture
CREATE OR REPLACE FUNCTION get_public_quote(lookup_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  v_quote_id BIGINT;
  v_user_id UUID;
BEGIN
  -- Récupérer l'id et le user_id du devis
  SELECT id, user_id INTO v_quote_id, v_user_id
  FROM quotes
  WHERE public_token = lookup_token
    AND (token_revoked IS NULL OR token_revoked = FALSE)
    AND (token_expires_at IS NULL OR token_expires_at > NOW());

  IF v_quote_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Mettre à jour last_viewed_at (dernière ouverture)
  UPDATE quotes
  SET last_viewed_at = NOW()
  WHERE id = v_quote_id;

  -- Enregistrer cette ouverture dans l'historique
  INSERT INTO public.quote_views (quote_id, user_id, viewed_at)
  VALUES (v_quote_id, v_user_id, NOW());

  -- Retourner les données du devis
  SELECT jsonb_build_object(
    'id', q.id,
    'date', q.date,
    'valid_until', q.valid_until,
    'items', q.items,
    'total_ht', q.total_ht,
    'total_tva', q.total_tva,
    'total_ttc', q.total_ttc,
    'notes', q.notes,
    'status', q.status,
    'title', q.title,
    'type', q.type,
    'is_external', q.is_external,
    'signature', q.signature,
    'signed_at', q.signed_at,
    'original_pdf_url', q.original_pdf_url,
    'quote_number', q.quote_number,
    'client', jsonb_build_object(
      'name', c.name,
      'address', c.address,
      'email', c.email,
      'postal_code', c.postal_code,
      'city', c.city,
      'siren', c.siren,
      'tva_intracom', c.tva_intracom
    ),
    'artisan', jsonb_build_object(
      'id', p.id,
      'company_name', p.company_name,
      'full_name', p.full_name,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'phone', p.phone,
      'professional_email', p.professional_email,
      'email', p.professional_email,
      'siret', p.siret,
      'logo_url', p.logo_url,
      'website', p.website,
      'iban', p.iban,
      'wero_phone', p.wero_phone
    )
  ) INTO result
  FROM quotes q
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN profiles p ON q.user_id = p.id
  WHERE q.id = v_quote_id;

  RETURN result;
END;
$$;
