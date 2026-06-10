-- Couleur de marque de l'artisan (hex, ex. #DC2626), utilisée comme couleur
-- d'accent des PDF (devis/factures). NULL = couleurs par défaut de l'app
-- (bleu devis / vert facture).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand_color text;
