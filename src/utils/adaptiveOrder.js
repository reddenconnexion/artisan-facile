/**
 * Ordre adaptatif figé/périodique — logique pure, sans dépendance React.
 *
 * Produit un ordre d'affichage (barre latérale, widgets) classé selon l'usage,
 * mais qui ne change pas en cours de session : il n'est recalculé que lorsque
 * l'intervalle est dépassé. Entre deux recalculs, l'ordre mémorisé est réutilisé
 * tel quel — on se contente de réconcilier les ids ajoutés/retirés.
 */

/** Vrai si les deux listes contiennent exactement le même ensemble d'ids. */
export function sameIdSet(a = [], b = []) {
    if (a.length !== b.length) return false;
    const setB = new Set(b);
    return a.every((id) => setB.has(id));
}

/**
 * @param {object}   params
 * @param {{order:string[], computedAt:number}|null} params.stored  Ordre mémorisé.
 * @param {string[]} params.itemIds    Ids actuellement présents (ordre par défaut).
 * @param {(id:string)=>number} params.scoreFn  Score d'usage par id.
 * @param {string[]} [params.pinnedIds=[]]  Ids épinglés en tête, dans cet ordre.
 * @param {number}   [params.now=Date.now()]
 * @param {number}   params.intervalMs  Durée de gel avant recalcul.
 * @returns {{order:string[], computedAt:number}}
 */
export function computeOrder({ stored, itemIds, scoreFn, pinnedIds = [], now = Date.now(), intervalMs }) {
    const present = new Set(itemIds);
    const stale = !stored || (now - stored.computedAt) > intervalMs;

    // Recalcul complet : épinglés (présents) puis le reste trié par score
    // décroissant, départage stable par index d'origine.
    if (stale || !stored) {
        const pinned = pinnedIds.filter((id) => present.has(id));
        const pinnedSet = new Set(pinned);
        const rest = itemIds
            .filter((id) => !pinnedSet.has(id))
            .map((id, i) => ({ id, i, s: scoreFn(id) || 0 }))
            .sort((a, b) => (b.s - a.s) || (a.i - b.i))
            .map((x) => x.id);
        return { order: [...pinned, ...rest], computedAt: now };
    }

    // Frais : on garde l'ordre mémorisé, en réconciliant l'ensemble d'ids sans
    // re-trier ni réinitialiser l'horloge (un toggle module/widget ne doit pas
    // déclencher de réorganisation).
    if (sameIdSet(stored.order, itemIds)) {
        return stored;
    }
    const kept = stored.order.filter((id) => present.has(id));
    const keptSet = new Set(kept);
    const added = itemIds.filter((id) => !keptSet.has(id));
    return { order: [...kept, ...added], computedAt: stored.computedAt };
}
