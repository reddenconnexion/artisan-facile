// Coefficient de marge par défaut (profiles.ai_preferences.default_margin_coefficient) :
// prix de vente = prix d'achat × coefficient.

// En dessous de 1 on vend à perte ; au-delà de 5 c'est presque toujours une
// faute de frappe (15 au lieu de 1,5).
export const MIN_MARGIN_COEF = 1;
export const MAX_MARGIN_COEF = 5;

/** « 1,58 » ou « 1.58 » → 1.58 ; null si ce n'est pas un coefficient plausible. */
export const parseMarginCoefficient = (raw) => {
    const text = String(raw ?? '').trim().replace(',', '.');
    if (!text) return null;
    const n = Number(text);
    return Number.isFinite(n) && n > MIN_MARGIN_COEF && n <= MAX_MARGIN_COEF ? Math.round(n * 100) / 100 : null;
};
