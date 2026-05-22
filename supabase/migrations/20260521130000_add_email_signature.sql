-- Ajout du champ `email_signature_html` sur profiles pour permettre à
-- l'artisan de personnaliser la signature HTML insérée en fin de chaque
-- email envoyé via SMTP direct.
--
-- Si la valeur est NULL/vide, l'edge function `send-document-email`
-- génère automatiquement une signature à partir des autres champs du
-- profil (logo, nom, téléphone, email, site web, liens avis).

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS email_signature_html TEXT;
