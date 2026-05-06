-- ──────────────────────────────────────────────────────────────────────────────
-- Audit log des actions sensibles
--
-- Capture automatiquement (via triggers PostgreSQL) les événements clés
-- sur les devis, factures et clients. Utile pour :
--   - Traçabilité légale (qui a signé quoi, quand, à quel montant ?)
--   - Diagnostic en cas de litige client
--   - Récupération d'information après suppression (snapshot conservé)
--   - Détection d'activité anormale (ex: 50 devis supprimés en 5 minutes)
--
-- Événements capturés :
--   quote.created            : création d'un devis
--   quote.deleted            : suppression d'un devis
--   quote.signed             : signature client (signed_at passe de NULL → valeur)
--   quote.status_changed     : changement de statut (draft → sent, sent → accepted...)
--   quote.amount_changed     : modification du montant TTC sur un devis déjà envoyé/signé
--   invoice.created          : création d'une facture
--   invoice.paid             : facture marquée comme payée
--   invoice.deleted          : suppression d'une facture
--   client.deleted           : suppression d'un client
--
-- Sécurité : table en RLS, l'artisan ne peut QUE lire ses propres logs.
-- Les écritures sont faites par les triggers en SECURITY DEFINER (pas d'INSERT
-- direct possible côté client → impossible de fabriquer ou de masquer un événement).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action        TEXT  NOT NULL,
    entity_type   TEXT  NOT NULL,
    entity_id     BIGINT,
    entity_label  TEXT,                                   -- snapshot du nom/titre (utile après suppression)
    details       JSONB NOT NULL DEFAULT '{}'::jsonb,     -- { from, to, total_ttc, ... }
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx       ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx       ON audit_logs(action);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- L'artisan voit uniquement ses propres logs
CREATE POLICY "select_own_audit_logs" ON audit_logs
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- AUCUNE policy pour INSERT/UPDATE/DELETE côté authenticated :
-- les triggers SECURITY DEFINER ci-dessous sont les seuls écrivains.

-- ──────────────────────────────────────────────────────────────────────────────
-- Trigger sur la table `quotes`
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_quote_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_label   TEXT;
    v_action  TEXT;
    v_details JSONB := '{}'::jsonb;
    v_type    TEXT;
BEGIN
    v_type  := COALESCE(NEW.type, OLD.type, 'quote');
    v_label := COALESCE(NEW.title, OLD.title, NEW.client_name, OLD.client_name, 'Document');

    IF TG_OP = 'INSERT' THEN
        v_action := CASE v_type WHEN 'invoice' THEN 'invoice.created' ELSE 'quote.created' END;
        v_details := jsonb_build_object(
            'status',    NEW.status,
            'total_ttc', NEW.total_ttc,
            'client_id', NEW.client_id
        );

    ELSIF TG_OP = 'DELETE' THEN
        v_action := CASE v_type WHEN 'invoice' THEN 'invoice.deleted' ELSE 'quote.deleted' END;
        v_details := jsonb_build_object(
            'status',     OLD.status,
            'total_ttc',  OLD.total_ttc,
            'client_id',  OLD.client_id,
            'client_name', OLD.client_name
        );

    ELSIF TG_OP = 'UPDATE' THEN
        -- Priorité 1 : signature client (le plus important légalement)
        IF NEW.signed_at IS NOT NULL AND OLD.signed_at IS NULL THEN
            v_action := 'quote.signed';
            v_details := jsonb_build_object(
                'signed_at',       NEW.signed_at,
                'total_ttc',       NEW.total_ttc,
                'bon_pour_accord', NEW.bon_pour_accord
            );

        -- Priorité 2 : facture marquée payée
        ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
            v_action := 'invoice.paid';
            v_details := jsonb_build_object(
                'paid_at',        NEW.paid_at,
                'payment_method', NEW.payment_method,
                'total_ttc',      NEW.total_ttc
            );

        -- Priorité 3 : changement de statut quelconque
        ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
            v_action := 'quote.status_changed';
            v_details := jsonb_build_object(
                'from',      OLD.status,
                'to',        NEW.status,
                'total_ttc', NEW.total_ttc
            );

        -- Priorité 4 : modification du montant sur un document déjà sorti (sent, accepted, billed)
        ELSIF NEW.total_ttc IS DISTINCT FROM OLD.total_ttc
              AND OLD.status IN ('sent', 'accepted', 'billed', 'paid') THEN
            v_action := 'quote.amount_changed';
            v_details := jsonb_build_object(
                'from_ttc',  OLD.total_ttc,
                'to_ttc',    NEW.total_ttc,
                'status',    NEW.status,
                'delta_pct', CASE WHEN OLD.total_ttc > 0
                                  THEN ROUND(((NEW.total_ttc - OLD.total_ttc) / OLD.total_ttc * 100)::NUMERIC, 1)
                                  ELSE NULL
                             END
            );

        ELSE
            -- Aucun événement intéressant (ex: simple updated_at, last_viewed_at, etc.)
            RETURN NEW;
        END IF;
    END IF;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, entity_label, details)
    VALUES (
        COALESCE(NEW.user_id, OLD.user_id),
        v_action,
        CASE v_type WHEN 'invoice' THEN 'invoice' ELSE 'quote' END,
        COALESCE(NEW.id, OLD.id),
        v_label,
        v_details
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS quotes_audit_log ON quotes;
CREATE TRIGGER quotes_audit_log
    AFTER INSERT OR UPDATE OR DELETE ON quotes
    FOR EACH ROW EXECUTE FUNCTION log_quote_changes();

-- ──────────────────────────────────────────────────────────────────────────────
-- Trigger sur la table `clients`
-- (uniquement DELETE — la création/édition est moins critique et générerait
--  trop de bruit dans le journal)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_client_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, entity_label, details)
    VALUES (
        OLD.user_id,
        'client.deleted',
        'client',
        OLD.id,
        OLD.name,
        jsonb_build_object(
            'email', OLD.email,
            'phone', OLD.phone,
            'city',  OLD.city
        )
    );
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS clients_audit_log ON clients;
CREATE TRIGGER clients_audit_log
    AFTER DELETE ON clients
    FOR EACH ROW EXECUTE FUNCTION log_client_deletion();
