-- ──────────────────────────────────────────────────────────────────────────────
-- Durcissement des fonctions « poste global » (suivi de 20260705120000)
--
-- Deux ajustements de sécurité relevés après application, sans changement de
-- comportement fonctionnel :
--
-- 1. get_client_facing_items est documentée « réservée aux utilisateurs
--    authentifiés » (aperçu / génération artisan). Le REVOKE ... FROM public de
--    la migration initiale ne suffit pas : les DEFAULT PRIVILEGES Supabase
--    accordent EXECUTE à `anon` explicitement à la création de la fonction. On
--    retire donc l'accès `anon` (service_role conservé pour le backend).
--
-- 2. Advisor `function_search_path_mutable` : on fige le search_path des trois
--    fonctions. Elles ne référencent que pg_catalog (built-ins, casts,
--    opérateurs — toujours résolus, même avec un search_path vide) et des
--    fonctions public.* déjà qualifiées.
-- ──────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.get_client_facing_items(jsonb, text) FROM anon;

ALTER FUNCTION public.build_poste_global_items(jsonb) SET search_path = '';
ALTER FUNCTION public.client_facing_items(jsonb, text) SET search_path = '';
ALTER FUNCTION public.get_client_facing_items(jsonb, text) SET search_path = '';
