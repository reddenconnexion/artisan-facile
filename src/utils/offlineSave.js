// Aide à l'enregistrement des formulaires terrain (devis, rapport
// d'intervention) sans réseau : la saisie reste en brouillon sur le
// téléphone et l'utilisateur est invité à l'enregistrer au retour du réseau.

/** Vrai si le navigateur se sait hors-ligne. */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Vrai si l'erreur vient du réseau (fetch impossible, coupure pendant
 * l'envoi) plutôt que du serveur. navigator.onLine ment parfois (réseau
 * présent mais sans internet, 4G saturée) : on regarde aussi l'erreur.
 */
export function isNetworkError(error) {
    if (isOffline()) return true;
    if (!error) return false;
    const msg = `${error.message || ''} ${error.details || ''}`;
    return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i.test(msg);
}

export const offlineSaveMessage = (what) =>
    `Pas de réseau : ${what} reste enregistré sur ce téléphone. Il sera à enregistrer dès le retour du réseau.`;
