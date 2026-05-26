import { describe, it, expect } from 'vitest';
import { computeOrder, sameIdSet } from './adaptiveOrder';

const INTERVAL = 1000 * 60 * 60 * 24; // 24 h
// Score par défaut pour les tests : reprend la valeur d'une map d'ids.
const scoreFrom = (map) => (id) => map[id] || 0;

describe('sameIdSet', () => {
    it('ignore l\'ordre', () => {
        expect(sameIdSet(['a', 'b'], ['b', 'a'])).toBe(true);
    });
    it('détecte un ensemble différent', () => {
        expect(sameIdSet(['a', 'b'], ['a', 'c'])).toBe(false);
        expect(sameIdSet(['a'], ['a', 'b'])).toBe(false);
    });
});

describe('computeOrder — calcul frais', () => {
    const itemIds = ['a', 'b', 'c', 'd'];
    const scoreFn = scoreFrom({ a: 1, b: 5, c: 3, d: 0 });

    it('trie par score décroissant quand rien n\'est mémorisé', () => {
        const { order } = computeOrder({ stored: null, itemIds, scoreFn, now: 0, intervalMs: INTERVAL });
        expect(order).toEqual(['b', 'c', 'a', 'd']);
    });

    it('place les épinglés en tête dans l\'ordre donné', () => {
        const { order } = computeOrder({ stored: null, itemIds, scoreFn, pinnedIds: ['d', 'a'], now: 0, intervalMs: INTERVAL });
        expect(order).toEqual(['d', 'a', 'b', 'c']);
    });

    it('départage les scores égaux par l\'ordre d\'origine (stable)', () => {
        const eq = scoreFrom({ a: 2, b: 2, c: 2, d: 2 });
        const { order } = computeOrder({ stored: null, itemIds, scoreFn: eq, now: 0, intervalMs: INTERVAL });
        expect(order).toEqual(['a', 'b', 'c', 'd']);
    });

    it('fait couler les ids sans score (0) sous les scorés, ordre stable entre eux', () => {
        const sc = scoreFrom({ b: 4, d: 1 }); // a et c => 0
        const { order } = computeOrder({ stored: null, itemIds, scoreFn: sc, now: 0, intervalMs: INTERVAL });
        expect(order).toEqual(['b', 'd', 'a', 'c']);
    });

    it('renvoie computedAt = now', () => {
        const { computedAt } = computeOrder({ stored: null, itemIds, scoreFn, now: 123, intervalMs: INTERVAL });
        expect(computedAt).toBe(123);
    });
});

describe('computeOrder — gel & réconciliation', () => {
    const itemIds = ['a', 'b', 'c'];
    const scoreFn = scoreFrom({ a: 0, b: 0, c: 9 }); // c domine

    it('gèle l\'ordre mémorisé tant que l\'intervalle n\'est pas dépassé', () => {
        const stored = { order: ['a', 'b', 'c'], computedAt: 1000 };
        const result = computeOrder({ stored, itemIds, scoreFn, now: 1000 + INTERVAL - 1, intervalMs: INTERVAL });
        expect(result).toBe(stored); // même référence, ordre inchangé malgré le score de c
    });

    it('recalcule quand l\'intervalle est dépassé', () => {
        const stored = { order: ['a', 'b', 'c'], computedAt: 1000 };
        const { order, computedAt } = computeOrder({ stored, itemIds, scoreFn, now: 1000 + INTERVAL + 1, intervalMs: INTERVAL });
        expect(order).toEqual(['c', 'a', 'b']);
        expect(computedAt).toBe(1000 + INTERVAL + 1);
    });

    it('ajoute un nouvel id en fin et conserve computedAt (pas de reset)', () => {
        const stored = { order: ['a', 'b', 'c'], computedAt: 1000 };
        const { order, computedAt } = computeOrder({ stored, itemIds: ['a', 'b', 'c', 'd'], scoreFn, now: 1000 + 5, intervalMs: INTERVAL });
        expect(order).toEqual(['a', 'b', 'c', 'd']);
        expect(computedAt).toBe(1000);
    });

    it('retire un id absent et conserve computedAt', () => {
        const stored = { order: ['a', 'b', 'c'], computedAt: 1000 };
        const { order, computedAt } = computeOrder({ stored, itemIds: ['a', 'c'], scoreFn, now: 1000 + 5, intervalMs: INTERVAL });
        expect(order).toEqual(['a', 'c']);
        expect(computedAt).toBe(1000);
    });
});
