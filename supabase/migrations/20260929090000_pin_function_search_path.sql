-- Fige le search_path des fonctions signalées par l'advisor Supabase
-- « function_search_path_mutable ». Sans search_path fixé, une fonction
-- (surtout SECURITY DEFINER : get_public_quote, handle_new_user,
-- assign_quote_number…) résout ses tables selon le search_path de
-- l'appelant, ce qui ouvre la porte à un détournement d'objets.
--
-- `public, extensions` reproduit le chemin par défaut de Supabase
-- ("$user", public, extensions) : aucun changement de comportement.
-- Les fonctions absentes (environnement partiel) sont ignorées.

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.update_updated_at_column()',
    'public.update_supplier_invoices_updated_at()',
    'public.cleanup_expired_tokens()',
    'public.assign_quote_number()',
    'public.get_next_quote_number(uuid)',
    'public.storage_cap_for_plan(text)',
    'public.extract_reference_norm(text)',
    'public.reference_key(text, text)',
    'public.sync_client_name_to_quotes()',
    'public.handle_new_user()',
    'public.email_open_ua_is_bot(text)',
    'public.strip_internal_item_fields(jsonb)',
    'public.archive_quote_version()',
    'public.insert_quote_version(public.quotes, text)',
    'public.get_public_quote(uuid)'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', fn);
    END IF;
  END LOOP;
END;
$$;
