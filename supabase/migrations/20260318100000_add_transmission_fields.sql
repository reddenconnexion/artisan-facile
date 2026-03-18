-- Migration: Ajout des champs de transmission e-facture (PDP/PPF)
-- Contexte : Réforme facturation électronique obligatoire (EN 16931 / Factur-X)
-- Applicable : B2B à partir de sept. 2026 (grandes entreprises/ETI)
--              et sept. 2027 (PME/micro-entreprises)

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS transmission_status  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transmission_service TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transmission_ref      TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transmitted_at        TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transmission_error    TEXT    DEFAULT NULL;

-- Valeurs autorisées pour transmission_status
-- 'pending'      : prête à transmettre, pas encore envoyée
-- 'sending'      : envoi en cours
-- 'sent'         : reçue par la PDP/PPF, en attente d'accusé
-- 'acknowledged' : accusée de réception par la PDP/PPF
-- 'rejected'     : rejetée (erreur de format ou données manquantes)
-- NULL           : pas encore marquée pour transmission

COMMENT ON COLUMN quotes.transmission_status  IS 'Statut de transmission e-facture: pending|sending|sent|acknowledged|rejected';
COMMENT ON COLUMN quotes.transmission_service IS 'Plateforme utilisée: ppf|pdp_<nom>';
COMMENT ON COLUMN quotes.transmission_ref     IS 'Référence externe retournée par la PDP/PPF';
COMMENT ON COLUMN quotes.transmitted_at       IS 'Horodatage de la transmission';
COMMENT ON COLUMN quotes.transmission_error   IS 'Message d''erreur si statut = rejected';

-- Index pour filtrer les factures par statut de transmission
CREATE INDEX IF NOT EXISTS idx_quotes_transmission_status
  ON quotes (user_id, transmission_status)
  WHERE type = 'invoice';
