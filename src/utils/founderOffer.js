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

// Adresse affichée aux membres fondateurs pour réserver la visio de 30 min.
export const FOUNDER_CONTACT_EMAIL = 'rotvener97@gmail.com';

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
