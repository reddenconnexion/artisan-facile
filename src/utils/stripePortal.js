// Portail client Stripe (lien de connexion sans code, mode réel) : le client
// s'y connecte avec son e-mail. Sert de repli quand la session de portail
// (fonction stripe-portal, qui connecte directement le client) ne peut pas
// être créée, et de lien direct sur la page Abonnement.
export const STRIPE_PORTAL_LOGIN_URL = 'https://billing.stripe.com/p/login/dRm00j6TzdEq5OygfE5EY00';

/** Lien de connexion au portail, e-mail pré-rempli quand on le connaît. */
export const portalLoginUrl = (email) =>
    email
        ? `${STRIPE_PORTAL_LOGIN_URL}?prefilled_email=${encodeURIComponent(email)}`
        : STRIPE_PORTAL_LOGIN_URL;
