-- Ajout de la colonne photos aux rapports d'intervention
ALTER TABLE intervention_reports
    ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;
