-- ──────────────────────────────────────────────────────────────────────────────
-- Fiabiliser le compteur d'ouverture des emails en filtrant les ouvertures
-- AUTOMATIQUES (non humaines).
--
-- Problème constaté : le pixel de tracking est déclenché par de nombreux agents
-- automatiques qui chargent les images du mail sans intervention du
-- destinataire :
--   • proxy d'images Gmail            → "...GoogleImageProxy" / "ggpht.com"
--   • passerelles de sécurité         → Proofpoint, Mimecast, Barracuda, IronPort…
--     (elles scannent le mail à la livraison, donc juste après l'envoi)
--   • bots de prévisualisation de lien → Outlook SafeLinks ("Edge/12.246"),
--     facebookexternalhit, Slackbot, etc.
-- Résultat : le compteur "Ouvert X fois" remontait 5 ouvertures alors qu'une
-- seule provenait réellement du client.
--
-- Solution : on marque chaque ouverture comme `is_bot` et la vue de stats ne
-- compte plus que les ouvertures humaines. L'edge function `track-email-open`
-- applique la même logique (User-Agent + fenêtre de prefetch) à l'insertion.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE email_opens
    ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

-- Détection par User-Agent (réutilisée par le backfill ci-dessous ; l'edge
-- function ajoute en plus une fenêtre temporelle au moment de l'insertion).
CREATE OR REPLACE FUNCTION email_open_ua_is_bot(ua TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ua IS NULL
        OR btrim(ua) = ''
        OR ua ~* '(googleimageproxy|ggpht\.com|yahoo(mail)?proxy|mailproxy|bingpreview|facebookexternalhit|facebot|slackbot|slack-imgproxy|twitterbot|discordbot|telegrambot|whatsapp|linkedinbot|skypeuripreview|microsoft office|msoffice|microsoft-webdav|office365|proofpoint|mimecast|barracuda|ironport|forcepoint|fireeye|trustwave|cloudmark|messagelabs|symantec|crawler|spider|\ybot\y|bot/|curl/|wget|python-requests|go-http-client|java/|okhttp|node-fetch|axios|headlesschrome|phantomjs|edge/12\.246)';
$$;

-- Backfill (1) : ouvertures dont le User-Agent trahit un agent automatique.
UPDATE email_opens
SET is_bot = true
WHERE NOT is_bot
  AND email_open_ua_is_bot(user_agent);

-- Backfill (2) : ouvertures survenues dans les 10 s suivant l'envoi → prefetch
-- d'une passerelle de sécurité qui scanne le mail dès la livraison.
UPDATE email_opens o
SET is_bot = true
FROM email_sends s
WHERE o.email_send_id = s.id
  AND NOT o.is_bot
  AND o.opened_at <= s.sent_at + interval '10 seconds';

CREATE INDEX IF NOT EXISTS idx_email_opens_genuine
    ON email_opens(email_send_id) WHERE NOT is_bot;

-- Recréer la vue : `open_count` ne compte plus que les ouvertures humaines.
-- On expose aussi `bot_open_count` / `total_open_count` pour la transparence.
DROP VIEW IF EXISTS email_send_stats;
CREATE VIEW email_send_stats AS
SELECT
    s.id                    AS email_send_id,
    s.user_id,
    s.quote_id,
    s.client_id,
    s.recipient_email,
    s.subject,
    s.sent_at,
    s.tracking_token,
    (SELECT count(*) FROM email_opens o WHERE o.email_send_id = s.id AND NOT o.is_bot)         AS open_count,
    (SELECT count(*) FROM email_opens o WHERE o.email_send_id = s.id AND o.is_bot)             AS bot_open_count,
    (SELECT count(*) FROM email_opens o WHERE o.email_send_id = s.id)                          AS total_open_count,
    (SELECT min(o.opened_at) FROM email_opens o WHERE o.email_send_id = s.id AND NOT o.is_bot) AS first_opened_at,
    (SELECT max(o.opened_at) FROM email_opens o WHERE o.email_send_id = s.id AND NOT o.is_bot) AS last_opened_at
FROM email_sends s;

-- La vue hérite de la RLS de email_sends via security_invoker (PG 15+).
ALTER VIEW email_send_stats SET (security_invoker = true);

GRANT SELECT ON email_send_stats TO authenticated;
