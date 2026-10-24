// Agrégateur unique « marge chantier ».
//
// Toutes les vues qui affichent une marge passent par ici, au lieu de
// recomposer chacune leur calcul à partir des briques de bas niveau :
//   - fiche devis (DevisForm) : marge prévue, marge réalisée du document,
//     marge réalisée consolidée du chantier → `quoteMarginSummary` ;
//   - Pilotage Chantiers, suivi d'affaire, tableau de bord : marge réelle de
//     chaque chantier et alerte sous le seuil → `chantierMarginReport`,
//     `chantierMarginAlerts`, `marginAlertLevel` ;
//   - Comptabilité et Tableau de bord : ventilation main d'œuvre / matériel
//     des documents payés, puis revenu net de la période avec la marge
//     matériel au réel quand les achats sont suivis → `splitServiceMaterial`,
//     `isCountedPaidDoc`, `periodNetIncome`, `monthlyNetIncomeSeries`.
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
import { computeNetIncome, estimateUrssafCharges, estimateIncomeTax } from './netIncome';
import { isAmendmentRow } from './amendmentIndex';

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

// ── Marge réelle par chantier et alerte ─────────────────────────────────────

/** Seuil d'alerte par défaut (en %), aligné sur le rouge des indicateurs de marge. */
export const DEFAULT_MARGIN_ALERT_THRESHOLD = 20;

/** Écart (en points) au-dessus du seuil où la marge est signalée « à surveiller ». */
export const MARGIN_WATCH_BAND = 5;

const SIGNED_STATUSES = ['accepted', 'billed', 'paid'];

/**
 * Seuil d'alerte de marge (en %) lu dans le profil (ai_preferences
 * aplaties par useUserProfile), à défaut DEFAULT_MARGIN_ALERT_THRESHOLD.
 */
export const marginAlertThreshold = (profile) => {
    const raw = profile?.margin_alert_threshold;
    if (raw == null || raw === '') return DEFAULT_MARGIN_ALERT_THRESHOLD;
    const v = parseFloat(raw);
    return Number.isFinite(v) && v >= 0 && v < 100 ? v : DEFAULT_MARGIN_ALERT_THRESHOLD;
};

/**
 * Niveau d'alerte d'une marge (ratio, ex. 0.18) face à un seuil en %.
 * @returns {'below'|'watch'|'ok'|null} null si la marge est inconnue.
 */
export const marginAlertLevel = (margin, thresholdPct = DEFAULT_MARGIN_ALERT_THRESHOLD) => {
    if (margin == null || !Number.isFinite(margin)) return null;
    const t = num(thresholdPct) / 100;
    if (margin < t) return 'below';
    if (margin < t + MARGIN_WATCH_BAND / 100) return 'watch';
    return 'ok';
};

/**
 * Documents qui forment le CA d'un chantier : le devis initial et ses avenants
 * SIGNÉS (y compris un avenant converti en facture, qui garde
 * parent_quote_id). Les acomptes, situations et factures de clôture ne
 * s'ajoutent pas : ils refacturent ce total, ils ne l'augmentent pas.
 *
 * @param {object} root        Devis initial (id, items, total_ht).
 * @param {Array}  linkedRows  Lignes `quotes` candidates (avenants du compte,
 *                             toutes racines confondues : filtrées ici).
 * @returns {Array<{id, items, total_ht}>}
 */
export const chantierDocsFor = (root, linkedRows) => {
    if (!root || root.id == null) return [];
    const rootId = Number(root.id);
    const amendments = (Array.isArray(linkedRows) ? linkedRows : []).filter((r) =>
        r
        && Number(r.id) !== rootId
        && Number(r.parent_quote_id) === rootId
        && isAmendmentRow(r)
        && SIGNED_STATUSES.includes(lowerOr(r.status, ''))
    );
    return [root, ...amendments].map((d) => ({ id: d.id, items: d.items, total_ht: d.total_ht }));
};

/**
 * Marge réelle d'UN chantier : CA du devis + avenants signés rapproché des
 * achats saisis (« Matériel à commander », dont les commandes chantier) et des
 * heures pointées × coût horaire, puis niveau d'alerte face au seuil.
 *
 * Tant qu'un poste n'a rien de réel (aucun achat au prix renseigné, aucune
 * heure pointée), il reste à sa valeur prévue au devis : la marge affichée
 * est la meilleure estimation à date.
 *
 * @returns {null|(ReturnType<typeof chantierRealizedMargin> & {
 *   level:'below'|'watch'|'ok', threshold:number, gapPts:number,
 *   laborRateMissing:boolean })}
 *   null si rien n'est encore réalisé sur le chantier.
 */
