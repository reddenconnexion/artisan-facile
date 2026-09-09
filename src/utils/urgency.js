// Niveau d'urgence client sur un devis, utilisé pour prioriser la
// préparation (acompte/matériel) et la planification des chantiers signés
// dans le Pilotage Chantiers.
export const URGENCY_LEVELS = [
    {
        id: 'normal',
        label: 'Normal',
        shortLabel: 'Normal',
        dot: 'bg-gray-300 dark:bg-gray-600',
        badge: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    },
    {
        id: 'urgent',
        label: 'Urgent',
        shortLabel: 'Urgent',
        dot: 'bg-orange-400',
        badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    },
    {
        id: 'critique',
        label: 'Très urgent',
        shortLabel: 'Très urgent',
        dot: 'bg-red-500',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    },
];

export const URGENCY_MAP = Object.fromEntries(URGENCY_LEVELS.map(u => [u.id, u]));

export const getUrgency = (id) => URGENCY_MAP[id] || URGENCY_MAP.normal;

// Poids décroissant : plus urgent = poids plus élevé, pour trier les listes
// "à préparer" / "à planifier" avec les cas les plus pressés en tête.
const WEIGHT = Object.fromEntries(URGENCY_LEVELS.map((u, i) => [u.id, i]));
export const urgencyWeight = (id) => WEIGHT[id] ?? 0;

// Fait tourner un devis vers le niveau d'urgence suivant (pour un clic rapide
// sur l'indicateur, sans passer par un menu déroulant).
export const nextUrgency = (id) => {
    const idx = URGENCY_LEVELS.findIndex(u => u.id === id);
    return URGENCY_LEVELS[(idx + 1) % URGENCY_LEVELS.length].id;
};
