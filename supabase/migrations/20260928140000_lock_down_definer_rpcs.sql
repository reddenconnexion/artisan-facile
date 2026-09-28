-- ──────────────────────────────────────────────────────────────────────────────
-- Fonctions SECURITY DEFINER appelables par n'importe qui via /rest/v1/rpc
--
-- Postgres accorde EXECUTE à PUBLIC par défaut : chacune de ces fonctions était
-- donc appelable avec la seule clé anon (publique), en contournant la RLS
-- puisqu'elle s'exécute avec les droits de son propriétaire.
--
-- 1. `insert_quote_version(p_row quotes, p_reason)` : helper du trigger
--    d'archivage. Appelée directement, elle insère une « version » arbitraire
--    (user_id, quote_id, snapshot choisis par l'appelant) dans l'historique de
--    n'importe quel devis — falsification de la trace qui prouve ce qui a été
--    envoyé au client. Seul le trigger `archive_quote_version` (lui-même
--    SECURITY DEFINER, donc exécuté en tant que propriétaire) doit l'appeler.
--
-- 2. `get_next_quote_number(p_user_id)` : helper du trigger de numérotation.
--    Appelée directement, elle révèle le nombre de devis de n'importe quel
--    artisan. Même raisonnement : seul `assign_quote_number` l'appelle.
--
-- 3. `cleanup_expired_tokens()` : ménage nocturne lancé par pg_cron (en tant
--    que propriétaire). Aucune raison qu'un visiteur puisse le déclencher.
--
-- 4. `increment_ai_generation_usage` / `increment_voice_memo_usage` : le
--    compteur visé était pris dans les paramètres sans vérification. N'importe
--    qui pouvait gonfler le compteur mensuel d'un autre artisan et épuiser son
--    quota d'IA ou de mémos vocaux. Tous les appelants légitimes (ai-proxy,
--    voice-transcribe) passent l'utilisateur authentifié : on l'exige.
--
-- Les fonctions déclenchées uniquement par trigger (RETURNS trigger) ne sont
-- pas concernées : Postgres refuse de les exécuter hors contexte de trigger.
-- ──────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.insert_quote_version(public.quotes, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_next_quote_number(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_tokens() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_ai_generation_usage(p_user_id uuid, p_month text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO usage_tracking (user_id, month, ai_generations_count, updated_at)
  VALUES (p_user_id, p_month, 1, NOW())
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    ai_generations_count = usage_tracking.ai_generations_count + 1,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_voice_memo_usage(p_user_id uuid, p_month text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO usage_tracking (user_id, month, voice_memos_count, updated_at)
  VALUES (p_user_id, p_month, 1, NOW())
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    voice_memos_count = usage_tracking.voice_memos_count + 1,
    updated_at = NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_ai_generation_usage(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_voice_memo_usage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_ai_generation_usage(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_voice_memo_usage(uuid, text) TO authenticated;
