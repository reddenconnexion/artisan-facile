-- ──────────────────────────────────────────────────────────────────────────────
-- Porter la validité du lien public de 30 à 90 jours
--
-- Un lien de signature vivait 30 jours, puis se fermait ; sept jours plus tard
-- le ménage nocturne (`cleanup_expired_tokens`) le révoquait pour de bon. Sur
-- des chantiers où le client compare, consulte un tiers ou attend un accord de
-- financement, le lien mourait avant la décision — et 126 documents sur 253
-- avaient déjà été rattrapés par ce nettoyage.
--
-- Le défaut de la colonne sert aux devis dont le lien n'est pas mis en service
-- par un envoi (le jeton est créé avec la ligne). Le code applique la même
-- durée à chaque envoi, copie de lien ou réouverture — la constante partagée
-- vit dans src/constants/publicLink.js, et les deux doivent rester d'accord.
--
-- Les liens déjà émis ne sont pas rallongés : leur date d'expiration a été
-- calculée sous l'ancienne règle, et prolonger rétroactivement rouvrirait des
-- devis que l'artisan considère clos depuis des semaines. Renvoyer le document
-- ou recopier son lien lui rend 90 jours pleins.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.quotes
    ALTER COLUMN token_expires_at SET DEFAULT (now() + '90 days'::interval);

COMMENT ON COLUMN public.quotes.token_expires_at IS
    'Fin de validité du lien public. 90 jours par défaut, réappliqués à chaque envoi, copie du lien ou réouverture (cf. src/constants/publicLink.js). Passé ce délai le lien ne s''ouvre plus ; cleanup_expired_tokens le révoque 7 jours après.';
