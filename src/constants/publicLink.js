// ── Durée de validité du lien public d'un devis ──────────────────────────────
//
// Le lien de signature envoyé au client porte une date d'expiration : passée
// cette date, `get_public_quote` ne l'ouvre plus, et sept jours plus tard le
// ménage nocturne (`cleanup_expired_tokens`) le révoque définitivement.
//
// La durée était écrite en clair à trois endroits du formulaire (envoi, copie
// du lien, réouverture d'une signature suspendue), plus une quatrième fois
// comme défaut de la colonne `quotes.token_expires_at` en base. La changer
// demandait de n'en oublier aucun — d'où cette constante, et la migration
// 20260902120000 qui aligne le défaut SQL. Les deux doivent rester d'accord :
// le défaut sert aux devis créés sans passer par un envoi.
export const PUBLIC_LINK_VALIDITY_DAYS = 90;

/** Date d'expiration d'un lien mis en service maintenant, au format ISO. */
export const publicLinkExpiry = () =>
    new Date(Date.now() + PUBLIC_LINK_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();

/** « 90 jours » — pour les messages adressés à l'artisan. */
export const publicLinkValidityLabel = () => `${PUBLIC_LINK_VALIDITY_DAYS} jours`;