export const chantierMarginReport = ({
    root,
    linkedRows,
    procurementCosts,
    spentHoursMap,
    laborCostRate,
    thresholdPct = DEFAULT_MARGIN_ALERT_THRESHOLD,
}) => {
    const docs = chantierDocsFor(root, linkedRows);
    if (docs.length === 0) return null;
    const rate = num(laborCostRate);
    const m = chantierRealizedMargin(docs, procurementCosts, spentHoursMap, rate);
    if (!m || m.revenue <= 0) return null;
    const threshold = num(thresholdPct);
    // Heures pointées mais coût horaire inconnu : la main d'œuvre réelle ne
    // peut pas être chiffrée, la marge reste au prévu sur ce poste.
    const laborRateMissing = rate <= 0 && m.spentHours > 0;
    return {
        ...m,
        level: marginAlertLevel(m.margin, threshold),
        threshold,
        gapPts: Math.round((m.margin * 100 - threshold) * 10) / 10,
        laborRateMissing,
    };
};

/**
 * Marge réelle de plusieurs chantiers (Pilotage, tableau de bord).
 *
 * @param {object} p
 * @param {Array} p.roots            Devis initiaux des chantiers.
 * @param {Array} p.linkedRows       Avenants du compte (filtrés par chantier).
 * @param {Map}   p.procurementCosts Résultat de procurementCostByQuote.
 * @param {Map}   p.spentHoursMap    Résultat de spentHoursByQuote.
 * @param {number} p.laborCostRate
 * @param {number} [p.thresholdPct]
 * @returns {Map<number, ReturnType<typeof chantierMarginReport>>} id racine →
 *          rapport (seuls les chantiers ayant du réalisé y figurent).
 */
export const chantierMarginReports = ({
    roots,
    linkedRows,
    procurementCosts,
    spentHoursMap,
    laborCostRate,
    thresholdPct = DEFAULT_MARGIN_ALERT_THRESHOLD,
}) => {
    const out = new Map();
    // Index des avenants par racine : évite un filtrage complet par chantier.
    const byRoot = new Map();
    (Array.isArray(linkedRows) ? linkedRows : []).forEach((r) => {
        if (!r || r.parent_quote_id == null) return;
        const k = Number(r.parent_quote_id);
        if (!byRoot.has(k)) byRoot.set(k, []);
        byRoot.get(k).push(r);
    });
    (Array.isArray(roots) ? roots : []).forEach((root) => {
        if (!root || root.id == null) return;
        const report = chantierMarginReport({
            root,
            linkedRows: byRoot.get(Number(root.id)) || [],
            procurementCosts,
            spentHoursMap,
            laborCostRate,
            thresholdPct,
        });
        if (report) out.set(Number(root.id), report);
    });
    return out;
};

/**
 * Chantiers dont la marge réelle est passée sous le seuil, du pire au moins
 * pire.
 *
 * @param {Array} roots
 * @param {Map} reports Résultat de chantierMarginReports.
 * @returns {Array<{root:object, report:object}>}
 */
