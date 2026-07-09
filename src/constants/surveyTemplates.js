import { LEGACY_TRADE_KEY_MAP } from './trades';

// Trames de relevé de visite par métier : guident la capture sur site
// (mode Visite technique) pièce par pièce, et cadrent ce que l'IA reçoit.
// Même pattern que TRADE_CONFIG : clé = métier du profil, repli `default`.
//
// Structure d'un template :
// - zoneCounters   : compteurs par pièce [{key, label}] (steppers dans l'UI)
// - zoneExtraFields: champs texte par pièce [{key, label, placeholder}]
// - hasTableau     : affiche le bloc « Tableau électrique »
// - tableauEtats   : options d'état du tableau [{value, label}]
// - checklist      : points de conformité [{id, label, hint}] — cochés
//                    « Vérifié » ou « À prévoir » sur site
// - checklistWarning : rappel réglementaire affiché sous la check-list
export const SURVEY_TEMPLATES = {
    default: {
        label: 'Relevé générique',
        zoneCounters: [],
        zoneExtraFields: [
            { key: 'divers', label: 'À relever dans cette pièce', placeholder: 'Constats, mesures, travaux à prévoir…' },
        ],
        hasTableau: false,
        tableauEtats: [],
        checklist: [],
        checklistWarning: '',
    },
    electricien: {
        label: 'Relevé électricité (NF C 15-100)',
        zoneCounters: [
            { key: 'prises', label: 'Prises 2P+T' },
            { key: 'interrupteurs', label: 'Interrupteurs / va-et-vient' },
            { key: 'pointsLumineux', label: 'Points lumineux (plafond / applique)' },
            { key: 'spots', label: 'Spots LED' },
        ],
        zoneExtraFields: [
            { key: 'circuitsDedies', label: 'Circuits dédiés', placeholder: 'Four, plaque, lave-linge…' },
            { key: 'divers', label: 'Divers', placeholder: 'Observations propres à la pièce…' },
        ],
        hasTableau: true,
        tableauEtats: [
            { value: 'conforme', label: 'Conforme' },
            { value: 'a_completer', label: 'À compléter' },
            { value: 'a_remplacer', label: 'À remplacer' },
        ],
        checklist: [
            { id: 'parafoudre_t2', label: 'Parafoudre type 2 au tableau', hint: 'Par défaut si rénovation complète du tableau' },
            { id: 'deux_differentiels', label: 'Minimum 2 différentiels 30 mA', hint: 'Exigence NF C 15-100' },
            { id: 'type_a_variateurs', label: 'Type A 30 mA sur circuits variateur / onduleur', hint: 'Un type AC est insuffisant sur ces circuits' },
            { id: 'liaison_equipot_sdb', label: 'Liaison équipotentielle salle de bain', hint: 'À vérifier indépendamment des appareils remplacés' },
            { id: 'classe_ii_sans_pe', label: 'Appareillage Classe II si circuit existant sans terre (PE)', hint: '' },
            { id: 'pe_non_utilise', label: 'PE non utilisé consigné en boîte de connexion fermée', hint: 'Jamais laissé nu' },
        ],
        checklistWarning: 'Toute non-conformité constatée doit être consignée par écrit sur le devis (protection de votre responsabilité).',
    },
};

export const getSurveyTemplate = (tradeKey) => {
    const key = LEGACY_TRADE_KEY_MAP[tradeKey] || tradeKey;
    return SURVEY_TEMPLATES[key] || SURVEY_TEMPLATES.default;
};
