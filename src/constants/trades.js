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
        },
        materialCategories: ['Matériaux', 'Quincaillerie', 'Outillage', 'Autre']
    },
    multiservice: {
        label: "Multi-services / Bricolage",
        defaultUnit: "h",
        terms: {
            quote: "Devis",
            task: "Prestation",
            materials: "Fournitures"
        },
        materialCategories: ['Petite Fourniture', 'Quincaillerie', 'Peinture', 'Sol', 'Élec/Plomberie', 'Autre']
    },
    autre: {
        label: "Autre",
        defaultUnit: "u",
        terms: {
            quote: "Devis",
            task: "Prestation",
            materials: "Matériaux"
        },
        materialCategories: ['Matériaux', 'Fournitures', 'Autre']
    },
    plombier: {
        label: "Plombier",
        defaultUnit: "forfait",
        terms: {
            quote: "Devis Plomberie",
            task: "Intervention",
            materials: "Fournitures"
        },
        materialCategories: ['Sanitaire (WC, Lavabo)', 'Robinetterie', 'Tuyauterie (Cuivre/PER/Multi)', 'Chauffe-eau', 'Évacuation (PVC)', 'Raccords', 'Autre']
    },
    chauffagiste: {
        label: "Chauffagiste",
        defaultUnit: "forfait",
        terms: {
            quote: "Devis Chauffage",
            task: "Intervention",
            materials: "Équipements"
        },
        materialCategories: ['Chaudière / PAC', 'Radiateurs', 'Thermostats / Régul', 'Tuyauterie Chauffage', 'Fumisterie', 'Autre']
    },
    electricien: {
        label: "Électricien",
        defaultUnit: "u",
        terms: {
            quote: "Devis Électricité",
            task: "Installation",
            materials: "Appareillage"
        },
        materialCategories: ['Appareillage (Prises/Int.)', 'Tableau & Protection', 'Câbles & Gaines', 'Éclairage', 'Chauffage Élec.', 'Ventilation / VMC', 'Domotique', 'Autre']
    },
    peintre: {
        label: "Peintre",
        defaultUnit: "m²",
        terms: {
            quote: "Devis Peinture",
            task: "Surface à traiter",
            materials: "Peintures & Enduits"
        },
        materialCategories: ['Peinture Murale', 'Peinture Plafond', 'Laque / Boiserie', 'Papier Peint', 'Enduit', 'Sol Souple', 'Autre']
    },
    carreleur: {
        label: "Carreleur",
        defaultUnit: "m²",
        terms: {
            quote: "Devis Carrelage",
            task: "Surface à carreler",
            materials: "Carrelage & Fournitures"
        },
        materialCategories: ['Carrelage Sol', 'Faïence', 'Mosaïque', 'Colle & Joints', 'Profilés', 'Étanchéité / SPEC', 'Autre']
    },
    macon: {
        label: "Maçon",
        defaultUnit: "m³",
        terms: {
            quote: "Devis Maçonnerie",
            task: "Ouvrage",
            materials: "Matériaux"
        },
        materialCategories: ['Ciment / Béton', 'Parpaings / Briques', 'Sable / Gravier / Mélange', 'Ferraillage', 'Isolation', 'Autre']
    },
    plaquiste: {
        label: "Plaquiste",
        defaultUnit: "m²",
        terms: {
            quote: "Devis Plâtrerie",
            task: "Ouvrage",
            materials: "Plaques & Isolants"
        },
        materialCategories: ['Plaques de plâtre', 'Isolation Laine', 'Montants / Rails', 'Bandes & Enduits', 'Visserie', 'Autre']
    },
    menuisier: {
        label: "Menuisier",
        defaultUnit: "u",
        terms: {
            quote: "Devis Menuiserie",
            task: "Pose",
            materials: "Menuiserie"
        },
        materialCategories: ['Fenêtres', 'Portes Intérieures', 'Porte d\'Entrée', 'Parquet / Stratifié', 'Dressing / Placard', 'Cuisine', 'Autre']
    },
    charpentier: {
        label: "Charpentier",
        defaultUnit: "m²",
        terms: {
            quote: "Devis Charpente",
            task: "Ouvrage",
            materials: "Bois & Couverture"
        },
        materialCategories: ['Bois de Charpente', 'Tuiles / Couverture', 'Zinguerie', 'Isolation Toiture', 'Écran sous-toiture', 'Autre']
    },
    paysagiste: {
        label: "Paysagiste",
        defaultUnit: "h",
        terms: {
            quote: "Devis Paysage",
            task: "Entretien / Création",
            materials: "Végétaux"
        },
        materialCategories: ['Végétaux (Arbres/Arbustes)', 'Fleurs / Massifs', 'Terre / Terreau', 'Paillage', 'Bois / Terrasse', 'Clôture', 'Arrosage', 'Autre']
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
