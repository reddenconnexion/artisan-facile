// Données gardées sur l'appareil : qui peut les lire, et jusqu'à quand.
//
// Sur un téléphone ou un PC partagé, le compte suivant ouvre la même origine
// et lit le même localStorage. Deux règles l'en empêchent :
//  - les brouillons portent l'identifiant de leur propriétaire dans leur clé :
//    un autre compte ne les voit pas, et l'artisan retrouve les siens ;
//  - à la déconnexion, on efface les copies de données serveur (cache
//    hors-ligne) et les anciens brouillons sans propriétaire.
// Les brouillons non enregistrés ne sont PAS effacés à la déconnexion : c'est
// du travail de l'artisan. Ils expirent seuls après DRAFT_MAX_AGE_DAYS.

export const DRAFT_MAX_AGE_DAYS = 30;

/** Clé du brouillon d'un devis, propre à son propriétaire. */
export const quoteDraftKey = (userId, quoteId) => `quote_draft_${userId}_${quoteId || 'new'}`;

// Anciennes clés `quote_draft_new` / `quote_draft_123` : sans propriétaire connu.
const LEGACY_QUOTE_DRAFT = /^quote_draft_(new|\d+)$/;

const storageKeys = () => {
    try { return Object.keys(localStorage); } catch { return []; }
};

const remove = (key) => {
    try { localStorage.removeItem(key); } catch { /* stockage indisponible */ }
};

/** À la déconnexion : efface ce qui est lisible par le compte suivant. */
export function purgeLocalUserData() {
    storageKeys().forEach((key) => {
        if (key.startsWith('offline_') || LEGACY_QUOTE_DRAFT.test(key)) remove(key);
    });
}

const draftSavedAt = (key) => {
    try {
        const parsed = JSON.parse(localStorage.getItem(key));
        // Devis : `_draft_saved_at` ; rapport d'intervention : `savedAt`.
        const stamp = parsed?._draft_saved_at || parsed?.savedAt;
        const time = stamp ? Date.parse(stamp) : NaN;
        return Number.isNaN(time) ? null : time;
    } catch {
        return undefined; // illisible
    }
};

/** Supprime les brouillons de devis / rapports plus vieux que `maxAgeDays`, ou illisibles. */
export function purgeExpiredDrafts(maxAgeDays = DRAFT_MAX_AGE_DAYS, now = Date.now()) {
    const limit = now - maxAgeDays * 24 * 3600 * 1000;
    storageKeys()
        .filter((key) => key.startsWith('quote_draft_') || key.startsWith('intervention-draft-'))
        .forEach((key) => {
            const savedAt = draftSavedAt(key);
            if (savedAt === undefined || (savedAt !== null && savedAt < limit)) remove(key);
        });
}
