-- ──────────────────────────────────────────────────────────────────────────────
-- Numérotation légale des factures (art. 242 nonies A, annexe II du CGI).
--
-- Jusqu'ici, factures et devis partageaient le même compteur (quote_number,
-- attribué à l'INSERT) : la série des factures avait des trous (devis non
-- convertis), ne suivait pas l'ordre d'émission (le devis converti gardait son
-- numéro d'origine), n'était pas protégée contre les doublons (MAX+1 sans
-- verrou ni contrainte UNIQUE), et une facture émise pouvait être supprimée.
--
-- Ce correctif introduit une série de factures dédiée, conforme :
--   - numéro FAC-<année>-<seq> attribué à l'ÉMISSION (premier passage d'une
--     facture hors statut brouillon), donc chronologique et continu ;
--   - compteur par utilisateur et par année, incrémenté par un UPSERT atomique
--     (verrou de ligne : deux émissions simultanées ne peuvent pas produire le
--     même numéro), doublé d'un index UNIQUE ;
--   - une facture émise est immuable : numéro figé, retour en devis interdit,
--     suppression interdite (il faut émettre un avoir) ;
--   - les documents externes (PDF importés, numérotés par un autre outil) et
--     les brouillons ne consomment pas de numéro.
--
-- quote_number reste la référence interne des devis (aucune exigence légale de
-- continuité pour les devis) ; les factures existantes sont reprises dans la
-- nouvelle série par ordre chronologique.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Colonne du numéro légal + unicité par utilisateur
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS invoice_number text;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_user_invoice_number_key
  ON quotes (user_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

-- 2. Compteur par utilisateur et par année.
-- Pas de policy RLS : la table n'est accessible qu'aux fonctions SECURITY
-- DEFINER ci-dessous, jamais directement au client.
CREATE TABLE IF NOT EXISTS invoice_counters (
  user_id     uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year        integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, year)
);

ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;

-- 3. Prochain numéro : UPSERT atomique — la ligne du compteur est verrouillée
-- le temps de la transaction, deux INSERT concurrents sont sérialisés.
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_user_id uuid, p_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  INSERT INTO invoice_counters (user_id, year, last_number)
  VALUES (p_user_id, p_year, 1)
  ON CONFLICT (user_id, year)
  DO UPDATE SET last_number = invoice_counters.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN format('FAC-%s-%s', p_year, lpad(next_num::text, 4, '0'));
END;
$$;

-- Seuls les triggers (via SECURITY DEFINER) attribuent des numéros : un client
-- ne doit pas pouvoir « brûler » des numéros en appelant la fonction.
REVOKE ALL ON FUNCTION get_next_invoice_number(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_next_invoice_number(uuid, integer) FROM anon, authenticated;

-- 4. Reprise de l'existant AVANT d'activer les triggers : les factures déjà
-- émises (hors brouillons et documents externes) sont numérotées par ordre
-- chronologique, par utilisateur et par année de leur date d'émission.
WITH numbered AS (
  SELECT id,
         EXTRACT(YEAR FROM date)::integer AS y,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, EXTRACT(YEAR FROM date)
           ORDER BY date, created_at, id
         ) AS rn
  FROM quotes
  WHERE type = 'invoice'
    AND COALESCE(is_external, false) = false
    AND COALESCE(status, 'draft') <> 'draft'
    AND invoice_number IS NULL
)
UPDATE quotes
SET invoice_number = format('FAC-%s-%s', numbered.y, lpad(numbered.rn::text, 4, '0'))
FROM numbered
WHERE quotes.id = numbered.id;

-- Initialiser les compteurs au maximum repris, pour que la série continue.
INSERT INTO invoice_counters (user_id, year, last_number)
SELECT user_id,
       split_part(invoice_number, '-', 2)::integer,
       MAX(split_part(invoice_number, '-', 3)::integer)
FROM quotes
WHERE invoice_number ~ '^FAC-[0-9]{4}-[0-9]+$'
GROUP BY user_id, split_part(invoice_number, '-', 2)::integer
ON CONFLICT (user_id, year)
DO UPDATE SET last_number = GREATEST(invoice_counters.last_number, EXCLUDED.last_number);

