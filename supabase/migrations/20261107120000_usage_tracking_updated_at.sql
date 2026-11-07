-- ──────────────────────────────────────────────────────────────────────────────
-- Compteur d'utilisation mensuel : la colonne `updated_at` manquait en prod.
--
-- La table `usage_tracking` a été créée sans `updated_at` (le CREATE TABLE IF
-- NOT EXISTS de 20260312110000 n'a rien fait sur une table déjà présente),
-- alors que `increment_ai_generation_usage` et `increment_voice_memo_usage`
-- l'écrivent. Chaque appel échouait (42703) — erreur ignorée par ai-proxy et
-- voice-transcribe — et la table restait vide : les quotas du plan gratuit
-- (5 générations IA, 10 mémos vocaux par mois) ne s'appliquaient jamais.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.usage_tracking
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
