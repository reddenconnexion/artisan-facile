-- ──────────────────────────────────────────────────────────────────────────────
-- Pilote automatique : relances « après vérification ».
--
-- Réglage profiles.autopilot_settings.relances_mode :
--   'auto'       (défaut) les relances de devis et rappels de factures partent seuls ;
--   'validation' ils attendent que l'artisan les valide dans l'écran Pilote.
--
-- autopilot_drafts.approved : feu vert donné par l'artisan à un mail prévu
-- (même clé que le journal, ex. « quote_followup:123:2 »). L'Edge Function
-- autopilot-run n'envoie une relance en mode 'validation' que si approved.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.autopilot_drafts ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;
