import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    matchShortcut, getShortcutById, DEFAULT_SHORTCUT_IDS,
} from '../constants/shortcuts';
import { applyVisit, rankIds } from '../utils/frecency';

/**
 * Suivi d'usage adaptatif. La logique de score (« frecency ») vit dans
 * utils/frecency.js ; ce module l'applique à la navigation et la persiste
 * localement par utilisateur — aucune donnée d'usage n'est envoyée au serveur.
 */

// --- Persistance localStorage ---

const storageKey = (userId) => `af_usage_${userId || 'anon'}`;

function readScores(userId) {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(storageKey(userId));
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

// --- Abonnement : permet aux consommateurs persistants (barre latérale) de se
// rafraîchir dès qu'une visite est enregistrée, sans dépendre d'un remontage. ---

const listeners = new Set();
let version = 0;
const subscribe = (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
};
const getVersion = () => version;

function recordVisit(userId, id) {
    if (typeof window === 'undefined') return;
    try {
        const next = applyVisit(readScores(userId), id);
        window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
        version += 1;
        listeners.forEach((l) => l());
    } catch {
        // Quota plein ou stockage indisponible : le suivi est best-effort.
    }
}

/**
 * À monter une fois dans le Layout : enregistre chaque navigation rattachée à
 * un raccourci du catalogue. Les chemins inconnus (dashboard, réglages…) sont
 * ignorés, ce qui garde le classement pertinent.
 */
export function useTrackUsage() {
    const location = useLocation();
    const { user } = useAuth();
    useEffect(() => {
        if (!user?.id) return;
        const id = matchShortcut(location.pathname);
        if (id) recordVisit(user.id, id);
    }, [location.pathname, user?.id]);
}

/**
 * Renvoie les `limit` raccourcis les plus pertinents pour l'utilisateur,
 * classés par usage. Recalculé dès qu'une visite est enregistrée.
 *
 * @param {number} limit  Nombre maximum de raccourcis renvoyés.
 * @param {{ fillDefaults?: boolean }} options
 *   fillDefaults (défaut true) : complète avec des raccourcis par défaut pour
 *   ne jamais présenter un panneau vide (tableau de bord). À passer à false
 *   pour n'afficher que l'usage réellement appris (barre latérale) — la liste
 *   peut alors être vide tant que rien n'a été utilisé.
 */
export function useFrequentShortcuts(limit = 4, { fillDefaults = true } = {}) {
    const { user } = useAuth();
    const v = useSyncExternalStore(subscribe, getVersion, getVersion);
    return useMemo(() => {
        const ranked = rankIds(readScores(user?.id))
            .map(getShortcutById)
            .filter(Boolean);

        const result = [...ranked];
        if (fillDefaults) {
            for (const id of DEFAULT_SHORTCUT_IDS) {
                if (result.length >= limit) break;
                if (!result.some((s) => s.id === id)) {
                    const entry = getShortcutById(id);
                    if (entry) result.push(entry);
                }
            }
        }
        return result.slice(0, limit);
        // `v` (version du store) force le recalcul à chaque visite enregistrée :
        // le corps relit localStorage, qui n'est pas vu par l'analyse des deps.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, limit, fillDefaults, v]);
}
