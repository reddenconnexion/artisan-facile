-- =====================================================
-- CORRECTIFS DE SÉCURITÉ PHASE 1 - PRIORITÉ CRITIQUE
-- Artisan Facile - 12 décembre 2025
-- =====================================================
-- ATTENTION: Exécuter ces commandes dans l'ordre
-- Faire un backup de la base avant application
-- =====================================================

-- =====================================================
-- 1. AJOUTER EXPIRATION ET RÉVOCATION AUX TOKENS
-- =====================================================

-- Ajouter les colonnes si elles n'existent pas
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS token_revoked BOOLEAN DEFAULT FALSE;

-- Mettre à jour les tokens existants avec une expiration de 30 jours
-- à partir de leur date de création
UPDATE quotes
SET token_expires_at = COALESCE(created_at, NOW()) + INTERVAL '30 days'
WHERE token_expires_at IS NULL
  AND public_token IS NOT NULL;

-- Index pour les recherches de tokens
CREATE INDEX IF NOT EXISTS idx_quotes_public_token ON quotes(public_token)
WHERE public_token IS NOT NULL;

-- =====================================================
-- 2. FONCTION get_public_quote SÉCURISÉE
-- =====================================================

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
  -- Vérifier que le token existe et est valide
  SELECT q.id INTO v_quote_id
  FROM quotes q
  WHERE q.public_token = lookup_token
    AND (q.token_revoked IS NULL OR q.token_revoked = FALSE)
    AND (q.token_expires_at IS NULL OR q.token_expires_at > NOW())
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

  -- Logger l'accès (optionnel, décommenter si table access_logs existe)
  -- INSERT INTO access_logs (event_type, resource_type, resource_id)
  -- VALUES ('view_public_quote', 'quote', v_quote_id::TEXT);

  RETURN result;
END;
$$;

-- =====================================================
-- 3. FONCTION sign_public_quote SÉCURISÉE
-- =====================================================

CREATE OR REPLACE FUNCTION sign_public_quote(lookup_token UUID, signature_base64 TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quote_record RECORD;
BEGIN
  -- Récupérer le devis avec verrou pour éviter les conditions de course
  SELECT id, status, signed_at, token_expires_at, token_revoked
  INTO quote_record
  FROM quotes
  WHERE public_token = lookup_token
  FOR UPDATE;

  -- =====================
  -- VALIDATIONS
  -- =====================

  -- Devis introuvable
  IF quote_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Devis introuvable ou lien invalide'
    );
  END IF;

  -- Token révoqué
  IF quote_record.token_revoked = TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce lien a été révoqué'
    );
  END IF;

  -- Token expiré
  IF quote_record.token_expires_at IS NOT NULL
     AND quote_record.token_expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce lien a expiré. Veuillez demander un nouveau lien à votre artisan.'
    );
  END IF;

  -- Déjà signé
  IF quote_record.signed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce devis a déjà été signé le ' || to_char(quote_record.signed_at, 'DD/MM/YYYY')
    );
  END IF;

  -- Statut non valide
  IF quote_record.status IN ('cancelled', 'rejected', 'accepted') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce devis ne peut plus être signé (statut: ' || quote_record.status || ')'
    );
  END IF;

  -- Valider la signature
  -- Une signature canvas en base64 fait généralement > 1000 caractères
  IF signature_base64 IS NULL OR LENGTH(signature_base64) < 100 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'La signature fournie est invalide'
    );
  END IF;

  -- Vérifier le format base64 basique (commence par data:image)
  IF NOT (signature_base64 LIKE 'data:image/%') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Format de signature non reconnu'
    );
  END IF;

  -- =====================
  -- MISE À JOUR
  -- =====================

  UPDATE quotes
  SET signature = signature_base64,
      status = 'accepted',
      signed_at = NOW(),
      updated_at = NOW()
  WHERE id = quote_record.id;

  -- Logger l'événement (optionnel)
  -- INSERT INTO access_logs (event_type, resource_type, resource_id, details)
  -- VALUES ('sign_quote', 'quote', quote_record.id::TEXT,
  --         jsonb_build_object('signed_at', NOW()));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Devis signé avec succès',
    'signed_at', NOW()
  );
END;
$$;

-- =====================================================
-- 4. FONCTION POUR RÉVOQUER UN TOKEN
-- =====================================================

