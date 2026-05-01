-- Trigger qui propage automatiquement le changement de nom d'un client
-- sur tous ses devis (colonne dénormalisée client_name).

CREATE OR REPLACE FUNCTION sync_client_name_to_quotes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.quotes
    SET client_name = NEW.name
    WHERE client_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_name ON public.clients;

CREATE TRIGGER trg_sync_client_name
AFTER UPDATE OF name ON public.clients
FOR EACH ROW
EXECUTE FUNCTION sync_client_name_to_quotes();
