// Agrégateur unique « marge chantier ».
//
// Toutes les vues qui affichent une marge passent par ici, au lieu de
// recomposer chacune leur calcul à partir des briques de bas niveau :
//   - fiche devis (DevisForm) : marge prévue, marge réalisée du document,
//     marge réalisée consolidée du chantier → `quoteMarginSummary` ;
//   - Comptabilité et Tableau de bord : ventilation main d'œuvre / matériel
//     des documents payés, puis revenu net de la période avec la marge
//     matériel au réel quand les achats sont suivis → `splitServiceMaterial`,
//     `isCountedPaidDoc`, `periodNetIncome`.
//
// Le calcul de marge a déjà été source de deux bugs (repli parent sur les
// avenants, coût parent multi-compté — voir docs/analyse-marge-avenants.md) :
// les règles de rattachement coût ↔ CA vivent donc à UN seul endroit.
//
// Fonctions PURES : aucune dépendance React/réseau.

import { quoteMargin } from './quoteInternalDetail';
import {
    realizedQuoteMargin,
    chantierRealizedMargin,
    isPartialScopeDoc,
    realizedNetAdjustment,
} from './realizedMargin';
import { computeNetIncome } from './netIncome';

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

const lowerOr = (value, fallback) => (value || fallback).toLowerCase();

// ── Fiche devis ──────────────────────────────────────────────────────────────

/**
 * Achats et heures « réalisés » à confronter à UN document.
 *
 * Les coûts réels sont cherchés sur le document lui-même, à défaut sur son
 * devis parent — mais seulement si le document reprend le périmètre complet
 * du chantier. Un avenant ou une facture de situation ne facture qu'une part
 * du chantier : lui attribuer les coûts complets du parent donnerait une marge
 * absurde (cf. isPartialScopeDoc).
 *
 * @param {object} p
 * @param {number|string|null} p.id       Id du document.
 * @param {number|string|null} p.parentId Id du devis parent éventuel.
 * @param {object} p.doc                  Document (type, title, amendment_details).
 * @param {Map} p.procurementCosts        Résultat de procurementCostByQuote.
 * @param {Map} p.spentHoursMap           Résultat de spentHoursByQuote.
 * @returns {{agg: object|undefined, spentHours: number}}
 */
export const realizedSourcesFor = ({ id, parentId, doc, procurementCosts, spentHoursMap }) => {
    const costs = procurementCosts instanceof Map ? procurementCosts : new Map();
    const hours = spentHoursMap instanceof Map ? spentHoursMap : new Map();
    const canUseParent = !!parentId && !isPartialScopeDoc(doc);
    const agg = costs.get(Number(id))
        ?? (canUseParent ? costs.get(Number(parentId)) : undefined);
    const spentHours = hours.get(Number(id))
        ?? (canUseParent ? hours.get(Number(parentId)) : 0)
        ?? 0;
    return { agg, spentHours };
};

/**
 * Les trois marges affichées sur la fiche d'un devis.
 *
 * @param {object} p
 * @param {number|string|null} p.id        Id du devis (null pour un brouillon).
 * @param {object} p.doc                   Données du devis (items, parent_quote_id, type…).
 * @param {number} p.subtotal              Total HT vendu.
 * @param {number|string} p.laborCostRate  Coût horaire de revient (€/h).
 * @param {Map} p.procurementCosts         Résultat de procurementCostByQuote.
 * @param {Map} p.spentHoursMap            Résultat de spentHoursByQuote.
 * @param {Array|null} [p.chantierDocs]    Devis initial + avenants signés.
 * @returns {{
 *   laborRate: number,
 *   planned: ReturnType<typeof quoteMargin>,
 *   realized: ReturnType<typeof realizedQuoteMargin>,
 *   chantier: ReturnType<typeof chantierRealizedMargin>,
 * }}
 *   - planned  : marge prévue (lignes du devis) ;
 *   - realized : marge réalisée du document (null si rien de réalisé) ;
 *   - chantier : marge réalisée consolidée, calculée seulement si le chantier
 *                compte au moins un avenant signé (null sinon).
 */
