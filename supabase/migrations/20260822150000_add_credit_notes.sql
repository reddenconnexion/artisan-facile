-- ──────────────────────────────────────────────────────────────────────────────
-- Avoirs (factures rectificatives) — suite de 20260822130000.
--
-- Une facture émise étant immuable (numéro figé, suppression interdite), son
-- annulation ou sa correction passe par un AVOIR : document de type
-- 'credit_note', à montants négatifs, rattaché à la facture d'origine via
-- parent_id, et soumis aux mêmes exigences de numérotation (art. 242 nonies A,
-- annexe II du CGI) dans une série dédiée AV-<année>-<seq> :
--   - numéro attribué à l'émission (premier passage hors brouillon) ;
--   - compteur par utilisateur/année, UPSERT atomique (pas de doublon) ;
--   - une fois émis, l'avoir est immuable : numéro figé, changement de type
--     interdit, suppression interdite (triggers partagés avec les factures).
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Autoriser le type 'credit_note'.
-- NOT VALID : la contrainte ne s'applique qu'aux nouvelles lignes, pour rester
-- rejouable même sur une base contenant d'anciennes valeurs hors liste.
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_type_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_type_check
  CHECK (type IN ('quote', 'invoice', 'amendment', 'credit_note')) NOT VALID;

-- 2. Compteur dédié aux avoirs (même mécanique que invoice_counters).
CREATE TABLE IF NOT EXISTS credit_note_counters (
  user_id     uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year        integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, year)
);

ALTER TABLE credit_note_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_next_credit_note_number(p_user_id uuid, p_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  INSERT INTO credit_note_counters (user_id, year, last_number)  -- verrou de ligne
  VALUES (p_user_id, p_year, 1)
  ON CONFLICT (user_id, year)
  DO UPDATE SET last_number = credit_note_counters.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN format('AV-%s-%s', p_year, lpad(next_num::text, 4, '0'));
END;
$$;

REVOKE ALL ON FUNCTION get_next_credit_note_number(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_next_credit_note_number(uuid, integer) FROM anon, authenticated;

-- 3. Étendre le trigger d'émission : l'avoir reçoit un numéro AV- au premier
-- passage hors brouillon, et le numéro (invoice_number) reste stocké dans la
-- même colonne — l'index UNIQUE et le trigger anti-suppression s'appliquent
-- donc aux avoirs sans autre changement. Le message de gel du type devient
-- générique (facture OU avoir : un document émis ne change plus de type).
CREATE OR REPLACE FUNCTION assign_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.invoice_number IS NOT NULL THEN
    -- Numéro figé : on ignore toute tentative de modification ou d'effacement.
    NEW.invoice_number := OLD.invoice_number;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      RAISE EXCEPTION 'Le document % a été émis : son type ne peut plus changer. Émettez un avoir pour l''annuler.', OLD.invoice_number
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.invoice_number IS NULL
     AND COALESCE(NEW.is_external, false) = false
     AND COALESCE(NEW.status, 'draft') NOT IN ('draft', 'cancelled') THEN
    IF NEW.type = 'invoice' THEN
      NEW.invoice_number := get_next_invoice_number(
        NEW.user_id,
        EXTRACT(YEAR FROM COALESCE(NEW.date, CURRENT_DATE))::integer
      );
    ELSIF NEW.type = 'credit_note' THEN
      NEW.invoice_number := get_next_credit_note_number(
        NEW.user_id,
        EXTRACT(YEAR FROM COALESCE(NEW.date, CURRENT_DATE))::integer
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Un avoir ne se signe pas : la RPC publique de signature ne filtre que par
-- statut ('billed' passerait), ce trigger ferme le trou côté base quel que
-- soit le chemin d'appel.
CREATE OR REPLACE FUNCTION prevent_credit_note_signature()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'credit_note'
     AND NEW.signature IS NOT NULL
     AND NEW.signature IS DISTINCT FROM OLD.signature THEN
    RAISE EXCEPTION 'Un avoir ne peut pas être signé.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS no_credit_note_signature ON quotes;
CREATE TRIGGER no_credit_note_signature
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION prevent_credit_note_signature();
