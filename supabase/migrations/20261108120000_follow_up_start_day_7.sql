-- ──────────────────────────────────────────────────────────────────────────────
-- Relances de devis : première relance à J+7 (et non J+3, trop tôt pour un
-- client qui compare des devis), séquence complète en 4 étapes.
--
-- La colonne avait gardé le défaut de la première version (2 étapes, J+3 puis
-- J+10) : presque tous les comptes l'avaient sans l'avoir choisi, et le
-- pilote automatique n'aurait fait que deux relances. On aligne :
--   - le défaut de la colonne sur la séquence de l'appli
--     (DEFAULT_FOLLOW_UP_STEPS, supabase/functions/_shared/lib/autopilot.js) ;
--   - les comptes restés sur l'ancien défaut de la colonne ;
--   - les comptes restés sur l'ancien défaut de l'appli (4 étapes, J+3).
-- Une séquence personnalisée par l'artisan n'est pas touchée.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ALTER COLUMN follow_up_settings SET DEFAULT '{"steps": [
  {"delay": 7, "label": "Première relance", "context": "Vérifier que le devis a bien été reçu et proposer de répondre à toute question immédiate."},
  {"delay": 7, "label": "Deuxième relance", "context": "Apporter de la valeur : partager un cas client similaire, une précision technique ou un comparatif pour aider à la décision."},
  {"delay": 7, "label": "Troisième relance", "context": "Proposer un appel téléphonique ou un contact via un autre canal (LinkedIn) pour lever les derniers freins."},
  {"delay": 13, "label": "Message de clôture", "context": "Informer que le devis va être archivé sous peu et proposer un recontact futur si le projet se concrétise."}
]}'::jsonb;

-- Ancien défaut de la colonne, jamais modifié.
UPDATE public.profiles
SET follow_up_settings = DEFAULT
WHERE follow_up_settings = '{"steps": [{"delay": 3, "label": "Relance douce"}, {"delay": 7, "label": "Relance standard"}]}'::jsonb;

-- Ancien défaut de l'appli : seule la première étape change (3 → 7 jours).
UPDATE public.profiles
SET follow_up_settings = jsonb_set(follow_up_settings, '{steps,0,delay}', '7'::jsonb)
WHERE follow_up_settings->'steps'->0->>'label' = 'Première relance'
  AND follow_up_settings->'steps'->0->>'delay' = '3'
  AND jsonb_array_length(follow_up_settings->'steps') = 4
  AND follow_up_settings->'steps'->3->>'label' = 'Message de clôture';
