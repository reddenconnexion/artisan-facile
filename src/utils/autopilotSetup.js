// Mise en route du pilote automatique : état partagé entre la carte du
// tableau de bord et l'écran Pilote.

const DISMISS_KEY = 'autopilot_setup_dismissed';

/** L'artisan a-t-il repoussé la mise en route (« plus tard ») sur cet appareil ? */
export const isSetupDismissed = () => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

export const dismissSetup = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* stockage indisponible */ }
};

/** L'installation est-elle terminée (pilote activé, lien d'avis renseigné) ? */
export const isAutopilotSetupDone = (settings, profile) => Boolean(settings?.enabled && profile?.google_review_url);
