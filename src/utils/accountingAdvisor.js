// Analyse comptable pluriannuelle pour le conseiller "expert-comptable".
//
// Ce module ne fait QUE du calcul pur (aucun appel réseau, aucune dépendance
// React) : il transforme la liste des devis/factures + les préférences du
// profil en un bilan structuré (CA, charges, résultat net, évolution) qui sert
// à la fois à l'affichage (graphiques, KPI) et à la génération de conseils IA.

import { URSSAF_RATES } from './taxUtils';

// Plafonds de CA micro-entreprise 2025/2026 (cohérents avec Accounting.jsx)
export const CA_LIMITS = {
  services: 77700,
  vente: 188700,
  liberal: 77700,
};

// Seuils de franchise en base de TVA 2025/2026
export const VAT_LIMITS = {
  services: { base: 37500, majore: 41250 },
  vente: { base: 85000, majore: 93500 },
  liberal: { base: 37500, majore: 41250 },
};

export const STATUS_LABELS = {
  micro_entreprise: 'Micro-entreprise (Auto-entrepreneur)',
  ei: 'Entreprise Individuelle (EI) au réel',
  eirl: 'EIRL',
  eurl: 'EURL',
  sasu: 'SASU',
  sarl: 'SARL',
};

export const ACTIVITY_LABELS = {
  services: 'Prestations de services artisanaux (BIC)',
  vente: 'Achat/revente de marchandises (BIC)',
  mixte: 'Activité mixte (services + vente)',
  liberal: 'Profession libérale (BNC)',
};

// Abattement forfaitaire micro-fiscal (pour estimer un résultat imposable).
const MICRO_ABATEMENT = {
  services: 0.5, // BIC services
  vente: 0.71, // BIC vente/revente
  liberal: 0.34, // BNC
  mixte: 0.5, // approximation, recalculée par part si possible
};

const toNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Filtre les factures "payées" en excluant les doublons devis/facture
 * (même logique que la page Comptabilité : une facture enfant dont le devis
 * parent est déjà payé n'est pas recomptée).
 */
const getPaidInvoices = (invoices) => {
  const safe = Array.isArray(invoices) ? invoices : [];
  const paidQuoteIds = new Set(
    safe
      .filter((q) => (q.type || 'quote') !== 'invoice' && (q.status || '').toLowerCase() === 'paid')
      .map((q) => q.id)
  );
  return safe.filter((inv) => {
    if ((inv.status || '').toLowerCase() !== 'paid') return false;
    const type = (inv.type || 'quote').toLowerCase();
    if (type === 'invoice' && inv.parent_id && paidQuoteIds.has(inv.parent_id)) return false;
    return true;
  });
};

/**
 * Répartit le montant HT d'une facture entre prestations de services et vente
 * de marchandises, à partir du détail des lignes (fallback : selon l'activité).
 */
const splitInvoice = (inv, activityType) => {
  let services = 0;
  let vente = 0;
  if (Array.isArray(inv.items) && inv.items.length > 0) {
    inv.items.forEach((item) => {
      const lineTotal = toNumber(item.price) * toNumber(item.quantity);
      if (item.type === 'material') vente += lineTotal;
      else services += lineTotal;
    });
  } else {
    const amount = toNumber(inv.total_ht || inv.total_ttc);
    if (activityType === 'vente') vente = amount;
    else services = amount;
  }
  return { services, vente };
};

/**
 * Taux de cotisations sociales micro-entreprise applicable à une part de CA.
 * @param {'services'|'vente'} part
 */
const microRate = (part, activityType, hasAcre) => {
  const rates = URSSAF_RATES.micro_entreprise;
  if (activityType === 'liberal') {
    return hasAcre ? rates.liberal.acre : rates.liberal.normal;
  }
  const cfg = part === 'vente' ? rates.vente : rates.services;
  return hasAcre ? cfg.acre : cfg.normal;
};

/**
 * Construit le bilan financier pluriannuel.
 *
 * @param {Array} invoices - Devis/factures (bruts, déjà filtrés du client test).
 * @param {object} prefs - profile.ai_preferences { artisan_status, activity_type, has_acre }
 * @param {Date} [now] - Date courante (injectable pour les tests).
 * @returns {object} bilan structuré
 */
export const analyzeFinancials = (invoices, prefs = {}, now = new Date()) => {
  const status = prefs.artisan_status || 'micro_entreprise';
  const activityType = prefs.activity_type || 'services';
  const hasAcre = prefs.has_acre === true;
  const isMicro = status === 'micro_entreprise';

  const currentYear = now.getFullYear();
  const monthsElapsed = currentYear === now.getFullYear() ? now.getMonth() + 1 : 12;

  const paid = getPaidInvoices(invoices);

  // Agrégation par année.
  const byYear = new Map();
  paid.forEach((inv) => {
    const d = new Date(inv.paid_at || inv.date || inv.created_at);
    if (Number.isNaN(d.getTime())) return;
    const y = d.getFullYear();
    if (!byYear.has(y)) byYear.set(y, { year: y, caServices: 0, caVente: 0, count: 0 });
    const bucket = byYear.get(y);
    const { services, vente } = splitInvoice(inv, activityType);
    bucket.caServices += services;
    bucket.caVente += vente;
    bucket.count += 1;
  });

  const years = Array.from(byYear.values())
    .map((b) => {
      const caTotal = b.caServices + b.caVente;
      // Charges sociales (estimation micro uniquement ; null sinon).
      let charges = null;
      let chargesRate = null;
      if (isMicro) {
        const cServices = b.caServices * microRate('services', activityType, false);
        const cVente = b.caVente * microRate('vente', activityType, false);
        charges = cServices + cVente;
        chargesRate = caTotal > 0 ? charges / caTotal : 0;
      }
      // Résultat imposable estimé via l'abattement micro-fiscal.
      let taxableEstimate = null;
      if (isMicro) {
        const abServices = b.caServices * (1 - (activityType === 'liberal' ? MICRO_ABATEMENT.liberal : MICRO_ABATEMENT.services));
        const abVente = b.caVente * (1 - MICRO_ABATEMENT.vente);
        taxableEstimate = abServices + abVente;
      }
      const net = charges != null ? caTotal - charges : null;
      return {
        year: b.year,
        caTotal,
        caServices: b.caServices,
        caVente: b.caVente,
        count: b.count,
        charges,
        chargesRate,
        taxableEstimate,
        net,
        isCurrent: b.year === currentYear,
      };
    })
    .sort((a, b) => a.year - b.year);

  // Évolution année par année (croissance du CA).
  const evolution = years.map((yr, i) => {
    const prev = years[i - 1];
    const growth = prev && prev.caTotal > 0 ? (yr.caTotal - prev.caTotal) / prev.caTotal : null;
    return { year: yr.year, caTotal: yr.caTotal, growth };
  });

  // Projection de l'année en cours (annualisation linéaire).
  const currentRow = years.find((y) => y.year === currentYear);
  let projection = null;
  if (currentRow && monthsElapsed > 0 && monthsElapsed < 12) {
    const factor = 12 / monthsElapsed;
    projection = {
      year: currentYear,
      monthsElapsed,
      caProjected: currentRow.caTotal * factor,
      caServicesProjected: currentRow.caServices * factor,
      caVenteProjected: currentRow.caVente * factor,
    };
  }

  // Croissance "phare" : projeté vs dernière année complète, sinon dernier YoY.
  let headlineGrowth = null;
  const lastFull = years.filter((y) => !y.isCurrent).slice(-1)[0];
  if (projection && lastFull && lastFull.caTotal > 0) {
    headlineGrowth = (projection.caProjected - lastFull.caTotal) / lastFull.caTotal;
  } else {
    const lastEvo = evolution.filter((e) => e.growth != null).slice(-1)[0];
    headlineGrowth = lastEvo ? lastEvo.growth : null;
  }

  // CA de référence pour la comparaison aux plafonds : projection de l'année en
  // cours si disponible, sinon CA de l'année en cours, sinon dernière année connue.
  const latestRow = years[years.length - 1];
  const referenceCa = projection
    ? projection.caProjected
    : currentRow
      ? currentRow.caTotal
      : latestRow
        ? latestRow.caTotal
        : 0;
  const referenceCaServices = projection
    ? projection.caServicesProjected
    : currentRow
      ? currentRow.caServices
      : latestRow
        ? latestRow.caServices
        : 0;

  // Position vis-à-vis des plafonds micro et seuils de TVA.
  const caLimit = activityType === 'mixte' ? CA_LIMITS.vente : CA_LIMITS[activityType] || CA_LIMITS.services;
  const serviceLimit = CA_LIMITS.services;
  const vatLimit = activityType === 'mixte' ? VAT_LIMITS.vente.base : (VAT_LIMITS[activityType]?.base || VAT_LIMITS.services.base);

  const thresholds = {
    caLimit,
    caUsedPct: caLimit > 0 ? (referenceCa / caLimit) * 100 : 0,
    serviceLimit,
    serviceUsedPct: serviceLimit > 0 ? (referenceCaServices / serviceLimit) * 100 : 0,
    vatLimit,
    vatUsedPct: vatLimit > 0 ? (referenceCa / vatLimit) * 100 : 0,
    nearCaLimit: caLimit > 0 && referenceCa / caLimit >= 0.8,
    nearVatLimit: vatLimit > 0 && referenceCa / vatLimit >= 0.8,
    overVatLimit: vatLimit > 0 && referenceCa / vatLimit >= 1,
  };

  return {
    status,
    activityType,
    hasAcre,
    isMicro,
    currentYear,
    years,
    evolution,
    projection,
    headlineGrowth,
    referenceCa,
    referenceCaServices,
    thresholds,
    hasData: years.length > 0,
  };
};

// ── Charges professionnelles & comparaison micro / régime réel ───────────────

// Libellés des catégories de charges (doivent rester cohérents avec
// ChargesManager.jsx et la colonne business_charges.category).
export const CHARGE_CATEGORIES = {
  materiel: 'Matériel & outillage',
  vehicule: 'Véhicule & carburant',
  assurance: 'Assurances (décennale, RC Pro…)',
  loyer: 'Local / loyer',
  fournitures: 'Fournitures & consommables',
  sous_traitance: 'Sous-traitance',
  telephonie: 'Téléphonie & internet',
  logiciels: 'Logiciels & abonnements',
  comptable: 'Expert-comptable / gestion',
  banque: 'Frais bancaires & financiers',
  formation: 'Formation',
  deplacement: 'Déplacements & repas',
  autre: 'Autres charges',
};

// Taux de cotisations sociales estimé au régime réel (TNS) — ordre de grandeur
// usuel pour un artisan en EI/EURL à l'IR. Sert uniquement à l'estimation.
const TNS_REAL_RATE = 0.45;
// Tranche marginale d'imposition par défaut pour la comparaison (proxy neutre).
const DEFAULT_TMI = 0.11;

const chargeAnnualAmount = (c) => {
  const amt = toNumber(c.amount);
  return c.periodicity === 'monthly' ? amt * 12 : amt;
};

/**
 * Agrège une liste de charges (business_charges) en total annualisé + ventilation
 * par catégorie. Aucune dépendance réseau/React.
 */
export const summarizeCharges = (charges = []) => {
  const list = Array.isArray(charges) ? charges : [];
  const byCategory = new Map();
  let annualTotal = 0;
  list.forEach((c) => {
    const annual = chargeAnnualAmount(c);
    annualTotal += annual;
    const key = c.category || 'autre';
    byCategory.set(key, (byCategory.get(key) || 0) + annual);
  });
  return {
    annualTotal,
    count: list.length,
    byCategory: Array.from(byCategory.entries())
      .map(([category, total]) => ({ category, label: CHARGE_CATEGORIES[category] || category, total }))
      .sort((a, b) => b.total - a.total),
  };
};

const microAbatementAmount = (caServices, caVente, activityType) => {
  const abServices = caServices * (activityType === 'liberal' ? MICRO_ABATEMENT.liberal : MICRO_ABATEMENT.services);
  const abVente = caVente * MICRO_ABATEMENT.vente;
  return abServices + abVente;
};

/**
 * Compare, sur le CA de référence, le régime micro (cotisations sur le CA +
 * abattement forfaitaire) au régime réel (cotisations TNS sur le résultat +
 * déduction des charges réelles). Tous les montants du réel sont des
 * ESTIMATIONS (TNS ≈ 45 %, TMI proxy) destinées à éclairer la décision.
 *
 * @returns {object|null} comparaison, ou null si pas de CA de référence.
 */
export const computeStatusComparison = (analysis, chargesAnnual = 0, tmi = DEFAULT_TMI) => {
  const ca = analysis.referenceCa || 0;
  if (ca <= 0) return null;

  const caServices = analysis.referenceCaServices || 0;
  const caVente = Math.max(0, ca - caServices);

  // MICRO — cotisations sur le CA (taux normaux, hors ACRE temporaire).
  const microCotisations =
    caServices * microRate('services', analysis.activityType, false) +
    caVente * microRate('vente', analysis.activityType, false);
  const microAbatement = microAbatementAmount(caServices, caVente, analysis.activityType);
  const microTaxable = Math.max(0, ca - microAbatement);

  // RÉEL — déduction des charges réelles, cotisations TNS sur le résultat.
  const reelResultat = Math.max(0, ca - chargesAnnual);
  const reelCotisations = reelResultat * TNS_REAL_RATE;
  const reelTaxable = Math.max(0, reelResultat - reelCotisations);

  // Prélèvements globaux proxy = cotisations + IR(tmi) sur la base imposable.
  const microPrelevements = microCotisations + microTaxable * tmi;
  const reelPrelevements = reelCotisations + reelTaxable * tmi;

  const cotisationsSaving = microCotisations - reelCotisations; // >0 ⇒ le réel coûte moins de cotisations
  const globalSaving = microPrelevements - reelPrelevements; // >0 ⇒ réel globalement plus avantageux

  const overMicroCeiling = analysis.thresholds.caLimit > 0 && ca > analysis.thresholds.caLimit;

  // Verdict prudent : seuil de 2 % du CA pour éviter de trancher sur du bruit.
  let verdict = 'comparable';
  if (overMicroCeiling) verdict = 'reel';
  else if (globalSaving > ca * 0.02) verdict = 'reel';
  else if (globalSaving < -ca * 0.02) verdict = 'micro';

  return {
    referenceCa: ca,
    chargesAnnual,
    tmi,
    chargesRatio: ca > 0 ? chargesAnnual / ca : 0,
    overMicroCeiling,
    micro: { cotisations: microCotisations, abatement: microAbatement, taxable: microTaxable },
    reel: { resultat: reelResultat, cotisations: reelCotisations, taxable: reelTaxable, rate: TNS_REAL_RATE },
    cotisationsSaving,
    globalSaving,
    verdict,
  };
};

/**
 * Construit le bloc de données factuelles, compact et lisible, injecté dans le
 * prompt IA. On ne transmet QUE des agrégats (jamais les détails clients).
 */
export const buildAdviceFacts = (analysis, { chargesSummary = null, comparison = null } = {}) => {
  const fmt = (n) => (n == null ? 'n/a' : Math.round(n).toLocaleString('fr-FR') + ' €');
  const pct = (n) => (n == null ? 'n/a' : (n * 100).toFixed(1) + ' %');

  const lines = [];
  lines.push(`Statut juridique actuel : ${STATUS_LABELS[analysis.status] || analysis.status}`);
  lines.push(`Type d'activité : ${ACTIVITY_LABELS[analysis.activityType] || analysis.activityType}`);
  lines.push(`ACRE en cours : ${analysis.hasAcre ? 'oui' : 'non'}`);
  lines.push('');
  lines.push('Historique du chiffre d\'affaires (HT) par année :');
  analysis.years.forEach((y) => {
    const parts = [`- ${y.year}${y.isCurrent ? ' (année en cours, incomplète)' : ''} : CA ${fmt(y.caTotal)}`];
    if (y.caServices > 0 && y.caVente > 0) {
      parts.push(`(services ${fmt(y.caServices)} / vente ${fmt(y.caVente)})`);
    }
    if (y.charges != null) parts.push(`— cotisations sociales estimées ${fmt(y.charges)} (≈${pct(y.chargesRate)})`);
    if (y.net != null) parts.push(`— net après cotisations ${fmt(y.net)}`);
    lines.push(parts.join(' '));
  });
  lines.push('');
  if (analysis.projection) {
    lines.push(
      `Projection ${analysis.currentYear} (extrapolée sur ${analysis.projection.monthsElapsed} mois) : CA annuel ≈ ${fmt(
        analysis.projection.caProjected
      )}.`
    );
  }
  if (analysis.headlineGrowth != null) {
    lines.push(`Tendance de croissance : ${pct(analysis.headlineGrowth)} sur la dernière période.`);
  }
  lines.push('');
  lines.push(
    `Plafond micro applicable : ${fmt(analysis.thresholds.caLimit)} — utilisé à ${analysis.thresholds.caUsedPct.toFixed(0)} %.`
  );
  lines.push(
    `Seuil de franchise en base de TVA : ${fmt(analysis.thresholds.vatLimit)} — utilisé à ${analysis.thresholds.vatUsedPct.toFixed(
      0
    )} %.`
  );

  // Charges professionnelles déductibles saisies par l'artisan.
  lines.push('');
  if (chargesSummary && chargesSummary.count > 0) {
    lines.push(
      `Charges professionnelles déductibles déclarées (annualisées) : ${fmt(chargesSummary.annualTotal)} au total, réparties ainsi :`
    );
    chargesSummary.byCategory.forEach((c) => lines.push(`- ${c.label} : ${fmt(c.total)}`));
  } else {
    lines.push(
      "L'artisan n'a pas encore renseigné ses charges professionnelles déductibles : invite-le à les saisir pour fiabiliser la comparaison micro/réel."
    );
  }

  // Comparaison déterministe micro vs réel (estimations) fournie en contexte
  // pour que l'IA s'appuie sur ces chiffres au lieu d'en inventer.
  if (comparison) {
    lines.push('');
    lines.push('Comparaison estimée micro vs régime réel (sur le CA de référence) :');
    lines.push(
      `- MICRO : cotisations ${fmt(comparison.micro.cotisations)} (sur le CA), abattement forfaitaire ${fmt(
        comparison.micro.abatement
      )} ⇒ base imposable ${fmt(comparison.micro.taxable)}.`
    );
    lines.push(
      `- RÉEL : résultat ${fmt(comparison.reel.resultat)} (CA − charges réelles), cotisations TNS estimées ${fmt(
        comparison.reel.cotisations
      )} (≈45 % du résultat) ⇒ base imposable ${fmt(comparison.reel.taxable)}.`
    );
    lines.push(
      `- Charges déclarées = ${pct(comparison.chargesRatio)} du CA. Économie estimée de cotisations au réel : ${fmt(
        comparison.cotisationsSaving
      )} ; gain global estimé (cotisations + IR proxy) : ${fmt(comparison.globalSaving)}.`
    );
    lines.push(
      `- Lecture déterministe (à affiner par tes soins) : régime le plus avantageux ≈ « ${comparison.verdict} ».`
    );
    if (comparison.overMicroCeiling) {
      lines.push('- ⚠ Le CA de référence dépasse le plafond micro : le régime réel devient obligatoire.');
    }
  }

  return lines.join('\n');
};
