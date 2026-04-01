-- Ajouter code postal et ville séparément dans la fiche client
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text;

-- Migrer les données existantes : extraire code postal et ville de l'adresse
UPDATE clients
SET
  postal_code = (regexp_match(address, '\m(\d{5})\M'))[1],
  city        = trim((regexp_match(address, '\d{5}\s+([^\n,]+)'))[1])
WHERE address IS NOT NULL AND address ~ '\d{5}';
