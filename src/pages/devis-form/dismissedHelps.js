// Aides « ? » du formulaire : chacune peut être supprimée définitivement
// (petite croix) une fois comprise — mémorisé par navigateur.
export const DISMISSED_HELPS_KEY = 'devis_dismissed_helps';
export const readDismissedHelps = () => {
    try { return JSON.parse(localStorage.getItem(DISMISSED_HELPS_KEY)) || {}; } catch { return {}; }
};
