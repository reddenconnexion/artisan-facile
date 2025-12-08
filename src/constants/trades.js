export const TRADE_CONFIG = {
    general: {
        label: "Général / Multitâches",
        defaultUnit: "u",
        terms: {
            quote: "Devis",
            task: "Prestation",
            materials: "Matériaux"
        }
    },
    plumber: {
        label: "Plombier / Chauffagiste",
        defaultUnit: "forfait",
        terms: {
            quote: "Devis Plomberie",
            task: "Intervention",
            materials: "Fournitures"
        }
    },
    electrician: {
        label: "Électricien",
        defaultUnit: "u",
        terms: {
            quote: "Devis Électricité",
            task: "Installation",
            materials: "Appareillage"
        }
    },
    painter: {
        label: "Peintre",
        defaultUnit: "m²",
        terms: {
            quote: "Devis Peinture",
            task: "Surface à traiter",
            materials: "Peintures & Enduits"
        }
    },
    mason: {
        label: "Maçon",
        defaultUnit: "m³",
        terms: {
            quote: "Devis Maçonnerie",
            task: "Ouvrage",
            materials: "Matériaux"
        }
    },
    carpenter: {
        label: "Menuisier",
        defaultUnit: "u",
        terms: {
            quote: "Devis Menuiserie",
            task: "Pose",
            materials: "Menuiserie"
        }
    },
    landscaper: {
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
    return TRADE_CONFIG[tradeKey] || TRADE_CONFIG.general;
};
