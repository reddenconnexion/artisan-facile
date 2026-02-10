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
