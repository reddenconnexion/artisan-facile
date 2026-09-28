-- Notes marketing (calendrier éditorial, banque d'idées, notes rapides)
-- ────────────────────────────────────────────────────────────────────────────
-- La page Marketing synchronise ses données dans profiles.marketing_data, mais
-- la colonne n'avait jamais été créée : l'enregistrement échouait en silence et
-- les notes ne vivaient que dans le localStorage de l'appareil.
-- Les politiques RLS existantes de profiles (lecture/mise à jour de sa propre
-- ligne) couvrent la nouvelle colonne.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS marketing_data JSONB;
