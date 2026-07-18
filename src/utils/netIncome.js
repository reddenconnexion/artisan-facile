// Calcul du revenu net mensuel de l'artisan (« ce qui me reste vraiment »).
//
// Modèle métier (validé avec l'utilisateur, micro-entrepreneur) :
//
//   Le CA encaissé inclut les acomptes matériel, dont l'essentiel ressort du
//   compte pour acheter le matériel client. L'artisan ne conserve qu'une MARGE
//   sur ce matériel (25 % par défaut). La main d'œuvre, elle, lui revient
//   entièrement.
//
//   FIGURE 1 — Marge chantier = main d'œuvre + marge_rate × matériel
//   FIGURE 2 — Revenu net réel = Marge chantier − URSSAF − charges pro − impôt
//
//   L'URSSAF se calcule sur le CA TOTAL encaissé (matériel compris), conformément
//   au régime micro-entreprise — elle grignote donc aussi la marge matériel.
//
// Fonctions PURES : aucune dépendance React/réseau (cf. laborCost.js). Les taux
// sociaux 2026 proviennent de taxUtils.URSSAF_RATES (source unique, non dupliquée).

import { URSSAF_RATES } from './taxUtils';
import { MICRO_ABATEMENT } from './accountingAdvisor';

// Part du matériel que l'artisan conserve en marge (le reste ressort pour l'achat).
export const DEFAULT_MATERIAL_MARGIN_RATE = 0.25;

// Taux du versement libératoire de l'impôt sur le revenu (option micro-entreprise),
// appliqués au CA. Services (BIC) 1,7 %, vente/revente (BIC) 1 %, libéral (BNC) 2,2 %.
export const VERSEMENT_LIBERATOIRE_RATES = {
    services: 0.017,
    vente: 0.01,
    liberal: 0.022,
};

// Tranche marginale d'imposition par défaut pour l'estimation au barème.
export const DEFAULT_TMI = 0.11;

// Tranches marginales d'imposition 2026 (barème IR) proposées dans l'UI.
export const TMI_OPTIONS = [
    { value: 0, label: '0 %' },
    { value: 0.11, label: '11 %' },
    { value: 0.30, label: '30 %' },
    { value: 0.41, label: '41 %' },
    { value: 0.45, label: '45 %' },
];

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Estime les cotisations sociales URSSAF sur le CA encaissé (micro uniquement).
 * Calcul sur le CA TOTAL (services + matériel), part par part.
 *
 * @returns {number|null} cotisations estimées, ou null si statut non-micro.
 */
export const estimateUrssafCharges = ({
    caServices = 0,
    caMateriel = 0,
    activityType = 'services',
    hasAcre = false,
    status = 'micro_entreprise',
} = {}) => {
    if (status !== 'micro_entreprise') return null;
    const rates = URSSAF_RATES.micro_entreprise;
    const s = num(caServices);
    const m = num(caMateriel);

    if (activityType === 'liberal') {
        const r = hasAcre ? rates.liberal.acre : rates.liberal.normal;
        return (s + m) * r;
    }
    // Services + vente (matériel) : chacun à son taux (identique au mode « mixte »).
    const sRate = hasAcre ? rates.services.acre : rates.services.normal;
    const vRate = hasAcre ? rates.vente.acre : rates.vente.normal;
    return s * sRate + m * vRate;
};

/**
 * Estime l'impôt sur le revenu pour la période.
 * - method 'versement_liberatoire' (défaut) : % du CA, simple et mensualisable.
 * - method 'bareme' : taxable = CA × (1 − abattement micro), puis × TMI.
 *
 * @returns {number} impôt estimé (≥ 0).
 */
