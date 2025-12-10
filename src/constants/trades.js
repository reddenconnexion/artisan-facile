export const TRADE_CONFIG = {
    // Legacy English Keys (kept for safety if old accounts used them, passing to correct french config if needed or just duplicating)
    // Actually, let's just use the French keys as primary.

    general: {
        label: "Général / Multitâches",
        defaultUnit: "u",
        terms: {
            quote: "Devis",
            task: "Prestation",
            materials: "Matériaux"
        }
    },
    multiservice: {
        label: "Multi-services / Bricolage",
        defaultUnit: "h",
        terms: {
            quote: "Devis",
            task: "Prestation",
            materials: "Fournitures"
        }
    },
    autre: {
        label: "Autre",
        defaultUnit: "u",
        terms: {
            quote: "Devis",
            task: "Prestation",
            materials: "Matériaux"
        }
    },
    plombier: {
        label: "Plombier",
        defaultUnit: "forfait",
        terms: {
            quote: "Devis Plomberie",
            task: "Intervention",
            materials: "Fournitures"
        }
    },
    chauffagiste: {
        label: "Chauffagiste",
        defaultUnit: "forfait",
        terms: {
            quote: "Devis Chauffage",
            task: "Intervention",
            materials: "Équipements"
        }
    },
    electricien: {
        label: "Électricien",
        defaultUnit: "u",
        terms: {
            quote: "Devis Électricité",
            task: "Installation",
            materials: "Appareillage"
        }
    },
    peintre: {
        label: "Peintre",
        defaultUnit: "m²",
        terms: {
            quote: "Devis Peinture",
            task: "Surface à traiter",
            materials: "Peintures & Enduits"
        }
    },
    carreleur: {
        label: "Carreleur",
        defaultUnit: "m²",
        terms: {
            quote: "Devis Carrelage",
            task: "Surface à carreler",
            materials: "Carrelage & Fournitures"
        }
    },
    macon: {
        label: "Maçon",
        defaultUnit: "m³",
        terms: {
            quote: "Devis Maçonnerie",
            task: "Ouvrage",
            materials: "Matériaux"
        }
    },
    plaquiste: {
        label: "Plaquiste",
        defaultUnit: "m²",
        terms: {
            quote: "Devis Plâtrerie",
            task: "Ouvrage",
            materials: "Plaques & Isolants"
        }
    },
    menuisier: {
        label: "Menuisier",
        defaultUnit: "u",
        terms: {
            quote: "Devis Menuiserie",
            task: "Pose",
            materials: "Menuiserie"
        }
    },
    charpentier: {
        label: "Charpentier",
        defaultUnit: "m²",
        terms: {
            quote: "Devis Charpente",
            task: "Ouvrage",
            materials: "Bois & Couverture"
        }
    },
    paysagiste: {
        label: "Paysagiste",
        defaultUnit: "h",
        terms: {
            quote: "Devis Paysage",
            task: "Entretien / Création",
            materials: "Végétaux"
        }
    }
};

export const getTradeConfig = (tradeKey) => {
    // Handle potential English legacy keys maps to French
    const map = {
        'plumber': 'plombier',
        'electrician': 'electricien',
        'painter': 'peintre',
        'mason': 'macon',
        'carpenter': 'menuisier', // Or charpentier? Traditionally carpenter is Menuisier/Charpentier. Let's map to Menuisier as standard wood worker.
        'landscaper': 'paysagiste'
    };

    const key = map[tradeKey] || tradeKey;
    return TRADE_CONFIG[key] || TRADE_CONFIG.general;
};
