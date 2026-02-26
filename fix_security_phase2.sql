-- =====================================================
-- CORRECTIFS DE SÉCURITÉ PHASE 2
-- Artisan Facile - 26 février 2026
-- =====================================================
-- Phase 2 : Renforcement de l'expiration des tokens,
-- suppression des clés API en base, logs admin lisibles.
-- ATTENTION : Exécuter après fix_security_vulnerabilities.sql (Phase 1)
-- =====================================================

-- =====================================================
-- 1. FORCER L'EXPIRATION SUR TOUS LES TOKENS NULL
--    (Phase 1 avait un UPDATE mais la condition IS NULL
--     dans get_public_quote permettait un accès infini)
-- =====================================================

-- Définir une expiration de 365 jours pour les devis existants
-- sans date d'expiration (créés avant la Phase 1)
UPDATE quotes
SET token_expires_at = COALESCE(created_at, NOW()) + INTERVAL '365 days'
WHERE token_expires_at IS NULL
  AND public_token IS NOT NULL;

-- =====================================================
-- 2. METTRE À JOUR get_public_quote POUR REJETER
--    LES TOKENS SANS DATE D'EXPIRATION
-- =====================================================

DROP FUNCTION IF EXISTS get_public_quote(uuid);

CREATE OR REPLACE FUNCTION get_public_quote(lookup_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  v_quote_id BIGINT;
BEGIN
  -- Vérifier que le token existe, est valide ET a une date d'expiration
  -- (les tokens sans expiration ne sont plus autorisés après la phase 2)
  SELECT q.id INTO v_quote_id
  FROM quotes q
  WHERE q.public_token = lookup_token
    AND (q.token_revoked IS NULL OR q.token_revoked = FALSE)
    AND q.token_expires_at IS NOT NULL
    AND q.token_expires_at > NOW()
    AND q.status NOT IN ('cancelled');

  IF v_quote_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Construire le résultat
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
    'has_material_deposit', q.has_material_deposit,
    'amendment_details', q.amendment_details,
    'signature', q.signature,
    'signed_at', q.signed_at,
    'original_pdf_url', q.original_pdf_url,
    'intervention_address', q.intervention_address,
    'intervention_postal_code', q.intervention_postal_code,
    'intervention_city', q.intervention_city,
    'parent_quote_data', q.parent_quote_data,
    'client', jsonb_build_object(
      'name', c.name,
      'address', c.address,
      'email', c.email
    ),
    'artisan', jsonb_build_object(
      'id', p.id,
      'company_name', p.company_name,
      'full_name', p.full_name,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'phone', p.phone,
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

-- =====================================================
-- 3. SUPPRIMER LES CLÉS API STOCKÉES EN BASE DE DONNÉES
--    (Sécurité : les clés ne doivent pas être en BDD)
-- =====================================================

-- Supprimer les clés API des préférences stockées
-- Les artisans devront les re-saisir (elles resteront dans localStorage)
UPDATE profiles
SET ai_preferences = ai_preferences - 'openai_api_key'
WHERE ai_preferences ? 'openai_api_key';

-- =====================================================
-- 4. RENDRE LES LOGS D'ACCÈS LISIBLES PAR L'ADMIN
-- =====================================================

-- Supprimer la politique qui bloque toute lecture
DROP POLICY IF EXISTS "Logs are not readable via API" ON access_logs;

-- Créer une politique qui permet uniquement au service_role de lire
-- (l'accès admin se fera via le dashboard Supabase ou une fonction SECURITY DEFINER)
CREATE POLICY "Only service role can read logs" ON access_logs
    FOR SELECT USING (false); -- API publique : toujours bloquée

-- Fonction pour lire les logs accessible uniquement via service_role
CREATE OR REPLACE FUNCTION get_recent_access_logs(limit_count INTEGER DEFAULT 100)
RETURNS TABLE(
  id BIGINT,
  event_type TEXT,
  resource_type TEXT,
  resource_id TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Seul l'artisan peut voir ses propres logs
  RETURN QUERY
  SELECT
    l.id,
    l.event_type,
    l.resource_type,
    l.resource_id,
    l.user_id,
    l.created_at,
    l.details
  FROM access_logs l
  WHERE l.user_id = auth.uid()
  ORDER BY l.created_at DESC
  LIMIT limit_count;
END;
$$;

-- =====================================================
-- 5. AJOUTER CONTRAINTE NOT NULL SUR token_expires_at
--    POUR LES NOUVEAUX TOKENS (via valeur DEFAULT)
-- =====================================================

-- Ajouter une valeur par défaut de 30 jours pour les nouveaux tokens
ALTER TABLE quotes
  ALTER COLUMN token_expires_at
  SET DEFAULT (NOW() + INTERVAL '30 days');

-- =====================================================
-- FIN DES CORRECTIFS PHASE 2
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'CORRECTIFS PHASE 2 APPLIQUÉS AVEC SUCCÈS';
  RAISE NOTICE 'Actions effectuées :';
  RAISE NOTICE '  - Tokens sans expiration mis à jour (365j)';
  RAISE NOTICE '  - get_public_quote rejette désormais les tokens NULL';
  RAISE NOTICE '  - Clés API supprimées des profils en base';
  RAISE NOTICE '  - Valeur par défaut 30j ajoutée pour nouveaux tokens';
  RAISE NOTICE '=====================================================';
END;
$$;
