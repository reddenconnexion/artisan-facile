// Marge « réalisée » : le devis confronté aux prix d'achat réels.
//
// Les lignes de « Matériel à commander » (procurement_items) gardent le lien
// vers leur devis d'origine (quote_id) et sont pré-remplies avec le prix
// d'achat prévu au devis ; quand l'artisan saisit le prix fournisseur réel au
// bureau, il écrase cette valeur. La somme quantité × prix d'achat des lignes
// d'un devis représente donc le coût matière « meilleure connaissance »
// (mélange prévu/réel) — SANS jamais modifier le devis lui-même.
//
// Ces helpers agrègent ce coût réel par devis pour :
//   - l'indicateur « Marge réalisée » sur chaque devis (formulaire + liste) ;
//   - le remplacement du forfait « marge matériel » (25 % par défaut) par la
//     marge réelle dans la Comptabilité et le Tableau de bord, chantier par
//     chantier, dès qu'un devis a des achats suivis.
//
// Fonctions PURES : aucune dépendance React/réseau (cf. netIncome.js).

import { quoteMargin } from './quoteInternalDetail';

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Agrège les lignes d'achat par devis d'origine.
 *
 * @param {Array} rows Lignes procurement_items (toutes, tous statuts).
 * @returns {Map<number, {cost:number, saleKnown:number, costKnown:number,
 *          totalCount:number, pricedCount:number}>}
 *   - cost        : Σ quantité × prix d'achat (lignes au prix renseigné).
 *   - saleKnown / costKnown : mêmes sommes restreintes aux lignes ayant PV et
 *     PA connus — base d'une marge matière comparable (page Approvisionnement).
 *   - totalCount / pricedCount : couverture (lignes liées / au prix renseigné).
 */
export const procurementCostByQuote = (rows) => {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        if (r == null || r.quote_id == null) return;
        const key = Number(r.quote_id);
        if (!Number.isFinite(key)) return;
        let agg = map.get(key);
        if (!agg) {
            agg = { cost: 0, saleKnown: 0, costKnown: 0, totalCount: 0, pricedCount: 0 };
            map.set(key, agg);
        }
        const qty = num(r.quantity) || 1;
        agg.totalCount += 1;
        if (r.buying_price != null && r.buying_price !== '') {
            const buy = num(r.buying_price);
            agg.pricedCount += 1;
            agg.cost += qty * buy;
            if (r.sale_price != null && r.sale_price !== '') {
                agg.saleKnown += qty * num(r.sale_price);
                agg.costKnown += qty * buy;
            }
        }
    });
    return map;
};

/**
 * Heures réellement pointées par devis (table task_tracking : pointages
 * « J'arrive au chantier / Je repars » et saisies manuelles d'heures).
 *
 * @param {Array<{quote_id:number|null, hours_spent:number}>} rows
 * @returns {Map<number, number>} quote_id → heures pointées cumulées.
 */
export const spentHoursByQuote = (rows) => {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        if (r == null || r.quote_id == null) return;
        const key = Number(r.quote_id);
        if (!Number.isFinite(key)) return;
        map.set(key, (map.get(key) || 0) + num(r.hours_spent));
    });
    return map;
};

/**
 * Marge réalisée d'un devis, à partir de ce qui s'est VRAIMENT passé :
 *   - coût matière : prix d'achat réels des lignes « Matériel à commander »
 *     liées au devis (à défaut, le coût prévu au devis) ;
 *   - main d'œuvre : heures réellement pointées × coût horaire (à défaut,
 *     les heures facturées au devis × coût horaire, comme quoteMargin).
 * Le devis lui-même n'est jamais modifié.
 *
 * @param {Array} items          Lignes du devis (quotes.items) — non modifiées.
 * @param {number} subtotal      Total HT vendu.
 * @param {number} laborCostRate Coût horaire de revient (€/h), 0 si inconnu.
 * @param {object|null} agg      Entrée de procurementCostByQuote pour ce devis.
 * @param {number} [spentHours]  Heures pointées sur ce chantier (0 si aucune).
 * @returns {null|{margin:number, materialCost:number, materialIsReal:boolean,
 *          laborCost:number, laborIsReal:boolean, spentHours:number,
 *          estimatedHours:number, cost:number, plannedMargin:number,
 *          delta:number, hasLabor:boolean, pricedCount:number, totalCount:number}}
 *   null si rien de « réalisé » (ni achat au prix renseigné, ni pointage).
 */
