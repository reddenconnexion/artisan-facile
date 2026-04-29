-- Suivi de l'enregistrement du SIREN dans l'annuaire DGFIP via B2BRouter
-- Quand status = 'registered', le SIREN est dans l'annuaire et les fournisseurs
-- peuvent envoyer leurs factures électroniques à cet artisan via B2BRouter/Artisan Facile.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS b2b_receiver_status       TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS b2b_receiver_registered_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS b2b_receiver_error         TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.b2b_receiver_status IS 'Statut enregistrement annuaire DGFIP : registered | error | null';
COMMENT ON COLUMN profiles.b2b_receiver_registered_at IS 'Date d''enregistrement dans l''annuaire DGFIP via B2BRouter';
COMMENT ON COLUMN profiles.b2b_receiver_error IS 'Dernier message d''erreur B2BRouter si enregistrement échoué';
