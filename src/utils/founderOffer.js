// Offre « Membre fondateur » de l'abonnement Pro.
// Miroir de supabase/functions/_shared/pricing.ts (montants en centimes) :
// un test vérifie que les deux restent identiques.
import { formatDate } from './format';

export const FOUNDER_SPOTS = 50;
export const TRIAL_DAYS = 30;

export const PRO_PRICES = {
    standard: { month: 1499, year: 14990 },
    founder: { month: 990, year: 9900 },
};

// Coordonnées affichées aux membres fondateurs pour réserver la visio de 30 min
// (appel, SMS ou e-mail ; affichées en clair si l'appareil n'ouvre pas le lien).
export const FOUNDER_CONTACT_EMAIL = 'rotvener97@gmail.com';
export const FOUNDER_CONTACT_PHONE = '06 95 10 08 23';
const FOUNDER_CONTACT_PHONE_E164 = '+33695100823';

/** « 9,90 € », « 99 € », « 149,90 € » (centimes → euros, sans ,00 superflu). */
export const formatEuros = (cents) => {
    const euros = cents / 100;
    const opts = Number.isInteger(euros)
        ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return `${euros.toLocaleString('fr-FR', opts)} €`;
};

/**
 * Prix proposé selon les places restantes et la périodicité.
 * @param {number|null|undefined} spotsLeft  RPC founder_spots_left (null = inconnu)
 * @param {'month'|'year'} interval
 * @param {{ alreadyFounder?: boolean }} [opts]
 */
export const proOffer = (spotsLeft, interval = 'month', { alreadyFounder = false } = {}) => {
    const founder = alreadyFounder || (spotsLeft ?? 0) > 0;
    const cents = PRO_PRICES[founder ? 'founder' : 'standard'][interval];
    const standardCents = PRO_PRICES.standard[interval];
    const per = interval === 'year' ? '/an' : '/mois';
    return {
        founder,
        cents,
        standardCents,
        priceLabel: `${formatEuros(cents)}${per}`,
        standardLabel: `${formatEuros(standardCents)}${per}`,
        // Annuel : équivalent mensuel, pour comparer.
        monthlyEquivalent: interval === 'year' ? `${formatEuros(Math.round(cents / 12))}/mois` : null,
    };
};

/** « Plus que 12 places sur 50 », « Dernière place ! », ou null s'il n'y en a plus / inconnu. */
export const spotsLabel = (spotsLeft) => {
    if (spotsLeft == null || spotsLeft <= 0) return null;
    if (spotsLeft === 1) return 'Dernière place !';
    if (spotsLeft >= FOUNDER_SPOTS) return `${FOUNDER_SPOTS} places seulement`;
    return `Plus que ${spotsLeft} places sur ${FOUNDER_SPOTS}`;
};

/** « Essai gratuit · 1er prélèvement le 7 décembre 2026 », ou null hors essai. */
export const trialNotice = (trialEnd, now = new Date()) => {
    if (!trialEnd) return null;
    const end = new Date(trialEnd);
    if (Number.isNaN(end.getTime()) || end <= now) return null;
    const date = formatDate(end, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
    return `Essai gratuit · 1er prélèvement le ${date}`;
};

/** Lien mailto pour réserver la visio d'accueil des membres fondateurs. */
export const founderVisioMailto = ({ name, company } = {}) => {
    const who = [name, company].filter(Boolean).join(' — ');
    const subject = 'Visio membre fondateur Artisan Facile';
    const body = [
        'Bonjour Denis,',
        '',
        `Je viens de rejoindre Artisan Facile Pro en tant que membre fondateur${who ? ` (${who})` : ''}.`,
        'Je souhaite réserver ma visio de 30 minutes pour mettre en place ma bibliothèque de prix et mon premier devis.',
        '',
        'Mes disponibilités :',
        '',
    ].join('\n');
    return `mailto:${FOUNDER_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

/** Lien d'appel vers Denis. */
export const founderVisioTel = () => `tel:${FOUNDER_CONTACT_PHONE_E164}`;

/**
 * SMS prérempli vers Denis. « ?&body= » est compris à la fois par iOS
 * (qui attend « &body= ») et par Android (qui attend « ?body= »).
 */
export const founderVisioSms = ({ name, company } = {}) => {
    const who = [name, company].filter(Boolean).join(' — ');
    const body = `Bonjour Denis, membre fondateur Artisan Facile${who ? ` (${who})` : ''} : je souhaite réserver ma visio de 30 min. Mes disponibilités : `;
    return `sms:${FOUNDER_CONTACT_PHONE_E164}?&body=${encodeURIComponent(body)}`;
};

/**
 * Ce que le Pro fait pour l'artisan, en mots de chantier : la même liste sert
 * la page Abonnement, la carte d'offre, le bandeau et la page d'accueil.
 */
export const PRO_BENEFITS = [
    {
        key: 'quotes',
        pro: "L'appli relance toute seule",
        title: 'Vos devis relancés tout seuls',
        text: "Un devis reste sans réponse ? L'appli relance votre client à J+7, J+14 et J+21, avec un mail poli et le lien pour signer en ligne.",
        free: 'Vous devez y penser et cliquer',
    },
    {
        key: 'invoices',
        pro: "L'appli réclame toute seule",
        title: 'Vos factures en retard réclamées pour vous',
        text: "Rappel aimable, puis rappel ferme, sans que vous ayez à y penser. Vous êtes payé plus vite, sans jouer les gendarmes.",
        free: 'Vous devez y penser et cliquer',
    },
    {
        key: 'reviews',
        pro: "Demandé automatiquement",
        title: 'Des avis Google sans rien demander',
        text: "Chantier terminé, vous repartez : votre client reçoit aussitôt un mot de remerciement avec votre lien d'avis Google, au moment où il est le plus content.",
        free: 'À demander vous-même',
    },
    {
        key: 'summary',
        pro: "Chaque soir à 18 h",
        title: 'Le point du soir sur votre téléphone',
        text: "À 18 h : ce qui a été signé, payé et relancé dans la journée. Vous savez où vous en êtes sans ouvrir l'appli.",
        free: false,
    },
    {
        key: 'voice',
        pro: "Sans limite, rien à régler",
        title: 'Vos devis dictés, sans limite',
        text: "Vous parlez, l'appli écrit le devis, le rapport ou le mail. Rien à régler.",
        free: 'Clé IA à installer vous-même, 10 dictées par mois',
    },
];
