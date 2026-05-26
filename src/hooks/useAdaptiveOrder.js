import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { computeOrder } from '../utils/adaptiveOrder';
import { getUsageScores } from './useUsageTracking';
import { ADAPTIVE_ORDER_INTERVAL_MS } from '../utils/frecency';

const orderKey = (key, userId) => `af_order_${key}_${userId}`;

function readStored(key, userId) {
    try {
        const raw = window.localStorage.getItem(orderKey(key, userId));
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && Array.isArray(parsed.order) && typeof parsed.computedAt === 'number') {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

/** Supprime l'ordre mémorisé : le prochain montage recalcule à neuf. */
export function clearAdaptiveOrder(key, userId) {
    if (typeof window === 'undefined' || !userId) return;
    try {
        window.localStorage.removeItem(orderKey(key, userId));
    } catch {
        // best-effort
    }
}

/**
 * Renvoie `itemIds` réordonnés selon l'usage, mais FIGÉ pendant la session :
 * l'ordre n'est recalculé que lorsque `intervalMs` est dépassé (voir
 * computeOrder). Le calcul est synchrone (useMemo) pour éviter tout flicker.
 *
 * Important : lecture non réactive des scores (pas d'abonnement au store), afin
 * que l'ordre ne bouge pas en cours d'utilisation.
 *
 * @param {string} key  Identifiant de surface (ex. 'nav', 'dashboard').
 * @param {string[]} itemIds  Ids à ordonner (ordre par défaut).
 * @param {(id:string, scores:object)=>number} scoreFn  Score d'un id.
 * @param {{ pinnedIds?: string[], intervalMs?: number }} [options]
 */
export function useAdaptiveOrder(key, itemIds, scoreFn, { pinnedIds = [], intervalMs = ADAPTIVE_ORDER_INTERVAL_MS } = {}) {
    const { user } = useAuth();
    const userId = user?.id;
    const itemsKey = itemIds.join('|');

    return useMemo(() => {
        // Pas de fenêtre ou utilisateur non résolu : on garde l'ordre par défaut
        // et on ne persiste rien (évite de figer un ordre « anon » parasite).
        if (typeof window === 'undefined' || !userId) return itemIds;

        const scores = getUsageScores(userId);
        const stored = readStored(key, userId);
        const result = computeOrder({
            stored,
            itemIds,
            scoreFn: (id) => scoreFn(id, scores),
            pinnedIds,
            intervalMs,
        });

        if (result !== stored) {
            try {
                window.localStorage.setItem(orderKey(key, userId), JSON.stringify(result));
            } catch {
                // Quota/stockage indisponible : l'ordre reste valide en mémoire.
            }
        }
        return result.order;
        // scoreFn/pinnedIds sont stables côté appelants (définis au module ou
        // mémoïsés) ; on recalcule sur changement d'utilisateur ou d'ensemble d'ids.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, userId, itemsKey, intervalMs]);
}
