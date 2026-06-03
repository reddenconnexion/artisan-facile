-- Quota de stockage par utilisateur + stats globales (surveillance).
-- Le projet Supabase partage un quota de Storage commun à TOUS les comptes ;
-- ces fonctions permettent d'afficher l'usage, d'alerter et de plafonner
-- l'espace par utilisateur à l'upload.

-- Plafond (octets) selon le plan. Modifiable ici.
CREATE OR REPLACE FUNCTION public.storage_cap_for_plan(p_plan text)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(p_plan,'free'))
    WHEN 'owner' THEN 1024::bigint * 1024 * 1024 * 1024   -- 1 To (≈ illimité)
    WHEN 'pro'   THEN 2::bigint * 1024 * 1024 * 1024        -- 2 Go
    ELSE 250::bigint * 1024 * 1024                          -- 250 Mo (free)
  END;
$$;

-- Statut quota du caller : usage, plafond, et si l'ajout de p_add octets reste autorisé.
CREATE OR REPLACE FUNCTION public.storage_quota_status(p_add bigint DEFAULT 0)
RETURNS TABLE(used_bytes bigint, cap_bytes bigint, plan text, allowed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan text;
  v_used bigint;
  v_cap bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT coalesce(p.plan,'free') INTO v_plan FROM public.profiles p WHERE p.id = v_uid;
  v_plan := coalesce(v_plan,'free');
  SELECT coalesce(sum((o.metadata->>'size')::bigint),0) INTO v_used
    FROM storage.objects o WHERE o.owner = v_uid;
  v_cap := public.storage_cap_for_plan(v_plan);
  RETURN QUERY SELECT v_used, v_cap, v_plan, (v_used + greatest(coalesce(p_add,0),0)) <= v_cap;
END;
$$;

-- Stats globales du projet (tous comptes confondus) — réservé au plan 'owner'.
CREATE OR REPLACE FUNCTION public.global_storage_stats()
RETURNS TABLE(total_bytes bigint, file_count bigint, quota_bytes bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND lower(coalesce(p.plan,'')) = 'owner') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT coalesce(sum((o.metadata->>'size')::bigint),0)::bigint,
           count(*)::bigint,
           (1024::bigint*1024*1024)  -- 1 Go (offre gratuite Supabase)
    FROM storage.objects o;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.storage_cap_for_plan(text) FROM public;
GRANT EXECUTE ON FUNCTION public.storage_quota_status(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.global_storage_stats() TO authenticated;
