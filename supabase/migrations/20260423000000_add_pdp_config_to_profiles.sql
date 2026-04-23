-- Migration: Ajout de la configuration Plateforme Agréée (PA/PDP) par utilisateur
-- Contexte: Réforme facturation électronique — chaque artisan peut connecter sa propre PA
-- Le champ pdp_config stocke l'URL, la clé API et le nom de la PA choisie

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pdp_config JSONB DEFAULT NULL;

COMMENT ON COLUMN profiles.pdp_config IS 'Configuration Plateforme Agréée e-facture: {pdp_url, pdp_key, pdp_service}';