export const chantierMarginAlerts = (roots, reports) => {
    if (!(reports instanceof Map)) return [];
    return (Array.isArray(roots) ? roots : [])
        .map((root) => ({ root, report: root ? reports.get(Number(root.id)) : null }))
        .filter((x) => x.report && x.report.level === 'below')
        .sort((a, b) => a.report.margin - b.report.margin);
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
 * Les options non retenues (is_optional) ne sont pas dues : elles ne font pas
 * partie du total du document et ne doivent pas gonfler le CA déclaré.
 *
 * @returns {{serviceAmount:number, materialAmount:number}}
 */
export const splitServiceMaterial = (doc) => {
    let serviceAmount = 0;
    let materialAmount = 0;
    if (Array.isArray(doc?.items) && doc.items.length > 0) {
        doc.items.forEach((item) => {
            if (item.type === 'section' || item.is_optional) return;
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

/**
 * Revenu net mois par mois d'une année (courbe de la Comptabilité) : chaque
 * mois passe par `periodNetIncome`, avec les mêmes règles que le bloc
 * « Revenu net » de la période (CA encaissé à la date du paiement, URSSAF sur
 * le CA total, charges pro mensualisées, impôt estimé).
 *
 * Seuls les mois réellement écoulés sont rendus : rien avant le premier
 * encaissement (début d'activité) ni après le mois en cours, pour ne pas
 * afficher de « pertes » fictives égales aux seules charges pro.
 *
 * ACRE : quand `acreEndMonth` ('YYYY-MM') est renseigné, le taux réduit
 * s'applique jusqu'à ce mois inclus puis le taux normal ; sinon `hasAcre`
 * vaut pour tous les mois.
 *
 * @param {object} p
 * @param {Array} p.docs                 Devis/factures (tous statuts).
 * @param {number} p.year                Année affichée.
 * @param {Map} [p.costByQuote]          Résultat de procurementCostByQuote.
 * @param {number} p.materialMarginRate  Marge forfaitaire sur le matériel.
 * @param {number} [p.proChargesMonthly] Charges pro fixes ramenées au mois.
 * @param {string} [p.activityType]
 * @param {string} [p.status]            Statut juridique (URSSAF micro uniquement).
 * @param {boolean} [p.hasAcre]
 * @param {string|null} [p.acreEndMonth] Dernier mois sous ACRE, 'YYYY-MM'.
 * @param {string} [p.taxMethod]
 * @param {number} [p.tmi]
 * @param {Date} [p.now]
 * @returns {Array<object>} un élément par mois écoulé : { month (0-11), key,
 *          hasAcre, ...détail de periodNetIncome }.
 */
export const monthlyNetIncomeSeries = ({
    docs,
    year,
    costByQuote,
    materialMarginRate,
    proChargesMonthly = 0,
    activityType = 'services',
    status = 'micro_entreprise',
    hasAcre = false,
    acreEndMonth = null,
    taxMethod = 'versement_liberatoire',
    tmi,
    now = new Date(),
}) => {
    const all = Array.isArray(docs) ? docs : [];
    const paidQuoteIds = paidQuoteIdSet(all);
    const buckets = Array.from({ length: 12 }, () => ({ caServices: 0, caMateriel: 0, entries: [] }));
    let firstPaid = null;

    all.forEach((doc) => {
        if (!isCountedPaidDoc(doc, paidQuoteIds)) return;
        const d = paidDate(doc);
        if (isNaN(d.getTime())) return;
        if (!firstPaid || d < firstPaid) firstPaid = d;
        if (d.getFullYear() !== year) return;
        const { serviceAmount, materialAmount } = splitServiceMaterial(doc);
        const b = buckets[d.getMonth()];
        b.caServices += serviceAmount;
        b.caMateriel += materialAmount;
        b.entries.push({ id: doc.id, parentId: doc.parent_id ?? null, materialAmount });
    });

    if (!firstPaid || year < firstPaid.getFullYear() || year > now.getFullYear()) return [];
    const startMonth = year === firstPaid.getFullYear() ? firstPaid.getMonth() : 0;
    const endMonth = year === now.getFullYear() ? now.getMonth() : 11;

    const series = [];
    for (let m = startMonth; m <= endMonth; m++) {
        const { caServices, caMateriel, entries } = buckets[m];
        const key = `${year}-${String(m + 1).padStart(2, '0')}`;
        const monthAcre = acreEndMonth ? key <= acreEndMonth : hasAcre;
        const urssafCharges = estimateUrssafCharges({ caServices, caMateriel, activityType, hasAcre: monthAcre, status }) || 0;
        const incomeTax = estimateIncomeTax({ caServices, caMateriel, activityType, method: taxMethod, tmi });
        series.push({
            month: m,
            key,
            hasAcre: monthAcre,
            ...periodNetIncome({
                entries,
                costByQuote,
                caServices,
                caMateriel,
                materialMarginRate,
                urssafCharges,
                proChargesForPeriod: proChargesMonthly,
                incomeTax,
            }),
        });
    }
    return series;
};

/**
 * Revenu net d'une plage de jours (semaine ou mois des statistiques du tableau
 * de bord), au jour le jour : mêmes règles que `monthlyNetIncomeSeries`.
 *
 * Les charges pro de la période sont réparties sur ses jours ÉCOULÉS d'activité
 * (ni avant le premier encaissement, ni après aujourd'hui) : la somme des
 * points du graphique retombe sur le total, sans « pertes » sur des jours à
 * venir. Une plage entièrement future ou antérieure à l'activité vaut 0.
 *
 * @param {object} p  Mêmes réglages que monthlyNetIncomeSeries, plus :
 * @param {Date} p.start                  Premier jour de la plage.
 * @param {number} p.days                 Nombre de jours de la plage.
 * @param {number} [p.proChargesForPeriod] Charges pro fixes de la plage.
 * @returns {{ total: number, points: number[] }} un point par jour.
 */
export const rangeNetIncome = ({
    docs,
    start,
    days,
    costByQuote,
    materialMarginRate,
    proChargesForPeriod = 0,
    activityType = 'services',
    status = 'micro_entreprise',
    hasAcre = false,
    acreEndMonth = null,
    taxMethod = 'versement_liberatoire',
    tmi,
    now = new Date(),
}) => {
    const all = Array.isArray(docs) ? docs : [];
    const paidQuoteIds = paidQuoteIdSet(all);
    const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const first = dayStart(start);
    const buckets = Array.from({ length: days }, () => ({ caServices: 0, caMateriel: 0, entries: [] }));
    let firstPaid = null;

    all.forEach((doc) => {
        if (!isCountedPaidDoc(doc, paidQuoteIds)) return;
        const d = paidDate(doc);
        if (isNaN(d.getTime())) return;
        if (!firstPaid || d < firstPaid) firstPaid = d;
        const idx = Math.round((dayStart(d) - first) / 86400000);
        if (idx < 0 || idx >= days) return;
        const { serviceAmount, materialAmount } = splitServiceMaterial(doc);
        const b = buckets[idx];
        b.caServices += serviceAmount;
        b.caMateriel += materialAmount;
        b.entries.push({ id: doc.id, parentId: doc.parent_id ?? null, materialAmount });
    });

    const dateAt = (i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const today = dayStart(now);
    const activityStart = firstPaid ? dayStart(firstPaid) : null;
    const isActive = (i) => !!activityStart && dateAt(i) >= activityStart && dateAt(i) <= today;
    const activeDays = buckets.filter((_, i) => isActive(i)).length;
    if (activeDays === 0) return { total: 0, points: new Array(days).fill(0) };
    const proPerDay = proChargesForPeriod / activeDays;

    const settle = ({ caServices, caMateriel, entries }, monthKey, pro) => {
        const monthAcre = acreEndMonth ? monthKey <= acreEndMonth : hasAcre;
        return periodNetIncome({
            entries,
            costByQuote,
            caServices,
            caMateriel,
            materialMarginRate,
            urssafCharges: estimateUrssafCharges({ caServices, caMateriel, activityType, hasAcre: monthAcre, status }) || 0,
            proChargesForPeriod: pro,
            incomeTax: estimateIncomeTax({ caServices, caMateriel, activityType, method: taxMethod, tmi }),
        });
    };
    const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const points = buckets.map((b, i) => (isActive(i) || b.entries.length
        ? settle(b, monthKeyOf(dateAt(i)), isActive(i) ? proPerDay : 0).revenuNet
        : 0));

    // Total sur l'ensemble de la plage : la marge matériel réelle d'un même
    // chantier n'y est imputée qu'une fois (cf. periodNetIncome).
    const pooled = buckets.reduce((acc, b) => ({
        caServices: acc.caServices + b.caServices,
        caMateriel: acc.caMateriel + b.caMateriel,
        entries: acc.entries.concat(b.entries),
    }), { caServices: 0, caMateriel: 0, entries: [] });
    const urssafSum = buckets.reduce((sum, b, i) => sum + (settle(b, monthKeyOf(dateAt(i)), 0).urssafCharges), 0);
    const real = periodNetIncome({
        entries: pooled.entries,
        costByQuote,
        caServices: pooled.caServices,
        caMateriel: pooled.caMateriel,
        materialMarginRate,
        urssafCharges: urssafSum,
        proChargesForPeriod,
        incomeTax: estimateIncomeTax({ caServices: pooled.caServices, caMateriel: pooled.caMateriel, activityType, method: taxMethod, tmi }),
    });
    return { total: real.revenuNet, points };
};
