import { useEffect, useMemo } from 'react';
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

function recordVisit(userId, id) {
    if (typeof window === 'undefined') return;
    try {
        const next = applyVisit(readScores(userId), id);
        window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
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
 * classés par usage. Tant que peu de données sont apprises, complète avec des
 * raccourcis par défaut pour ne jamais présenter un panneau vide.
 */
export function useFrequentShortcuts(limit = 4) {
    const { user } = useAuth();
    // Le tableau de bord est remonté à chaque navigation, donc ce calcul relit
    // localStorage avec les visites les plus récentes à chaque retour.
    return useMemo(() => {
        const ranked = rankIds(readScores(user?.id))
            .map(getShortcutById)
            .filter(Boolean);

        const result = [...ranked];
        for (const id of DEFAULT_SHORTCUT_IDS) {
            if (result.length >= limit) break;
            if (!result.some((s) => s.id === id)) {
                const entry = getShortcutById(id);
                if (entry) result.push(entry);
            }
        }
        return result.slice(0, limit);
    }, [user?.id, limit]);
}
