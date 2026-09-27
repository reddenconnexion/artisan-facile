-- La vérification OTP à la signature d'un devis public était optionnelle,
-- désactivée par défaut (`require_otp` ajoutée à FALSE dans
-- 20260317100000) : sans action explicite de l'artisan, un lien de devis
-- public se signe sans aucun second facteur, même quand le client a un
-- email en base. Un lien transféré, capturé en photo ou laissé sur un
-- poste partagé pouvait donc être signé par n'importe qui.
--
-- Plutôt qu'un défaut systématique (qui ajoute de la friction même sur un
-- petit devis à un client de confiance), le seuil retenu est celui déjà
-- utilisé par l'app pour recommander l'OTP à l'artisan : 3000 €. Côté
-- application (DevisForm), un nouveau devis active l'OTP par défaut dès que
-- son montant atteint ce seuil, tant que l'artisan n'a pas lui-même tranché ;
-- cette migration ne fait que rattraper les devis déjà en base.
--
-- `sign_public_quote` ne vérifie l'OTP que si le client a un email : ce
-- changement n'a aucun effet sur les devis sans email client.

-- Bascule des devis déjà en base, pas encore signés (donc encore signables
-- via leur lien public) et dont le montant atteint le seuil, mais dont
-- l'OTP n'a jamais été activé.
UPDATE public.quotes
SET require_otp = TRUE
WHERE require_otp = FALSE
  AND signed_at IS NULL
  AND total_ttc >= 3000;
