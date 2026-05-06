-- ──────────────────────────────────────────────────────────────────────────────
-- Jalons d'avancement de chantier sur les rapports d'intervention.
--
-- Chaque jalon est une preuve datée et géolocalisée d'une étape clé du chantier
-- (démarrage, mi-chantier, réception, ou personnalisé). Apparaît dans le PDF de
-- rapport pour valoriser le travail auprès du client ET protéger l'artisan
-- en cas de litige (preuves horodatées avec position GPS).
--
-- Format JSONB :
-- [
--   {
--     "id": "uuid",
--     "type": "start" | "progress" | "reception" | "custom",
--     "label": "Démarrage du chantier",
--     "photo_url": "https://.../project-photos/interventions/...",
--     "photo_path": "interventions/...",
--     "timestamp": "2026-05-06T14:32:00Z",
--     "latitude": 48.85,            -- optionnel (si l'utilisateur a accepté)
--     "longitude": 2.35,            -- optionnel
--     "accuracy": 10,               -- optionnel (mètres)
--     "notes": "..."                -- optionnel
--   }
-- ]
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE intervention_reports
    ADD COLUMN IF NOT EXISTS milestones JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Index GIN pour permettre des requêtes futures sur les types de jalons,
-- ex: "tous les rapports avec un jalon de réception non signé"
CREATE INDEX IF NOT EXISTS intervention_reports_milestones_gin
    ON intervention_reports USING GIN (milestones);