export const quoteMarginSummary = ({
    id,
    doc,
    subtotal,
    laborCostRate,
    procurementCosts,
    spentHoursMap,
    chantierDocs = null,
}) => {
    const laborRate = num(laborCostRate);
    const items = doc?.items;
    const planned = quoteMargin(items, subtotal, laborRate);

    let realized = null;
    if (num(subtotal) > 0) {
        const { agg, spentHours } = realizedSourcesFor({
            id,
            parentId: doc?.parent_quote_id,
            doc,
            procurementCosts,
            spentHoursMap,
        });
        realized = realizedQuoteMargin(items, subtotal, laborRate, agg, spentHours);
    }

    const chantier = Array.isArray(chantierDocs) && chantierDocs.length > 1
        ? chantierRealizedMargin(chantierDocs, procurementCosts, spentHoursMap, laborRate)
        : null;

    return { laborRate, planned, realized, chantier };
};

// ── Comptabilité / Tableau de bord ───────────────────────────────────────────

/**
 * Date d'encaissement d'un document payé : `paid_at` quand il est renseigné,
 * à défaut la date du document. Un avenant ou une facture réglé ce mois-ci
 * compte dans le CA de ce mois-ci, même s'il a été émis le mois précédent.
 */
export const paidDate = (doc) => new Date(doc?.paid_at || doc?.date || doc?.created_at);

/**
 * Ids des devis (hors factures) payés : leurs factures enfant ne doivent pas
 * être comptées une seconde fois.
 */
export const paidQuoteIdSet = (docs) => new Set(
    (Array.isArray(docs) ? docs : [])
        .filter((q) => q && lowerOr(q.type, 'quote') !== 'invoice' && lowerOr(q.status, '') === 'paid')
        .map((q) => q.id)
);

/**
 * Facture enfant dont le devis parent est déjà payé : même CA, à ne pas
 * compter deux fois.
 */
export const isDuplicatePaidChild = (doc, paidQuoteIds) =>
    lowerOr(doc?.type, 'quote') === 'invoice' && !!doc.parent_id && paidQuoteIds.has(doc.parent_id);

/**
 * Le document entre-t-il dans le CA encaissé ? Payé, et pas doublon d'un
 * devis parent déjà payé.
 */
export const isCountedPaidDoc = (doc, paidQuoteIds) =>
    !!doc && lowerOr(doc.status, '') === 'paid' && !isDuplicatePaidChild(doc, paidQuoteIds);

/**
 * Ventile le CA HT d'un document entre main d'œuvre et matériel, d'après le
 * type de ses lignes. Sans lignes, tout le montant est compté en main d'œuvre.
 *
 * @returns {{serviceAmount:number, materialAmount:number}}
 */
export const splitServiceMaterial = (doc) => {
    let serviceAmount = 0;
    let materialAmount = 0;
    if (Array.isArray(doc?.items) && doc.items.length > 0) {
        doc.items.forEach((item) => {
            const line = (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
            if (item.type === 'material') materialAmount += line;
            else serviceAmount += line;
        });
    } else {
        serviceAmount = doc?.total_ht || doc?.total_ttc || 0;
    }
    return { serviceAmount, materialAmount };
};

/**
 * Revenu net d'une période : marge chantier (main d'œuvre + marge matériel),
 * la marge matériel passant du forfait au RÉEL pour les documents dont le
 * chantier a des achats suivis au prix fournisseur.
 *
 * @param {object} p
 * @param {Array<{id, parentId?, materialAmount}>} p.entries Documents payés de la période.
 * @param {Map} p.costByQuote       Résultat de procurementCostByQuote.
 * @param {number} p.caServices     Main d'œuvre encaissée (HT).
 * @param {number} p.caMateriel     Matériel encaissé (HT).
 * @param {number} p.materialMarginRate Marge forfaitaire sur le matériel.
 * @param {number} [p.urssafCharges]
 * @param {number} [p.proChargesForPeriod]
 * @param {number} [p.incomeTax]
 * @returns {object} détail de computeNetIncome + realCoveredCount (nombre de
 *          documents dont la marge matériel est au réel).
 */
export const periodNetIncome = ({
    entries,
    costByQuote,
    caServices,
    caMateriel,
    materialMarginRate,
    urssafCharges,
    proChargesForPeriod,
    incomeTax,
}) => {
    const real = realizedNetAdjustment(entries || [], costByQuote);
    return {
        ...computeNetIncome({
            caServices,
            caMateriel,
            materialMarginRate,
            caMaterielReal: real.caMaterielReal,
            realMaterialCost: real.realMaterialCost,
            urssafCharges,
            proChargesForPeriod,
            incomeTax,
        }),
        realCoveredCount: real.coveredCount,
    };
};