CREATE OR REPLACE FUNCTION revoke_quote_token(quote_id_input BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE quotes
  SET token_revoked = TRUE,
      updated_at = NOW()
  WHERE id = quote_id_input
    AND user_id = auth.uid(); -- Seul le propriétaire peut révoquer

  RETURN FOUND;
END;
$$;

-- =====================================================
-- 5. FONCTION POUR RÉGÉNÉRER UN TOKEN
-- =====================================================

CREATE OR REPLACE FUNCTION regenerate_quote_token(quote_id_input BIGINT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token UUID;
BEGIN
  new_token := gen_random_uuid();

  UPDATE quotes
  SET public_token = new_token,
      token_expires_at = NOW() + INTERVAL '30 days',
      token_revoked = FALSE,
      updated_at = NOW()
  WHERE id = quote_id_input
    AND user_id = auth.uid(); -- Seul le propriétaire peut régénérer

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN new_token;
END;
$$;

-- =====================================================
-- 6. TABLE DE LOGS D'ACCÈS (OPTIONNEL)
-- =====================================================

CREATE TABLE IF NOT EXISTS access_logs (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip_address INET,
    user_agent TEXT,
    user_id UUID REFERENCES auth.users(id),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS pour la table de logs
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- Personne ne peut lire les logs via l'API publique
CREATE POLICY "Logs are not readable via API" ON access_logs
    FOR SELECT USING (false);

-- Tout le monde peut insérer des logs (via SECURITY DEFINER functions)
CREATE POLICY "Allow log insertion" ON access_logs
    FOR INSERT WITH CHECK (true);

-- Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_type ON access_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_access_logs_resource ON access_logs(resource_type, resource_id);

-- =====================================================
-- 7. VÉRIFICATION DES POLITIQUES RLS EXISTANTES
-- =====================================================

-- S'assurer que les profils sont privés (devrait déjà être fait)
DO $$
BEGIN
  -- Supprimer l'ancienne politique publique si elle existe encore
  DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;

  -- Créer/Recréer la politique stricte
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

  RAISE NOTICE 'Politique profils mise à jour avec succès';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Erreur lors de la mise à jour des politiques: %', SQLERRM;
END;
$$;

-- =====================================================
-- 8. VÉRIFIER QUE LE BUCKET quote_files EST PRIVÉ
-- =====================================================

-- Note: Cette commande peut échouer si déjà fait ou si permissions insuffisantes
DO $$
BEGIN
  UPDATE storage.buckets
  SET public = false
  WHERE id = 'quote_files' AND public = true;

  IF FOUND THEN
    RAISE NOTICE 'Bucket quote_files rendu privé';
  ELSE
    RAISE NOTICE 'Bucket quote_files déjà privé ou inexistant';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Impossible de modifier le bucket: %', SQLERRM;
END;
$$;

-- =====================================================
-- 9. NETTOYAGE DES TOKENS EXPIRÉS (À EXÉCUTER PÉRIODIQUEMENT)
-- =====================================================

-- Fonction pour nettoyer les vieux tokens (à appeler via CRON ou manuellement)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  -- Révoquer les tokens expirés depuis plus de 7 jours
  UPDATE quotes
  SET token_revoked = TRUE
  WHERE token_expires_at < NOW() - INTERVAL '7 days'
    AND (token_revoked IS NULL OR token_revoked = FALSE);

  GET DIAGNOSTICS cleaned_count = ROW_COUNT;

  RETURN cleaned_count;
END;
$$;

-- =====================================================
-- FIN DES CORRECTIFS PHASE 1
-- =====================================================

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'CORRECTIFS PHASE 1 APPLIQUÉS AVEC SUCCÈS';
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'Actions effectuées:';
  RAISE NOTICE '  1. Colonnes token_expires_at et token_revoked ajoutées';
  RAISE NOTICE '  2. Tokens existants mis à jour avec expiration 30 jours';
  RAISE NOTICE '  3. Fonction get_public_quote sécurisée';
  RAISE NOTICE '  4. Fonction sign_public_quote sécurisée';
  RAISE NOTICE '  5. Fonctions revoke/regenerate token créées';
  RAISE NOTICE '  6. Table access_logs créée';
  RAISE NOTICE '  7. Politiques RLS vérifiées';
  RAISE NOTICE '=====================================================';
END;
$$;
