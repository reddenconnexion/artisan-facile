-- Ajout des colonnes pour le statut artisan et le type d'activité
-- Utilisé pour le calcul des charges URSSAF

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS artisan_status TEXT DEFAULT 'micro_entreprise';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS activity_type TEXT DEFAULT 'services';

-- Commentaires pour documentation
COMMENT ON COLUMN profiles.artisan_status IS 'Statut juridique de l''artisan: micro_entreprise, ei, eirl, eurl, sasu, sarl';
COMMENT ON COLUMN profiles.activity_type IS 'Type d''activité principale: services, vente, mixte, liberal';
