-- ──────────────────────────────────────────────────────────────────────────────
-- Commandes fournisseurs rattachées aux chantiers (marge réelle)
--
-- Une ligne d'achat (`supplier_purchases`, issue d'un mail de commande web ou
-- d'une facture fournisseur) est rapprochée de la ligne « à commander » du
-- devis qu'elle règle (`procurement_items`) : le prix payé devient le prix
-- d'achat réel, et la marge du chantier se calcule au plus juste.
--
-- Ces objets existaient déjà en production (créés hors dépôt). La migration
-- les versionne de façon rejouable, avec trois corrections :
--   1. le trigger ignore un `quote_id` / `procurement_item_id` qui
--      n'appartient pas à l'auteur de la ligne (sinon, SECURITY DEFINER, il
--      recopiait le titre et le client du devis d'un autre artisan) ;
--   2. les RPC de rattachement ne sont plus exécutables avec la clé anon ;
--   3. une nouvelle commande web ne se rapproche plus d'une ligne « à
--      commander » déjà réglée par un achat précédent (elle écrasait le prix
--      payé sur un chantier terminé quand on rachetait la même référence).
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Colonnes ────────────────────────────────────────────────────────────────
ALTER TABLE public.procurement_items ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.procurement_items ADD COLUMN IF NOT EXISTS buying_price_source TEXT;

ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS order_ref TEXT;

ALTER TABLE public.supplier_purchases ADD COLUMN IF NOT EXISTS quote_id BIGINT REFERENCES public.quotes(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_purchases ADD COLUMN IF NOT EXISTS procurement_item_id BIGINT REFERENCES public.procurement_items(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_purchases ADD COLUMN IF NOT EXISTS match_status TEXT NOT NULL DEFAULT 'unmatched';
ALTER TABLE public.supplier_purchases ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;
ALTER TABLE public.supplier_purchases ADD COLUMN IF NOT EXISTS unit_price_ttc NUMERIC;
ALTER TABLE public.supplier_purchases ADD COLUMN IF NOT EXISTS reference_norm TEXT;
ALTER TABLE public.supplier_purchases ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'invoice';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurement_items_buying_price_source_check') THEN
        ALTER TABLE public.procurement_items ADD CONSTRAINT procurement_items_buying_price_source_check
            CHECK (buying_price_source IN ('quote', 'manual', 'web_order', 'invoice'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_purchases_match_status_check') THEN
        ALTER TABLE public.supplier_purchases ADD CONSTRAINT supplier_purchases_match_status_check
            CHECK (match_status IN ('auto', 'manual', 'created', 'unmatched', 'ignored'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_purchases_origin_check') THEN
        ALTER TABLE public.supplier_purchases ADD CONSTRAINT supplier_purchases_origin_check
            CHECK (origin IN ('invoice', 'web_order'));
    END IF;
END $$;

ALTER TABLE public.supplier_invoices DROP CONSTRAINT IF EXISTS supplier_invoices_source_check;
ALTER TABLE public.supplier_invoices ADD CONSTRAINT supplier_invoices_source_check
    CHECK (source IN ('upload', 'manual', 'web_order'));

CREATE INDEX IF NOT EXISTS idx_procurement_items_reference ON public.procurement_items (user_id, reference);
CREATE INDEX IF NOT EXISTS idx_supplier_purchases_quote ON public.supplier_purchases (quote_id);
CREATE INDEX IF NOT EXISTS idx_supplier_purchases_match ON public.supplier_purchases (user_id, match_status);
-- Une commande ne s'importe qu'une fois (l'appli vérifie aussi avant d'écrire).
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoices_order_ref
    ON public.supplier_invoices (user_id, order_ref) WHERE order_ref IS NOT NULL;

-- ── Référence fabricant normalisée ──────────────────────────────────────────
-- Premier jeton du type « 406774 », « DNX406774 », débarrassé du préfixe
-- lettres. Miroir JS : src/utils/supplierOrder.js (extractReferenceNorm).
CREATE OR REPLACE FUNCTION public.extract_reference_norm(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
    tok TEXT;
BEGIN
    IF p_text IS NULL THEN RETURN NULL; END IF;
    FOR tok IN
        SELECT t FROM regexp_split_to_table(upper(p_text), '[^A-Z0-9]+') AS t
    LOOP
        IF tok ~ '^[A-Z]{0,4}[0-9]{4,}[A-Z0-9]*$' AND length(tok) >= 5 THEN
            IF tok ~ '^[0-9]+$' AND length(tok) < 5 THEN CONTINUE; END IF;
            RETURN regexp_replace(tok, '^[A-Z]+', '');
        END IF;
    END LOOP;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reference_key(p_reference text, p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT COALESCE(
        public.extract_reference_norm(p_reference),
        public.extract_reference_norm(p_label),
        NULLIF(regexp_replace(upper(COALESCE(p_reference, '')), '[^A-Z0-9]', '', 'g'), '')
    );
$function$;

-- ── Rapprochement automatique à l'insertion d'une ligne d'achat ─────────────
-- Prix réel écrit en TTC quand le devis est sans TVA (franchise), sinon HT.
-- Un prix de facture n'est jamais écrasé par un prix de commande.
CREATE OR REPLACE FUNCTION public.match_supplier_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_ref        TEXT;
    v_item       public.procurement_items%ROWTYPE;
    v_quote      public.quotes%ROWTYPE;
    v_cost       NUMERIC;
    v_parent_id  BIGINT;
    v_override   BOOLEAN;
BEGIN
    v_ref := public.reference_key(NEW.reference, NEW.product_name);
    NEW.reference_norm := v_ref;
    IF NEW.reference IS NULL AND v_ref IS NOT NULL THEN
        NEW.reference := v_ref;
    END IF;

    -- Le devis visé doit appartenir à l'auteur de la ligne.
    IF NEW.quote_id IS NOT NULL THEN
        SELECT * INTO v_quote FROM public.quotes WHERE id = NEW.quote_id AND user_id = NEW.user_id;
        IF NOT FOUND THEN
            NEW.quote_id := NULL;
        ELSIF v_quote.parent_quote_id IS NOT NULL THEN
            v_parent_id := v_quote.parent_quote_id;
            SELECT * INTO v_quote FROM public.quotes WHERE id = v_parent_id;
            NEW.quote_id := v_parent_id;
        END IF;
    END IF;

    IF NEW.procurement_item_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.procurement_items WHERE id = NEW.procurement_item_id AND user_id = NEW.user_id
    ) THEN
        NEW.procurement_item_id := NULL;
    END IF;

    IF NEW.match_status IN ('ignored', 'manual') THEN
        RETURN NEW;
    END IF;

    IF v_ref IS NOT NULL THEN
        SELECT p.* INTO v_item
          FROM public.procurement_items p
          LEFT JOIN public.quotes q ON q.id = p.quote_id
         WHERE p.user_id = NEW.user_id
           AND p.status <> 'cancelled'
           AND p.reference IS NOT NULL
           AND public.reference_key(p.reference, NULL) = v_ref
           AND (NEW.quote_id IS NULL OR p.quote_id = NEW.quote_id)
           AND (NEW.quote_id IS NOT NULL OR p.quote_id IS NULL OR q.status IN ('accepted', 'sent', 'billed'))
           -- Une ligne déjà réglée par un achat ne se rapproche plus d'une
           -- nouvelle commande (c'est un nouvel achat, pas le même) ; seule la
           -- facture peut encore remplacer le prix d'une commande web.
           AND NOT EXISTS (
                SELECT 1 FROM public.supplier_purchases sp
                 WHERE sp.procurement_item_id = p.id
                   AND sp.match_status IN ('auto', 'manual', 'created')
                   AND (NEW.origin = 'web_order' OR sp.origin = 'invoice'))
         ORDER BY (p.quote_id IS NOT NULL) DESC, p.created_at DESC
         LIMIT 1;
    END IF;

    IF v_item.id IS NOT NULL THEN
        IF v_quote.id IS NULL AND v_item.quote_id IS NOT NULL THEN
            SELECT * INTO v_quote FROM public.quotes WHERE id = v_item.quote_id;
        END IF;
        NEW.procurement_item_id := v_item.id;
        NEW.quote_id := COALESCE(NEW.quote_id, v_item.quote_id);
        NEW.match_status := 'auto';
        NEW.matched_at := now();

        v_cost := CASE WHEN v_quote.id IS NOT NULL AND v_quote.include_tva = FALSE
                       THEN COALESCE(NEW.unit_price_ttc, NEW.unit_price * 1.2)
                       ELSE NEW.unit_price END;
        v_override := (NEW.origin = 'invoice')
                      OR COALESCE(v_item.buying_price_source, 'quote') <> 'invoice';
        IF v_cost IS NOT NULL AND v_override THEN
            UPDATE public.procurement_items
               SET buying_price = ROUND(v_cost, 2),
                   buying_price_source = NEW.origin,
                   supplier = COALESCE(NEW.supplier_name, supplier),
                   reference = COALESCE(reference, NEW.reference),
                   status = CASE WHEN status = 'pending' THEN 'ordered' ELSE status END,
                   ordered_at = COALESCE(ordered_at, now())
             WHERE id = v_item.id;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.quote_id IS NOT NULL AND v_quote.id IS NOT NULL THEN
        v_cost := CASE WHEN v_quote.include_tva = FALSE
                       THEN COALESCE(NEW.unit_price_ttc, NEW.unit_price * 1.2)
                       ELSE NEW.unit_price END;
        INSERT INTO public.procurement_items
            (user_id, client_id, quote_id, site_label, description, reference,
             quantity, unit, category, status, ordered_at, source,
             buying_price, buying_price_source, supplier, notes)
        VALUES
            (NEW.user_id, v_quote.client_id, v_quote.id, v_quote.title,
             NEW.product_name, NEW.reference,
             COALESCE(NEW.quantity, 1), COALESCE(NEW.unit, 'u'), 'materiel',
             'ordered', COALESCE(NEW.purchase_date::timestamptz, now()), 'manual',
             ROUND(v_cost, 2), NEW.origin, NEW.supplier_name,
             CASE WHEN NEW.origin = 'web_order' THEN 'Créée depuis la commande web'
                  ELSE 'Créée depuis la facture fournisseur' END)
        RETURNING id INTO NEW.procurement_item_id;
        NEW.match_status := 'created';
        NEW.matched_at := now();
        RETURN NEW;
    END IF;

    NEW.match_status := 'unmatched';
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_match_supplier_purchase ON public.supplier_purchases;
CREATE TRIGGER trg_match_supplier_purchase
    BEFORE INSERT ON public.supplier_purchases
    FOR EACH ROW EXECUTE FUNCTION public.match_supplier_purchase();

-- ── Rattachement à la main (page Commandes, import d'une commande) ──────────
-- Relie une ligne d'achat à une ligne « à commander » existante.
CREATE OR REPLACE FUNCTION public.link_supplier_purchase(p_purchase_id bigint, p_item_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_p     public.supplier_purchases%ROWTYPE;
    v_item  public.procurement_items%ROWTYPE;
    v_quote public.quotes%ROWTYPE;
    v_cost  NUMERIC;
BEGIN
    SELECT * INTO v_p FROM public.supplier_purchases WHERE id = p_purchase_id AND user_id = auth.uid();
    SELECT * INTO v_item FROM public.procurement_items WHERE id = p_item_id AND user_id = auth.uid();
    IF v_p.id IS NULL OR v_item.id IS NULL THEN
        RAISE EXCEPTION 'Ligne introuvable';
    END IF;
    IF v_item.quote_id IS NOT NULL THEN
        SELECT * INTO v_quote FROM public.quotes WHERE id = v_item.quote_id;
    END IF;
    v_cost := CASE WHEN v_quote.id IS NOT NULL AND v_quote.include_tva = FALSE
                   THEN COALESCE(v_p.unit_price_ttc, v_p.unit_price * 1.2)
                   ELSE v_p.unit_price END;
    UPDATE public.supplier_purchases
       SET procurement_item_id = v_item.id,
           quote_id = COALESCE(v_item.quote_id, quote_id),
           match_status = 'manual',
           matched_at = now()
     WHERE id = v_p.id;
    UPDATE public.procurement_items
       SET buying_price = COALESCE(ROUND(v_cost, 2), buying_price),
           buying_price_source = v_p.origin,
           supplier = COALESCE(v_p.supplier_name, supplier),
           reference = COALESCE(reference, v_p.reference),
           status = CASE WHEN status = 'pending' THEN 'ordered' ELSE status END,
           ordered_at = COALESCE(ordered_at, now())
     WHERE id = v_item.id;
END;
$function$;

-- Classe une ligne d'achat hors chantier (stock, atelier, outillage).
CREATE OR REPLACE FUNCTION public.ignore_supplier_purchase(p_purchase_id bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    UPDATE public.supplier_purchases
       SET match_status = 'ignored', procurement_item_id = NULL, matched_at = now()
     WHERE id = p_purchase_id AND user_id = auth.uid();
$function$;

-- Impute une ligne d'achat à un chantier en créant sa ligne « à commander ».
CREATE OR REPLACE FUNCTION public.attach_supplier_purchase_to_quote(p_purchase_id bigint, p_quote_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_p     public.supplier_purchases%ROWTYPE;
    v_quote public.quotes%ROWTYPE;
    v_cost  NUMERIC;
    v_item  BIGINT;
BEGIN
    SELECT * INTO v_p FROM public.supplier_purchases WHERE id = p_purchase_id AND user_id = auth.uid();
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id AND user_id = auth.uid();
    IF v_p.id IS NULL OR v_quote.id IS NULL THEN
        RAISE EXCEPTION 'Ligne ou devis introuvable';
    END IF;
    IF v_quote.parent_quote_id IS NOT NULL THEN
        SELECT * INTO v_quote FROM public.quotes WHERE id = v_quote.parent_quote_id;
    END IF;
    v_cost := CASE WHEN v_quote.include_tva = FALSE
                   THEN COALESCE(v_p.unit_price_ttc, v_p.unit_price * 1.2)
                   ELSE v_p.unit_price END;
    INSERT INTO public.procurement_items
        (user_id, client_id, quote_id, site_label, description, reference,
         quantity, unit, category, status, ordered_at, source,
         buying_price, buying_price_source, supplier, notes)
    VALUES
        (v_p.user_id, v_quote.client_id, v_quote.id, v_quote.title,
         v_p.product_name, v_p.reference,
         COALESCE(v_p.quantity, 1), COALESCE(v_p.unit, 'u'), 'materiel',
         CASE WHEN v_p.origin = 'invoice' THEN 'received' ELSE 'ordered' END,
         COALESCE(v_p.purchase_date::timestamptz, now()), 'manual',
         ROUND(v_cost, 2), v_p.origin, v_p.supplier_name,
         'Rattachée à la main depuis la facture fournisseur')
    RETURNING id INTO v_item;
    UPDATE public.supplier_purchases
       SET procurement_item_id = v_item, quote_id = v_quote.id,
           match_status = 'manual', matched_at = now()
     WHERE id = v_p.id;
    RETURN v_item;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.link_supplier_purchase(bigint, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ignore_supplier_purchase(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.attach_supplier_purchase_to_quote(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_supplier_purchase(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ignore_supplier_purchase(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_supplier_purchase_to_quote(bigint, bigint) TO authenticated;

-- ── Marge matière prévue / réelle par chantier (devis racine) ───────────────
CREATE OR REPLACE VIEW public.quote_margins WITH (security_invoker = true) AS
WITH lines AS (
    SELECT q_1.id AS quote_id,
           it.value ->> 'type' AS type,
           COALESCE((it.value ->> 'quantity')::numeric, 0) AS qty,
           COALESCE((it.value ->> 'price')::numeric, 0) AS price,
           COALESCE((it.value ->> 'buying_price')::numeric, 0) AS buy
      FROM public.quotes q_1
     CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(q_1.items) = 'array' THEN q_1.items ELSE '[]'::jsonb END) it(value)
     WHERE COALESCE((it.value ->> 'is_optional')::boolean, false) = false
), sold AS (
    SELECT quote_id,
           sum(CASE WHEN type = 'material' THEN qty * price ELSE 0 END) AS material_sold,
           sum(CASE WHEN type = 'material' THEN qty * buy ELSE 0 END) AS material_planned_cost,
           sum(CASE WHEN type = 'service' THEN qty * price ELSE 0 END) AS labor_sold
      FROM lines
     GROUP BY quote_id
), bought AS (
    SELECT p.quote_id,
           sum(COALESCE(p.quantity, 1) * COALESCE(p.buying_price, 0)) AS material_real_cost,
           sum(CASE WHEN p.buying_price_source IN ('web_order', 'invoice', 'manual')
                    THEN COALESCE(p.quantity, 1) * COALESCE(p.buying_price, 0) ELSE 0 END) AS material_real_cost_confirmed,
           count(*) AS item_count,
           count(*) FILTER (WHERE p.buying_price_source IN ('web_order', 'invoice', 'manual')) AS item_real_count,
           count(*) FILTER (WHERE p.buying_price_source = 'invoice') AS item_invoiced_count
      FROM public.procurement_items p
     WHERE p.status <> 'cancelled' AND p.quote_id IS NOT NULL
     GROUP BY p.quote_id
), hours AS (
    SELECT quote_id, sum(COALESCE(hours_spent, 0)) AS hours_spent
      FROM public.task_tracking
     GROUP BY quote_id
)
SELECT q.id AS quote_id,
       q.user_id,
       q.client_id,
       q.client_name,
       q.title,
       q.status,
       q.date,
       q.total_ht,
       round(COALESCE(s.material_sold, 0), 2) AS material_sold,
       round(COALESCE(s.material_planned_cost, 0), 2) AS material_planned_cost,
       round(COALESCE(b.material_real_cost, 0), 2) AS material_real_cost,
       round(COALESCE(b.material_real_cost_confirmed, 0), 2) AS material_real_cost_confirmed,
       round(COALESCE(s.labor_sold, 0), 2) AS labor_sold,
       COALESCE(h.hours_spent, 0) AS hours_spent,
       round(COALESCE(s.material_sold, 0) - COALESCE(s.material_planned_cost, 0), 2) AS material_margin_planned,
       round(COALESCE(s.material_sold, 0) - COALESCE(b.material_real_cost, 0), 2) AS material_margin_real,
       round(COALESCE(b.material_real_cost, 0) - COALESCE(s.material_planned_cost, 0), 2) AS material_cost_delta,
       COALESCE(b.item_count, 0) AS item_count,
       COALESCE(b.item_real_count, 0) AS item_real_count,
       COALESCE(b.item_invoiced_count, 0) AS item_invoiced_count,
       b.quote_id IS NOT NULL AS has_real_costs
  FROM public.quotes q
  LEFT JOIN sold s ON s.quote_id = q.id
  LEFT JOIN bought b ON b.quote_id = q.id
  LEFT JOIN hours h ON h.quote_id = q.id
 WHERE q.type = 'quote' AND q.parent_quote_id IS NULL;
