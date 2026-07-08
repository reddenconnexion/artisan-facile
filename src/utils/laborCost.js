// Calcul du coût horaire de revient de l'artisan (« combien me coûte une heure »).
//
// À NE PAS confondre avec le taux de facturation (ai_preferences.ai_hourly_rate,
// le prix vendu au client) : ici on calcule le COÛT, qui sert de plancher à la
// marge nette des devis (voir quoteMargin dans quoteInternalDetail.js).
//
//   coût horaire = (rémunération nette souhaitée + cotisations + autres charges)
//                  ÷ heures réellement facturables par an
//
// Le piège classique est le dénominateur : on ne facture jamais 1607 h (35 h
// légales). En retirant congés, déplacements, devis et administratif, un artisan
// facture plutôt ~1200 h/an — d'où la valeur par défaut ci-dessous.

export const DEFAULT_BILLABLE_HOURS = 1200;

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Calcule le coût horaire de revient à partir des charges annuelles à couvrir.
 *
 * @param {object} p
 * @param {number} p.netAnnual      Rémunération nette annuelle souhaitée (€/an).
 * @param {number} p.cotisations    Cotisations sociales annuelles (€/an).
 * @param {number} p.fixedCharges   Autres charges professionnelles annuelles (€/an).
 * @param {number} p.billableHours  Heures facturables par an (dénominateur).
 * @returns {{ annualTotal: number, billableHours: number, hourlyCost: number }}
 */
export const computeHourlyCost = ({
    netAnnual = 0,
    cotisations = 0,
    fixedCharges = 0,
    billableHours = 0,
} = {}) => {
    const annualTotal = num(netAnnual) + num(cotisations) + num(fixedCharges);
    const hours = num(billableHours);
    const hourlyCost = hours > 0 ? annualTotal / hours : 0;
    return { annualTotal, billableHours: hours, hourlyCost };
};
