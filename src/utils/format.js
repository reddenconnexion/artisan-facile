/**
 * Formatage d'affichage partagé (montants et dates, locale fr-FR).
 *
 * Point d'entrée unique : ne pas réimplémenter ces helpers localement dans une
 * page ou un composant, les importer d'ici.
 *
 * Les fonctions ne lèvent jamais : une valeur absente ou invalide donne un
 * repli (0 € pour les montants, '' ou le `fallback` fourni pour les dates).
 */

const FR = 'fr-FR';

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const toDate = (value) => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

// ── Montants ─────────────────────────────────────────────────────────────────

/**
 * Montant en euros au format monétaire français : « 1 234,56 € ».
 * `decimals: 0` arrondit à l'euro : « 1 235 € ».
 */
export const formatCurrency = (amount, { decimals } = {}) => {
    const options = { style: 'currency', currency: 'EUR' };
    if (decimals != null) {
        options.minimumFractionDigits = decimals;
        options.maximumFractionDigits = decimals;
    }
    return toNumber(amount).toLocaleString(FR, options);
};

/** Montant arrondi à l'euro : « 1 235 € ». */
export const formatCurrencyRounded = (amount) => formatCurrency(amount, { decimals: 0 });

/**
 * Prix à deux décimales suivi de « € » : « 1 234,56 € ».
 * Renvoie `fallback` si la valeur n'est pas un nombre.
 */
export const formatPrice = (value, fallback = '') => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return n.toLocaleString(FR, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
};

/**
 * Montant compact pour les tuiles et widgets : « 850 € », « 1.2 k€ », « 12 k€ ».
 * Renvoie « — » pour une valeur absente.
 */
export const formatCompactCurrency = (value) => {
    if (!value && value !== 0) return '—';
    if (value >= 10000) return `${Math.round(value / 1000)} k€`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)} k€`;
    return `${Math.round(value)} €`;
};

/**
 * Montant à deux décimales avec point décimal : « 1234.56 € ».
 * Format historique des PDF et récapitulatifs texte.
 */
export const formatAmount = (value) => `${toNumber(value).toFixed(2)} €`;

// ── Dates ────────────────────────────────────────────────────────────────────

/**
 * Date seule : « 27/09/2026 » par défaut.
 * Options Intl acceptées (`day`, `month`, `year`…), plus `locale` et
 * `fallback` (renvoyé si la date est absente ou invalide, '' par défaut).
 */
export const formatDate = (value, { locale = FR, fallback = '', ...options } = {}) => {
    const d = toDate(value);
    return d ? d.toLocaleDateString(locale, options) : fallback;
};

/**
 * Date et heure : « 27/09/2026 14:05:00 » par défaut.
 * Mêmes options que `formatDate`.
 */
export const formatDateTime = (value, { locale = FR, fallback = '', ...options } = {}) => {
    const d = toDate(value);
    return d ? d.toLocaleString(locale, options) : fallback;
};

/**
 * Normalise un texte pour la recherche : minuscules, sans accents
 * (« René » → « rene »).
 */
export const normalizeSearch = (value) =>
    String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
