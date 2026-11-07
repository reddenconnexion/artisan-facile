-- ──────────────────────────────────────────────────────────────────────────────
-- Projet reporté : `quotes.relance_postponed`.
--
-- Sur un gros projet, le client annonce souvent dès la visite que les travaux
-- se feront dans plusieurs mois. L'artisan reporte alors les relances à une
-- date de reprise (`relance_snoozed_until`, déjà utilisée pour les reports de
-- quelques jours) en marquant le devis « projet reporté ». À la date venue, le
-- pilote automatique envoie un mail de reprise (« comme convenu, je reviens
-- vers vous… ») au lieu d'une relance classique, même si le devis a dépassé
-- sa date de validité ou les 60 jours au-delà desquels il n'est plus relancé.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS relance_postponed boolean NOT NULL DEFAULT false;
