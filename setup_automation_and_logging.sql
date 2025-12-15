-- =====================================================
-- AUTOMATISATION & LOGS - OPTIMISATION SÉCURITÉ
-- =====================================================

-- 1. ACTIVER L'EXTENSION PG_CRON (Nécessite droits admin)
-- Sur Supabase : Dashboard -> Database -> Extensions -> Chercher "pg_cron" -> Enable
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. PLANIFIER LE NETTOYAGE AUTOMATIQUE (Tous les jours à 3h du matin)
-- Cette commande nécessite que l'extension soit active
SELECT cron.schedule(
  'cleanup-expired-tokens', -- Nom de la tâche
  '0 3 * * *',              -- CRON: 03:00 am daily
  $$SELECT cleanup_expired_tokens()$$
);

-- Note : Pour voir les jobs actifs : SELECT * FROM cron.job;
-- Pour supprimer : SELECT cron.unschedule('cleanup-expired-tokens');


-- 3. ACTIVER LES LOGS D'ACCÈS
-- On modifie la fonction get_public_quote pour enregistrer les accès

CREATE OR REPLACE FUNCTION get_public_quote_with_log(lookup_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  v_quote_id BIGINT;
  v_user_agent TEXT;
  v_ip INET;
BEGIN
  -- Récupérer infos contexte (si dispo via headers Supabase, sinon NULL)
  -- Note: Supabase n'expose pas toujours l'IP direct dans PL/PGSQL facilement sans config extra
  -- On fait au mieux avec ce qu'on peut capturer ou on laisse NULL.
  
  -- Appel de la logique originale
  -- Vérifier que le token existe et est valide
  SELECT q.id INTO v_quote_id
  FROM quotes q
  WHERE q.public_token = lookup_token
    AND (q.token_revoked IS NULL OR q.token_revoked = FALSE)
    AND (q.token_expires_at IS NULL OR q.token_expires_at > NOW())
    AND q.status NOT IN ('cancelled');

  IF v_quote_id IS NULL THEN
    -- Log tentative échouée (token invalide ou expiré)
    INSERT INTO access_logs (event_type, resource_type, resource_id, details)
    VALUES ('access_attempt_failed', 'quote', lookup_token::text, '{"reason": "invalid_or_expired"}'::jsonb);
    
    RETURN NULL;
  END IF;

  -- Log succès
  INSERT INTO access_logs (event_type, resource_type, resource_id, details)
  VALUES ('access_granted', 'quote', v_quote_id::text, '{"method": "public_link"}'::jsonb);

  -- Construire le résultat (Code identique à la v1)
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
    'signature', q.signature,
    'signed_at', q.signed_at,
    'original_pdf_url', q.original_pdf_url,
    'client', jsonb_build_object(
      'name', c.name,
      'address', c.address,
      'email', c.email
    ),
    'artisan', jsonb_build_object(
      'company_name', p.company_name,
      'full_name', p.full_name,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'phone', p.phone,
      'email', p.professional_email,
      'siret', p.siret,
      'logo_url', p.logo_url,
      'website', p.website
    )
  ) INTO result
  FROM quotes q
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN profiles p ON q.user_id = p.id
  WHERE q.id = v_quote_id;

  RETURN result;
END;
$$;

-- Remplacer l'ancienne fonction par la nouvelle (et drop l'ancienne pour éviter confusion si on change signature)
-- Ici on garde la même signature donc OR REPLACE suffit.
-- Mais attention, j'ai changé le nom pour l'exemple. Si vous voulez l'appliquer :
-- Renommez 'get_public_quote_with_log' en 'get_public_quote' ci-dessus.

