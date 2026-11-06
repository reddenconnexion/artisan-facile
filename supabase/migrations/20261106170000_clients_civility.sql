-- ──────────────────────────────────────────────────────────────────────────────
-- Civilité du client
--
-- Utilisée pour la salutation des mails : « Bonjour Mme Lafitte ».
-- NULL = aucune civilité choisie (« Bonjour Marie Lafitte »).
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS civility TEXT;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_civility_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_civility_check
  CHECK (civility IS NULL OR civility IN ('m', 'mme', 'm_et_mme'));
