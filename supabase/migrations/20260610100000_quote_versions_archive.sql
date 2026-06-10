-- Archive immuable des versions de devis.
-- Problème résolu : un devis "envoyé" pouvait être modifié en place, sans aucune
-- trace de la version réellement transmise au client (cf. devis n°125 / id 159).
-- Deux mécanismes :
--   1. Côté client : à l'envoi par email, le PDF est archivé et une version
--      "sent" est insérée (avec pdf_url).
--   2. Côté base (ce trigger, filet de sécurité) : toute modification de contenu
--      d'un devis dans un statut engageant — ou sa sortie d'un statut engageant
--      (ex. repassage en brouillon) — archive l'état AVANT modification.

CREATE TABLE IF NOT EXISTS quote_versions (
  id bigserial PRIMARY KEY,
  quote_id bigint NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version_number integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('sent', 'pre_modification', 'restore')),
  snapshot jsonb NOT NULL,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_quote_versions_quote_id ON quote_versions(quote_id);

ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;

-- L'artisan voit et crée les versions de ses propres devis.
-- Pas de policy UPDATE/DELETE : une archive est immuable (seul le pdf_url
-- peut être complété juste après l'insertion, via la policy dédiée).
CREATE POLICY "Users can view own quote versions" ON quote_versions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quote versions" ON quote_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can attach pdf to own quote versions" ON quote_versions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Insère une version en évitant les doublons consécutifs (même contenu que la
-- dernière version archivée -> on ne ré-archive pas).
CREATE OR REPLACE FUNCTION insert_quote_version(p_row quotes, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_snap jsonb;
  snap jsonb := to_jsonb(p_row);
BEGIN
  SELECT snapshot INTO last_snap
  FROM quote_versions
  WHERE quote_id = p_row.id
  ORDER BY version_number DESC
  LIMIT 1;

  IF last_snap IS NOT NULL
     AND last_snap -> 'items' IS NOT DISTINCT FROM snap -> 'items'
     AND last_snap ->> 'total_ttc' IS NOT DISTINCT FROM snap ->> 'total_ttc'
     AND last_snap ->> 'total_ht' IS NOT DISTINCT FROM snap ->> 'total_ht'
     AND last_snap ->> 'title' IS NOT DISTINCT FROM snap ->> 'title'
     AND last_snap ->> 'notes' IS NOT DISTINCT FROM snap ->> 'notes'
     AND last_snap ->> 'valid_until' IS NOT DISTINCT FROM snap ->> 'valid_until' THEN
    RETURN; -- contenu identique à la dernière archive
  END IF;

  INSERT INTO quote_versions (quote_id, user_id, version_number, reason, snapshot)
  VALUES (
    p_row.id,
    p_row.user_id,
    COALESCE((SELECT MAX(version_number) FROM quote_versions WHERE quote_id = p_row.id), 0) + 1,
    p_reason,
    snap
  );
END;
$$;

CREATE OR REPLACE FUNCTION archive_quote_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Statuts où le document engage l'artisan vis-à-vis du client
  protected_statuses text[] := ARRAY['sent', 'accepted', 'signed', 'billed', 'paid'];
  content_changed boolean;
BEGIN
  content_changed :=
       NEW.items::text   IS DISTINCT FROM OLD.items::text
    OR NEW.total_ht      IS DISTINCT FROM OLD.total_ht
    OR NEW.total_tva     IS DISTINCT FROM OLD.total_tva
    OR NEW.total_ttc     IS DISTINCT FROM OLD.total_ttc
    OR NEW.title         IS DISTINCT FROM OLD.title
    OR NEW.notes         IS DISTINCT FROM OLD.notes
    OR NEW.date          IS DISTINCT FROM OLD.date
    OR NEW.valid_until   IS DISTINCT FROM OLD.valid_until
    OR NEW.include_tva   IS DISTINCT FROM OLD.include_tva
    OR NEW.client_id     IS DISTINCT FROM OLD.client_id
    OR NEW.has_material_deposit IS DISTINCT FROM OLD.has_material_deposit;

  -- 1. Contenu modifié alors que le devis est dans un statut engageant,
  --    ou sortie d'un statut engageant (ex. "envoyé" -> "brouillon") :
  --    on archive l'état AVANT modification.
  IF OLD.status = ANY(protected_statuses)
     AND (content_changed OR NOT (NEW.status = ANY(protected_statuses))) THEN
    PERFORM insert_quote_version(OLD, 'pre_modification');
  END IF;

  -- 2. Passage au statut "envoyé" : on archive la version transmise au client.
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM insert_quote_version(NEW, 'sent');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_archive_version ON quotes;
CREATE TRIGGER quotes_archive_version
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION archive_quote_version();
