/**
 * Score « frecency » (fréquence + récence) — logique pure, sans dépendance React.
 *
 * Chaque visite ajoute 1 au score d'un élément, mais le score accumulé décroît
 * de moitié tous les `HALF_LIFE_MS`. Un élément utilisé souvent ET récemment
 * remonte donc en tête, tandis qu'un usage ancien s'efface de lui-même — pas
 * besoin de purger les vieilles données.
 */
export const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 21; // 21 jours

const decayFactor = (elapsed, halfLife) => Math.pow(0.5, Math.max(0, elapsed) / halfLife);

/** Renvoie une nouvelle table de scores après une visite de `id`. */
export function applyVisit(stats, id, now = Date.now(), halfLife = HALF_LIFE_MS) {
    const prev = stats[id];
    const decayed = prev ? prev.score * decayFactor(now - prev.lastUsed, halfLife) : 0;
    return { ...stats, [id]: { score: decayed + 1, lastUsed: now } };
}

/** Classe les ids du plus au moins utilisé, score décroissant appliqué à `now`. */
export function rankIds(stats, now = Date.now(), halfLife = HALF_LIFE_MS) {
    return Object.entries(stats)
        .map(([id, { score, lastUsed }]) => [id, score * decayFactor(now - lastUsed, halfLife)])
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
}
