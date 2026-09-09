-- Indicateur d'urgence client sur les devis, pour prioriser la préparation
-- (acompte/matériel) et la planification des chantiers signés.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_urgency_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_urgency_check
    CHECK (urgency IN ('normal', 'urgent', 'critique'));