export const estimateIncomeTax = ({
    caServices = 0,
    caMateriel = 0,
    activityType = 'services',
    method = 'versement_liberatoire',
    tmi = DEFAULT_TMI,
} = {}) => {
    const s = num(caServices);
    const m = num(caMateriel);

    if (method === 'bareme') {
        const abS = activityType === 'liberal' ? MICRO_ABATEMENT.liberal : MICRO_ABATEMENT.services;
        const taxable = s * (1 - abS) + m * (1 - MICRO_ABATEMENT.vente);
        return Math.max(0, taxable * num(tmi));
    }

    // Versement libératoire (défaut).
    if (activityType === 'liberal') {
        return (s + m) * VERSEMENT_LIBERATOIRE_RATES.liberal;
    }
    return s * VERSEMENT_LIBERATOIRE_RATES.services + m * VERSEMENT_LIBERATOIRE_RATES.vente;
};

/**
 * Assemble le revenu net à partir des composantes de la période.
 *
 * La marge chantier (FIGURE 1) retire déjà le coût matériel (≈ 1 − marge_rate) :
 * il ne faut donc PAS soustraire à nouveau le matériel. urssafCharges, proCharges
 * et incomeTax sont des flux distincts (aucun double comptage).
 *
 * Coûts matériel réels (« Matériel à commander ») : quand une partie du CA
 * matériel provient de chantiers dont les achats sont suivis avec leur prix
 * fournisseur réel, cette part bascule du forfait (taux) vers la marge réelle :
 *   marge matériel = (caMateriel − caMaterielReal) × taux
 *                  + (caMaterielReal − realMaterialCost)
 * Sans ces paramètres (défaut 0), le calcul historique est inchangé.
 *
 * @param {object} p
 * @param {number} p.caServices           Main d'œuvre encaissée sur la période (HT).
 * @param {number} p.caMateriel           Part matériel encaissée sur la période (HT).
 * @param {number} [p.materialMarginRate] Marge conservée sur le matériel (défaut 0,25).
 * @param {number} [p.caMaterielReal]     Part du CA matériel couverte par des achats suivis.
 * @param {number} [p.realMaterialCost]   Coût d'achat réel correspondant à cette part.
 * @param {number} [p.urssafCharges]      Cotisations sociales de la période.
 * @param {number} [p.proChargesForPeriod] Charges pro fixes ramenées à la période.
 * @param {number} [p.incomeTax]          Impôt estimé de la période.
 * @returns {object} détail chiffré (caTotal, margeChantier, revenuNet, …).
 */
export const computeNetIncome = ({
    caServices = 0,
    caMateriel = 0,
    materialMarginRate = DEFAULT_MATERIAL_MARGIN_RATE,
    caMaterielReal = 0,
    realMaterialCost = 0,
    urssafCharges = 0,
    proChargesForPeriod = 0,
    incomeTax = 0,
} = {}) => {
    const s = num(caServices);
    const m = num(caMateriel);
    const rate = num(materialMarginRate);
    // La part « réelle » ne peut excéder le CA matériel de la période (garde-fou
    // si le CA a été corrigé à la main en dessous du CA calculé).
    const mReal = Math.min(Math.max(num(caMaterielReal), 0), m);
    const realCost = mReal > 0 ? num(realMaterialCost) : 0;

    const caTotal = s + m;
    const margeMaterielReelle = mReal - realCost; // peut être négative : info réelle
    const margeMateriel = (m - mReal) * rate + margeMaterielReelle;
    const margeChantier = s + margeMateriel; // FIGURE 1

    const urssaf = num(urssafCharges);
    const pro = num(proChargesForPeriod);
    const tax = num(incomeTax);
    const revenuNet = margeChantier - urssaf - pro - tax; // FIGURE 2

    return {
        caTotal,
        caServices: s,
        caMateriel: m,
        materialMarginRate: rate,
        caMaterielReal: mReal,
        realMaterialCost: realCost,
        margeMaterielReelle,
        margeMateriel,
        margeChantier,
        urssafCharges: urssaf,
        proChargesForPeriod: pro,
        incomeTax: tax,
        revenuNet,
    };
};