-- 5. Trigger d'émission : le numéro est attribué au premier passage d'une
-- facture hors brouillon, et devient ensuite immuable.
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
    IF NEW.type IS DISTINCT FROM 'invoice' THEN
      RAISE EXCEPTION 'La facture % a été émise : elle ne peut plus redevenir un devis. Émettez un avoir pour l''annuler.', OLD.invoice_number
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.type = 'invoice'
     AND NEW.invoice_number IS NULL
     AND COALESCE(NEW.is_external, false) = false
     AND COALESCE(NEW.status, 'draft') NOT IN ('draft', 'cancelled') THEN
    NEW.invoice_number := get_next_invoice_number(
      NEW.user_id,
      EXTRACT(YEAR FROM COALESCE(NEW.date, CURRENT_DATE))::integer
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_invoice_number ON quotes;
CREATE TRIGGER set_invoice_number
  BEFORE INSERT OR UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION assign_invoice_number();

-- 6. Une facture émise ne se supprime pas : rupture de séquence interdite.
CREATE OR REPLACE FUNCTION prevent_issued_invoice_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'La facture % a été émise : la réglementation interdit sa suppression. Émettez un avoir pour l''annuler.', OLD.invoice_number
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_issued_invoices ON quotes;
CREATE TRIGGER protect_issued_invoices
  BEFORE DELETE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION prevent_issued_invoice_delete();

-- 7. get_public_quote : exposer le numéro légal de facture au client final.
-- Définition reprise de 20260713140000, avec invoice_number (document + parent).
CREATE OR REPLACE FUNCTION public.get_public_quote(lookup_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result JSONB;
  v_quote_id BIGINT;
  v_user_id UUID;
BEGIN
  SELECT id, user_id INTO v_quote_id, v_user_id
  FROM quotes
  WHERE public_token = lookup_token
    AND (token_revoked IS NULL OR token_revoked = FALSE)
    AND (token_expires_at IS NULL OR token_expires_at > NOW());

  IF v_quote_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE quotes
  SET last_viewed_at = NOW()
  WHERE id = v_quote_id;

  INSERT INTO public.quote_views (quote_id, user_id, viewed_at)
  VALUES (v_quote_id, v_user_id, NOW());

  SELECT jsonb_build_object(
    'id', q.id,
    'quote_number', q.quote_number,
    'invoice_number', q.invoice_number,
    'date', q.date,
    'valid_until', q.valid_until,
    'updated_at', q.updated_at,
    'items', public.client_facing_items(q.items, q.client_display_mode),
    'total_ht', q.total_ht,
    'total_tva', q.total_tva,
    'total_ttc', q.total_ttc,
    'include_tva', q.include_tva,
    'notes', q.notes,
    'content_en', q.content_en,
    'status', q.status,
    'title', q.title,
    'type', q.type,
    'client_display_mode', q.client_display_mode,
    'is_external', q.is_external,
    'signature', q.signature,
    'signed_at', q.signed_at,
    'bon_pour_accord', q.bon_pour_accord,
    'original_pdf_url', q.original_pdf_url,
    'report_pdf_url', q.report_pdf_url,
    'has_material_deposit', q.has_material_deposit,
    'deposit_percentage', q.deposit_percentage,
    'intervention_address', q.intervention_address,
    'intervention_postal_code', q.intervention_postal_code,
    'intervention_city', q.intervention_city,
    'require_otp', q.require_otp,
    'amendment_details', q.amendment_details,
    'parent_id', q.parent_id,
    'parent_quote_id', q.parent_quote_id,
    'parent_quote_data', CASE WHEN pq.id IS NOT NULL THEN jsonb_build_object(
      'id', pq.id,
      'quote_number', pq.quote_number,
      'invoice_number', pq.invoice_number,
      'date', pq.date,
      'title', pq.title,
      'total_ht', pq.total_ht,
      'total_tva', pq.total_tva,
      'total_ttc', pq.total_ttc,
      -- Situations d'avancement uniquement (facturation par tranches).
      'progress_total', (
        SELECT COALESCE(SUM(total_ttc), 0)
        FROM quotes ci
        WHERE ci.parent_id = pq.id
          AND ci.type = 'invoice'
          AND ci.status != 'cancelled'
          AND COALESCE(ci.title, '') !~* 'cl[oô]ture'
          AND ( (ci.amendment_details -> 'situation') IS NOT NULL
                OR COALESCE(ci.title, '') ~* 'situation' )
      ),
      -- Acomptes déjà versés (tout le reste, hors clôture), à déduire du solde.
      'deposit_total', (
        SELECT COALESCE(SUM(total_ttc), 0)
        FROM quotes ci
        WHERE ci.parent_id = pq.id
          AND ci.type = 'invoice'
          AND ci.status != 'cancelled'
          AND COALESCE(ci.title, '') !~* 'cl[oô]ture'
          AND NOT ( (ci.amendment_details -> 'situation') IS NOT NULL
                    OR COALESCE(ci.title, '') ~* 'situation' )
      )
    ) ELSE NULL END,
    'client', jsonb_build_object(
      'name', c.name,
      'address', c.address,
      'email', c.email,
      'postal_code', c.postal_code,
      'city', c.city,
      'siren', c.siren,
      'tva_intracom', c.tva_intracom
    ),
    'artisan', jsonb_build_object(
      'id', p.id,
      'company_name', p.company_name,
      'full_name', p.full_name,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'phone', p.phone,
      'professional_email', p.professional_email,
      'email', p.professional_email,
      'siret', p.siret,
      'logo_url', p.logo_url,
      'website', p.website,
      'iban', p.iban,
      'wero_phone', p.wero_phone
    )
  ) INTO result
  FROM quotes q
  LEFT JOIN quotes pq ON q.parent_quote_id = pq.id
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN profiles p ON q.user_id = p.id
  WHERE q.id = v_quote_id;

  RETURN result;
END;
$function$;
