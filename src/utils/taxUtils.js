// Taux URSSAF 2026 pour micro-entrepreneurs
export const URSSAF_RATES = {
    micro_entreprise: {
        services: { normal: 0.212, acre: 0.106, label: 'Prestations de services artisanaux (BIC)' },
        vente: { normal: 0.123, acre: 0.062, label: 'Achat/revente de marchandises (BIC)' },
        liberal: { normal: 0.256, acre: 0.128, label: 'Profession libérale (BNC)' },
        mixte: {
            services: { normal: 0.212, acre: 0.106 },
            vente: { normal: 0.123, acre: 0.062 }
        }
    }
};

// Contributions prélevées par l'URSSAF EN PLUS des cotisations sociales, sur
// la même déclaration de CA (non réduites par l'ACRE) :
//   - CFP (contribution à la formation professionnelle) : 0,3 % artisan,
//     0,1 % commerçant, 0,2 % libéral, sur tout le CA ;
//   - taxe pour frais de chambre consulaire : CMA pour un artisan (0,48 % des
//     prestations, 0,22 % des ventes), CCI pour un commerçant (0,015 % des
//     ventes), rien pour un libéral.
// Les activités « services » et « mixte » de l'app sont des activités
// artisanales (inscription CMA) ; « vente » seule est commerciale.
export const MICRO_EXTRA_RATES = {
    artisan: { cfp: 0.003, chamberServices: 0.0048, chamberVente: 0.0022, chamberLabel: 'Taxe CMA' },
    commercant: { cfp: 0.001, chamberServices: 0.00044, chamberVente: 0.00015, chamberLabel: 'Taxe CCI' },
    liberal: { cfp: 0.002, chamberServices: 0, chamberVente: 0, chamberLabel: null },
};

const extraRatesFor = (activityType) => {
    if (activityType === 'liberal') return MICRO_EXTRA_RATES.liberal;
    if (activityType === 'vente') return MICRO_EXTRA_RATES.commercant;
    return MICRO_EXTRA_RATES.artisan;
};

const toNum = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Montant total à payer à l'URSSAF pour un CA déclaré (micro-entreprise) :
 * cotisations sociales (chaque part à son taux, ACRE éventuelle) + CFP + taxe
 * de chambre consulaire. Source unique pour la Comptabilité et le Tableau de bord.
 *
 * @returns {{
 *   total: number, cotisations: number, cfp: number, chamber: number,
 *   chamberLabel: string|null, cfpRate: number,
 *   services: {ca: number, rate: number, charges: number},
 *   vente: {ca: number, rate: number, charges: number},
 * }}
 */
export const computeMicroContributions = ({
    caServices = 0,
    caVente = 0,
    activityType = 'services',
    hasAcre = false,
} = {}) => {
    const rates = URSSAF_RATES.micro_entreprise;
    const s = toNum(caServices);
    const v = toNum(caVente);
    const pick = (cfg) => (hasAcre ? cfg.acre : cfg.normal);

    let sRate;
    let vRate;
    if (activityType === 'liberal') {
        sRate = pick(rates.liberal);
        vRate = pick(rates.liberal);
    } else {
        sRate = pick(rates.services);
        vRate = pick(rates.vente);
    }

    const extra = extraRatesFor(activityType);
    const services = { ca: s, rate: sRate, charges: s * sRate };
    const vente = { ca: v, rate: vRate, charges: v * vRate };
    const cotisations = services.charges + vente.charges;
    const cfp = (s + v) * extra.cfp;
    const chamber = s * extra.chamberServices + v * extra.chamberVente;

    return {
        total: cotisations + cfp + chamber,
        cotisations,
        cfp,
        cfpRate: extra.cfp,
        chamber,
        chamberLabel: extra.chamberLabel,
        services,
        vente,
    };
};

/**
 * Calcule le taux applicable pour un montant donné en fonction du type
 */
export const getUrssafRate = (profilePrefs, itemType) => {
    const status = profilePrefs?.artisan_status || 'micro_entreprise';

    // Si pas micro-entreprise, on ne peut pas estimer simplement (ou on retourne 0 pour l'instant dashboard)
    if (status !== 'micro_entreprise') return 0;

    const activityType = profilePrefs?.activity_type || 'services';
    const hasAcre = profilePrefs?.has_acre === true; // Supposons que cette préférence existe ou est passée

    const rates = URSSAF_RATES.micro_entreprise;
    let rateConfig;

    // Déterminer le taux basé sur le type d'item (service vs matériel)
    // et le type d'activité globale

    if (activityType === 'mixte') {
        if (itemType === 'material') {
            rateConfig = rates.mixte.vente;
        } else {
            rateConfig = rates.mixte.services;
        }
    } else if (activityType === 'vente') {
        rateConfig = rates.vente; // Tout est vente ? Ou services possibles ? En micro vente, service est rare mais possible.
        // Simplification : si activité vente, tout est vente
        // Mais si item explicitement service ?
        if (itemType !== 'material') {
            // Cas rare : activité déclarée Vente mais facture Service ?
            // On suppose que l'activité principale prime
            rateConfig = rates.vente;
        } else {
            rateConfig = rates.vente;
        }
    } else {
        // Services ou Libéral
        if (activityType === 'liberal') rateConfig = rates.liberal;
        else rateConfig = rates.services;
    }

    return hasAcre ? rateConfig.acre : rateConfig.normal;
};
