import {
    FilePlus, UserPlus, FileText, Users, Calendar, Calculator, Inbox, Box,
    ShoppingCart, ClipboardList, BookOpen, Wrench, Repeat, Truck, Image,
    Megaphone, Mic, Map,
} from 'lucide-react';

/**
 * Catalogue des destinations/actions susceptibles d'être proposées en raccourci
 * sur le tableau de bord, la barre latérale et la barre de navigation mobile.
 * Les classements s'adaptent automatiquement à l'utilisation réelle (voir
 * useUsageTracking).
 *
 * Champs :
 * - `label` : libellé complet (tableau de bord, barre latérale).
 * - `short` : libellé compact (barre mobile, où la place est restreinte).
 * - `kind`  : 'action' pour les écrans de création (« Nouveau … »), sinon
 *   'section'. La barre mobile n'affiche que des sections (la création passe
 *   par le bouton flottant contextuel).
 * - `match(pathname)` : rattache une navigation au raccourci. L'ordre compte —
 *   les chemins spécifiques (ex. /app/devis/new) doivent précéder les plus
 *   généraux (ex. /app/devis).
 */
export const SHORTCUT_CATALOG = [
    { id: 'devis-new',         label: 'Nouveau devis',        short: 'Devis',     kind: 'action',  icon: FilePlus,      color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',          path: '/app/devis/new',          match: (p) => p === '/app/devis/new' },
    { id: 'client-new',        label: 'Nouveau client',       short: 'Client',    kind: 'action',  icon: UserPlus,      color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', path: '/app/clients/new',        match: (p) => p === '/app/clients/new' },
    { id: 'intervention-new',  label: 'Nouveau rapport',      short: 'Rapport',   kind: 'action',  icon: ClipboardList, color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',       path: '/app/interventions/new',  match: (p) => p === '/app/interventions/new' },
    { id: 'devis',             label: 'Devis & factures',     short: 'Devis',     kind: 'section', icon: FileText,      color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',          path: '/app/devis',              match: (p) => p === '/app/devis' || p.startsWith('/app/devis/') },
    { id: 'clients',           label: 'Clients',              short: 'Clients',   kind: 'section', icon: Users,         color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', path: '/app/clients',            match: (p) => p === '/app/clients' || p.startsWith('/app/clients/') },
    { id: 'agenda',            label: 'Agenda',               short: 'Agenda',    kind: 'section', icon: Calendar,      color: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',     path: '/app/agenda',             match: (p) => p.startsWith('/app/agenda') },
    { id: 'accounting',        label: 'Comptabilité',         short: 'Compta',    kind: 'section', icon: Calculator,    color: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',          path: '/app/accounting',         match: (p) => p.startsWith('/app/accounting') },
    { id: 'received-invoices', label: 'Factures reçues',      short: 'Reçues',    kind: 'section', icon: Inbox,         color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',     path: '/app/received-invoices',  match: (p) => p.startsWith('/app/received-invoices') },
    { id: 'inventory',         label: 'Stock',                short: 'Stock',     kind: 'section', icon: Box,           color: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',     path: '/app/inventory',          match: (p) => p.startsWith('/app/inventory') },
    { id: 'procurement',       label: 'À commander',          short: 'Achats',    kind: 'section', icon: ShoppingCart,  color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',          path: '/app/procurement',        match: (p) => p.startsWith('/app/procurement') },
    { id: 'interventions',     label: 'Rapports',             short: 'Rapports',  kind: 'section', icon: ClipboardList, color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',       path: '/app/interventions',      match: (p) => p === '/app/interventions' || p.startsWith('/app/interventions/') },
    { id: 'library',           label: 'Bibliothèque',         short: 'Biblio',    kind: 'section', icon: BookOpen,      color: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',              path: '/app/library',            match: (p) => p.startsWith('/app/library') },
    { id: 'maintenance',       label: 'Maintenance',          short: 'SAV',       kind: 'section', icon: Wrench,        color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',          path: '/app/maintenance',        match: (p) => p.startsWith('/app/maintenance') },
    { id: 'recurring',         label: 'Factures récurrentes', short: 'Récurr.',   kind: 'section', icon: Repeat,        color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',     path: '/app/recurring',          match: (p) => p.startsWith('/app/recurring') },
    { id: 'rentals',           label: 'Locations',            short: 'Loc.',      kind: 'section', icon: Truck,         color: 'bg-lime-50 text-lime-600 dark:bg-lime-900/30 dark:text-lime-400',          path: '/app/rentals',            match: (p) => p.startsWith('/app/rentals') },
    { id: 'portfolio',         label: 'Portfolio',            short: 'Photos',    kind: 'section', icon: Image,         color: 'bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',          path: '/app/portfolio',          match: (p) => p.startsWith('/app/portfolio') },
    { id: 'marketing',         label: 'Marketing',            short: 'Promo',     kind: 'section', icon: Megaphone,     color: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400', path: '/app/marketing',          match: (p) => p.startsWith('/app/marketing') },
    { id: 'voice-memos',       label: 'Mémos vocaux',         short: 'Mémos',     kind: 'section', icon: Mic,           color: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',              path: '/app/voice-memos',        match: (p) => p.startsWith('/app/voice-memos') },
    { id: 'route-planner',     label: 'Tournée',              short: 'Tournée',   kind: 'section', icon: Map,           color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',       path: '/app/route-planner',      match: (p) => p.startsWith('/app/route-planner') },
];

/** Raccourcis affichés tant que l'utilisation n'a pas encore été apprise. */
export const DEFAULT_SHORTCUT_IDS = ['devis-new', 'client-new', 'agenda', 'clients'];

const BY_ID = Object.fromEntries(SHORTCUT_CATALOG.map((s) => [s.id, s]));

export const getShortcutById = (id) => BY_ID[id] || null;

/**
 * Rattache un pathname au raccourci correspondant (ou null si aucun).
 * Premier matcher vrai dans l'ordre du catalogue.
 */
export const matchShortcut = (pathname) => {
    const entry = SHORTCUT_CATALOG.find((s) => s.match(pathname));
    return entry ? entry.id : null;
};