export const realizedQuoteMargin = (items, subtotal, laborCostRate, agg, spentHours = 0) => {
    const materialIsReal = !!agg && agg.pricedCount > 0;
    const spent = num(spentHours);
    const rate = num(laborCostRate);
    // Le pointage seul ne « réalise » la main d'œuvre que si on sait la chiffrer.
    const laborIsReal = spent > 0 && rate > 0;
    if (!materialIsReal && !laborIsReal) return null;

    const planned = quoteMargin(items, subtotal, laborCostRate);
    const revenue = num(subtotal);
    const materialCost = materialIsReal ? agg.cost : planned.materialCost;
    const laborCost = laborIsReal ? spent * rate : planned.laborCost;
    const cost = materialCost + laborCost;
    const margin = revenue > 0 ? (revenue - cost) / revenue : 0;
    return {
        margin,
        materialCost,
        materialIsReal,
        laborCost,
        laborIsReal,
        spentHours: spent,
        estimatedHours: planned.laborHours,
        cost,
        plannedMargin: planned.margin,
        delta: margin - planned.margin,
        hasLabor: planned.hasLabor || laborIsReal,
        pricedCount: agg?.pricedCount || 0,
        totalCount: agg?.totalCount || 0,
    };
};

/**
 * Marge matière d'un groupe d'achats (page Approvisionnement), calculée sur
 * les seules lignes dont PV et PA sont connus — comparaison à périmètre égal.
 * Se met à jour au fil de la saisie des prix fournisseurs.
 *
 * @returns {null|{margin:number, saleKnown:number, costKnown:number,
 *          pricedCount:number, totalCount:number}} null si base insuffisante.
 */
export const groupMaterialsMargin = (rows) => {
    let saleKnown = 0;
    let costKnown = 0;
    let pricedCount = 0;
    let totalCount = 0;
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        if (!r) return;
        totalCount += 1;
        if (r.buying_price == null || r.buying_price === '') return;
        pricedCount += 1;
        if (r.sale_price == null || r.sale_price === '') return;
        const qty = num(r.quantity) || 1;
        saleKnown += qty * num(r.sale_price);
        costKnown += qty * num(r.buying_price);
    });
    if (saleKnown <= 0) return null;
    return {
        margin: (saleKnown - costKnown) / saleKnown,
        saleKnown,
        costKnown,
        pricedCount,
        totalCount,
    };
};

/**
 * Ajustement « coûts réels » pour le revenu net (Comptabilité / Tableau de bord).
 *
 * Pour chaque facture payée comptée dans la période, si son devis (ou le devis
 * parent de la facture) a des achats au prix renseigné, sa part matériel bascule
 * du forfait (taux de marge) vers la marge réelle : CA matériel − coût réel.
 *
 * @param {Array<{id:number|string, parentId?:number|string|null, materialAmount:number}>} entries
 *        Factures comptées dans la période (id + part matériel HT).
 * @param {Map} costByQuote Résultat de procurementCostByQuote.
 * @returns {{caMaterielReal:number, realMaterialCost:number, coveredCount:number}}
 */
export const realizedNetAdjustment = (entries, costByQuote) => {
    let caMaterielReal = 0;
    let realMaterialCost = 0;
    let coveredCount = 0;
    if (!(costByQuote instanceof Map) || costByQuote.size === 0) {
        return { caMaterielReal, realMaterialCost, coveredCount };
    }
    (Array.isArray(entries) ? entries : []).forEach((e) => {
        if (!e) return;
        const agg = costByQuote.get(Number(e.id))
            ?? (e.parentId != null ? costByQuote.get(Number(e.parentId)) : undefined);
        if (!agg || agg.pricedCount === 0) return;
        coveredCount += 1;
        caMaterielReal += num(e.materialAmount);
        realMaterialCost += agg.cost;
    });
    return { caMaterielReal, realMaterialCost, coveredCount };
};
