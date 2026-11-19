-- ──────────────────────────────────────────────────────────────────────────────
-- Pilote automatique : demande d'avis sur plusieurs plateformes.
--
-- Fin de chantier : l'appli propose d'abord un avis Google ; à un client déjà
-- sollicité (ou qui a déjà laissé un avis Google), elle propose Facebook au
-- chantier suivant, puis PagesJaunes — selon les liens renseignés dans le
-- profil (google_review_url, facebook_review_url, pages_jaunes_review_url).
--
--   - clients.reviews_left : plateformes où le client a déjà laissé un avis
--     (cochées par l'artisan sur la fiche client) : 'google', 'facebook',
--     'pages_jaunes'.
--   - autopilot_actions.platform : plateforme proposée par une demande d'avis.
--     NULL pour les demandes envoyées avant ce choix (c'étaient des demandes
--     Google).
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS reviews_left text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.autopilot_actions ADD COLUMN IF NOT EXISTS platform text;
