import { LEGACY_TRADE_KEY_MAP } from './trades';

// Trames de relevé de visite par métier : guident la capture sur site
// (mode Visite technique) pièce par pièce, et cadrent ce que l'IA reçoit.
// Même pattern que TRADE_CONFIG : clé = métier du profil, repli `default`.
//
// Structure d'un template :
// - contextGroups   : contexte du chantier, saisi en début de visite
//                     [{key, label, fields: [{key, label, type, …}]}]
//                     type = 'chips' (options, multi) | 'text' | 'number'
// - zonePresets     : noms de pièces proposés en un tap
// - zoneCounters    : compteurs par pièce [{key, label, short}] — steppers de
//                     la trame et gros boutons du mode express (`short`)
// - zoneExtraFields : champs texte par pièce [{key, label, placeholder}]
// - hasTableau      : affiche le bloc « Tableau électrique »
// - tableauEtats    : options d'état du tableau [{value, label}]
// - checklist       : points de conformité [{id, label, hint}] — cochés
//                     « Vérifié » ou « À prévoir » sur site
// - checklistWarning : rappel réglementaire affiché sous la check-list
// - essentials      : champs dont l'absence est signalée comme « à compléter »
//                     avant d'envoyer le compte rendu à l'IA devis.
//                     [{key, label}] — key = 'demande' | 'zones' | 'tableau'
//                     | 'contexte.<groupe>.<champ>'
export const SURVEY_TEMPLATES = {
    default: {
        label: 'Relevé générique',
        contextGroups: [
            {
                key: 'bien',
                label: 'Le bien',
                fields: [
                    { key: 'typeBien', label: 'Type de bien', type: 'chips', options: ['Maison', 'Appartement', 'Local pro', 'Dépendance / extérieur'] },
                    { key: 'natureTravaux', label: 'Nature des travaux', type: 'chips', options: ['Rénovation totale', 'Rénovation partielle', 'Neuf / extension', 'Réparation'] },
                    { key: 'surface', label: 'Surface concernée', type: 'number', unit: 'm²' },
                    { key: 'occupation', label: 'Pendant les travaux', type: 'chips', options: ['Logement occupé', 'Logement vide'] },
                ],
            },
            {
                key: 'acces',
                label: 'Accès & logistique',
                fields: [
                    { key: 'accesChantier', label: 'Accès', type: 'chips', multi: true, options: ['Plain-pied', 'Étage sans ascenseur', 'Ascenseur', 'Portage > 50 m', 'Stationnement difficile'] },
                    { key: 'contraintes', label: 'Contraintes particulières', type: 'text', placeholder: 'Horaires, animaux, amiante, copropriété…' },
                ],
            },
            {
                key: 'client',
                label: 'Attentes du client',
                fields: [
                    { key: 'delai', label: 'Délai souhaité', type: 'text', placeholder: 'Avant fin octobre, pas d\'urgence…' },
                    { key: 'budget', label: 'Budget évoqué', type: 'text', placeholder: 'Enveloppe annoncée par le client…' },
                    { key: 'decision', label: 'Interlocuteur / décideur', type: 'text', placeholder: 'Qui signe, qui suit le chantier…' },
                ],
            },
        ],
        zonePresets: ['Cuisine', 'Séjour', 'Chambre', 'Salle de bain', 'WC', 'Couloir', 'Entrée', 'Garage', 'Extérieur'],
        zoneCounters: [],
        zoneExtraFields: [
            { key: 'divers', label: 'À relever dans cette pièce', placeholder: 'Constats, mesures, travaux à prévoir…' },
        ],
        hasTableau: false,
        tableauEtats: [],
        checklist: [],
        checklistWarning: '',
        essentials: [
            { key: 'demande', label: 'La demande du client' },
            { key: 'zones', label: 'Au moins une pièce relevée' },
            { key: 'contexte.bien.typeBien', label: 'Type de bien' },
            { key: 'contexte.bien.natureTravaux', label: 'Nature des travaux' },
            { key: 'contexte.client.delai', label: 'Délai souhaité' },
        ],
    },
    electricien: {
        label: 'Relevé électricité (NF C 15-100)',
        contextGroups: [
            {
                key: 'bien',
                label: 'Le bien',
                fields: [
                    { key: 'typeBien', label: 'Type de bien', type: 'chips', options: ['Maison', 'Appartement', 'Local pro', 'Dépendance / extérieur'] },
                    { key: 'natureTravaux', label: 'Nature des travaux', type: 'chips', options: ['Rénovation totale', 'Rénovation partielle', 'Neuf / extension', 'Mise en sécurité', 'Ajout de circuits'] },
                    { key: 'anneeInstallation', label: 'Âge / état de l\'installation', type: 'text', placeholder: '1975, fils tissu, refait en 2010…' },
                    { key: 'surface', label: 'Surface concernée', type: 'number', unit: 'm²' },
                    { key: 'occupation', label: 'Pendant les travaux', type: 'chips', options: ['Logement occupé', 'Logement vide'] },
                ],
            },
            {
                key: 'support',
                label: 'Support & passage des câbles',
                fields: [
                    { key: 'murs', label: 'Nature des murs', type: 'chips', multi: true, options: ['Placo', 'Brique', 'Parpaing', 'Pierre', 'Béton', 'Ossature bois', 'Doublage isolé'] },
                    { key: 'modePose', label: 'Mode de pose', type: 'chips', multi: true, options: ['Encastré', 'Apparent / goulotte', 'Moulure', 'Plinthe', 'Combles', 'Vide sanitaire', 'Faux plafond'] },
                    { key: 'saignees', label: 'Saignées & rebouchage', type: 'chips', options: ['À prévoir (à ma charge)', 'À la charge du client', 'Non concerné'] },
                    { key: 'finitions', label: 'Reprise des finitions', type: 'chips', options: ['Non incluse', 'Rebouchage simple', 'Rebouchage + peinture'] },
                ],
            },
            {
                key: 'alimentation',
                label: 'Alimentation & terre',
                fields: [
                    { key: 'compteur', label: 'Comptage', type: 'chips', options: ['Linky', 'Ancien compteur', 'À déplacer', 'À créer (raccordement Enedis)'] },
                    { key: 'phase', label: 'Nature', type: 'chips', options: ['Monophasé', 'Triphasé'] },
                    { key: 'puissance', label: 'Puissance souscrite', type: 'text', placeholder: '9 kVA, 12 kVA…' },
                    { key: 'distanceTableau', label: 'Distance comptage → tableau', type: 'text', placeholder: '8 m, sous fourreau existant…' },
                    { key: 'terre', label: 'Prise de terre', type: 'chips', options: ['Présente et raccordée', 'Présente à vérifier', 'Absente — à créer'] },
                    { key: 'gtl', label: 'GTL / ETEL', type: 'chips', options: ['Conforme', 'À reprendre', 'À créer'] },
                ],
            },
            {
                key: 'acces',
                label: 'Accès & logistique',
                fields: [
                    { key: 'accesChantier', label: 'Accès', type: 'chips', multi: true, options: ['Plain-pied', 'Étage sans ascenseur', 'Ascenseur', 'Portage > 50 m', 'Stationnement difficile'] },
                    { key: 'hauteurPlafond', label: 'Hauteur sous plafond', type: 'text', placeholder: '2,50 m — échafaudage / nacelle ?' },
                    { key: 'contraintes', label: 'Contraintes particulières', type: 'text', placeholder: 'Amiante, copropriété, horaires, animaux…' },
                ],
            },
            {
                key: 'client',
                label: 'Attentes du client',
                fields: [
                    { key: 'gamme', label: 'Gamme d\'appareillage', type: 'chips', options: ['Entrée de gamme', 'Standard', 'Haut de gamme'] },
                    { key: 'domotique', label: 'Options évoquées', type: 'chips', multi: true, options: ['Domotique / connecté', 'Borne de recharge VE', 'Photovoltaïque', 'Alarme / vidéo', 'VMC', 'Chauffage électrique'] },
                    { key: 'delai', label: 'Délai souhaité', type: 'text', placeholder: 'Avant fin octobre, pas d\'urgence…' },
                    { key: 'budget', label: 'Budget évoqué', type: 'text', placeholder: 'Enveloppe annoncée par le client…' },
                    { key: 'decision', label: 'Interlocuteur / décideur', type: 'text', placeholder: 'Qui signe, qui suit le chantier…' },
                ],
            },
        ],
        zonePresets: ['Cuisine', 'Séjour', 'Chambre', 'Salle de bain', 'WC', 'Couloir', 'Entrée', 'Bureau', 'Buanderie', 'Garage', 'Combles', 'Extérieur'],
        zoneCounters: [
            { key: 'prises', label: 'Prises 2P+T', short: 'Prise' },
            { key: 'interrupteurs', label: 'Interrupteurs / va-et-vient', short: 'Inter' },
            { key: 'pointsLumineux', label: 'Points lumineux (plafond / applique)', short: 'Lumière' },
            { key: 'spots', label: 'Spots LED', short: 'Spot' },
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
        essentials: [
            { key: 'demande', label: 'La demande du client' },
            { key: 'zones', label: 'Au moins une pièce relevée' },
            { key: 'tableau', label: 'État du tableau électrique' },
            { key: 'contexte.bien.typeBien', label: 'Type de bien' },
            { key: 'contexte.bien.natureTravaux', label: 'Nature des travaux' },
            { key: 'contexte.support.modePose', label: 'Mode de pose des câbles' },
            { key: 'contexte.alimentation.terre', label: 'Prise de terre' },
            { key: 'contexte.client.delai', label: 'Délai souhaité' },
        ],
    },
};

export const getSurveyTemplate = (tradeKey) => {
    const key = LEGACY_TRADE_KEY_MAP[tradeKey] || tradeKey;
    return SURVEY_TEMPLATES[key] || SURVEY_TEMPLATES.default;
};
