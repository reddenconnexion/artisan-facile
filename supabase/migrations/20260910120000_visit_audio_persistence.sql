-- ──────────────────────────────────────────────────────────────────────────
-- Persistance de l'audio de visite prédevis.
--
-- L'enregistreur de visite (useVisitRecorder) ne gardait l'audio qu'en
-- mémoire du navigateur, le temps de sa transcription — contrairement aux
-- photos, jamais mis à l'abri sur le serveur. Un onglet recyclé par le
-- téléphone en pleine visite (écran verrouillé, appli tuée en arrière-plan)
-- perdait alors les Blob en attente, donc la transcription, sans aucun moyen
-- de rattraper le coup ni même de savoir que ça avait échoué (incident du
-- 10/09/2026 : 9 segments perdus, aucune trace côté serveur).
--
-- Chaque segment est désormais envoyé au stockage dès sa fermeture, comme les
-- photos, avec une ligne `voice_memos` qui porte son statut. Le brouillon de
-- visite peut ainsi retélécharger l'audio et relancer sa transcription après
-- une coupure, au lieu de le perdre définitivement.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE voice_memos
  ADD COLUMN IF NOT EXISTS source           TEXT NOT NULL DEFAULT 'quick_memo' CHECK (source IN ('quick_memo', 'visit_segment')),
  ADD COLUMN IF NOT EXISTS audio_path       TEXT,
  ADD COLUMN IF NOT EXISTS zone             TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS mime_type        TEXT,
  ADD COLUMN IF NOT EXISTS visit_report_id  BIGINT REFERENCES intervention_reports(id) ON DELETE SET NULL;

COMMENT ON COLUMN voice_memos.source          IS 'quick_memo (pipeline mémo vocal) ou visit_segment (segment de visite prédevis)';
COMMENT ON COLUMN voice_memos.audio_path      IS 'Chemin dans le bucket privé visit-audio, tant que le segment n''est pas transcrit avec succès';
COMMENT ON COLUMN voice_memos.visit_report_id IS 'Rapport de visite (intervention_reports) auquel ce segment appartient, une fois créé';

CREATE INDEX IF NOT EXISTS idx_voice_memos_visit_report ON voice_memos(visit_report_id) WHERE visit_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_memos_source_status ON voice_memos(user_id, source, status);

-- Bucket privé : audio brut des segments de visite, le temps d'être transcrit
-- puis effacé (ou retenté après une coupure). 20 Mo : même plafond que côté
-- client (MAX_AUDIO_BYTES dans transcribeAudio.js).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('visit-audio', 'visit-audio', false, 20971520)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 20971520;

-- Un dossier par artisan (`{user_id}/...`), comme received-invoices.
DROP POLICY IF EXISTS "Visit audio readable by owner" ON storage.objects;
CREATE POLICY "Visit audio readable by owner"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'visit-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Visit audio uploadable by owner" ON storage.objects;
CREATE POLICY "Visit audio uploadable by owner"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visit-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Visit audio deletable by owner" ON storage.objects;
CREATE POLICY "Visit audio deletable by owner"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'visit-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
