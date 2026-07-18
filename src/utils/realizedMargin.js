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
 * Marge réalisée d'un devis : le coût matière du devis est remplacé par le
 * coût réel des achats liés ; la main d'œuvre reste celle du devis (heures ×
 * coût horaire), comme dans quoteMargin.
 *
 * @param {Array} items          Lignes du devis (quotes.items) — non modifiées.
 * @param {number} subtotal      Total HT vendu.
 * @param {number} laborCostRate Coût horaire de revient (€/h), 0 si inconnu.
 * @param {object|null} agg      Entrée de procurementCostByQuote pour ce devis.
 * @returns {null|{margin:number, materialCost:number, laborCost:number,
 *          cost:number, plannedMargin:number, delta:number, hasLabor:boolean,
 *          pricedCount:number, totalCount:number}}
 *   null si aucun achat au prix renseigné (rien de « réalisé » à montrer).
 */
export const realizedQuoteMargin = (items, subtotal, laborCostRate, agg) => {
    if (!agg || agg.pricedCount === 0) return null;
    const planned = quoteMargin(items, subtotal, laborCostRate);
    const revenue = num(subtotal);
    const materialCost = agg.cost;
    const cost = materialCost + planned.laborCost;
    const margin = revenue > 0 ? (revenue - cost) / revenue : 0;
    return {
        margin,
        materialCost,
        laborCost: planned.laborCost,
        cost,
        plannedMargin: planned.margin,
        delta: margin - planned.margin,
        hasLabor: planned.hasLabor,
        pricedCount: agg.pricedCount,
        totalCount: agg.totalCount,
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
