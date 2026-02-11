const CACHE_PREFIX = 'offline_';

/**
 * Sauvegarde des données en cache local pour consultation hors-ligne.
 * Utilisé par les hooks React Query pour persister les données
 * entre les sessions et les rendre disponibles sans réseau.
 */
export function saveToOfflineCache(key, data) {
    try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (e) {
        // Storage plein — nettoyer les anciennes entrées et réessayer
        cleanOldCache();
        try {
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
        } catch {
            // Silently fail if still full
        }
    }
}

export function getFromOfflineCache(key) {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function getLastSyncTime() {
    try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
        let latest = 0;
        for (const k of keys) {
            try {
                const { timestamp } = JSON.parse(localStorage.getItem(k));
                if (timestamp > latest) latest = timestamp;
            } catch { /* skip */ }
        }
        return latest || null;
    } catch {
        return null;
    }
}

function cleanOldCache() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    const entries = keys.map(k => {
        try {
            const { timestamp } = JSON.parse(localStorage.getItem(k));
            return { key: k, timestamp: timestamp || 0 };
        } catch {
            return { key: k, timestamp: 0 };
        }
    }).sort((a, b) => a.timestamp - b.timestamp);

    // Supprimer la moitié la plus ancienne
    const toRemove = entries.slice(0, Math.ceil(entries.length / 2));
    toRemove.forEach(e => localStorage.removeItem(e.key));
}
