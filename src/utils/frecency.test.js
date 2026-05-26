import { describe, it, expect } from 'vitest';
import { applyVisit, rankIds, HALF_LIFE_MS } from './frecency';

const DAY = 1000 * 60 * 60 * 24;

describe('applyVisit', () => {
    it('crée une entrée avec un score de 1 au premier passage', () => {
        const stats = applyVisit({}, 'devis', 0);
        expect(stats.devis.score).toBe(1);
        expect(stats.devis.lastUsed).toBe(0);
    });

    it('cumule les visites immédiates (pas de décroissance à t constant)', () => {
        let stats = applyVisit({}, 'devis', 0);
        stats = applyVisit(stats, 'devis', 0);
        stats = applyVisit(stats, 'devis', 0);
        expect(stats.devis.score).toBe(3);
    });

    it('décroît le score accumulé selon la demi-vie', () => {
        const t0 = applyVisit({}, 'devis', 0);              // score 1
        const t1 = applyVisit(t0, 'devis', HALF_LIFE_MS);   // 1*0.5 + 1 = 1.5
        expect(t1.devis.score).toBeCloseTo(1.5, 5);
    });

    it("n'affecte pas les autres raccourcis", () => {
        let stats = applyVisit({}, 'devis', 0);
        stats = applyVisit(stats, 'clients', DAY);
        expect(stats.devis.score).toBe(1);
        expect(stats.clients.score).toBe(1);
    });
});

describe('rankIds', () => {
    it('classe le raccourci le plus utilisé en tête', () => {
        let stats = {};
        stats = applyVisit(stats, 'devis', 0);
        stats = applyVisit(stats, 'devis', 0);
        stats = applyVisit(stats, 'clients', 0);
        expect(rankIds(stats, 0)).toEqual(['devis', 'clients']);
    });

    it('favorise la récence : un usage ancien retombe sous un usage récent', () => {
        // 'agenda' beaucoup utilisé il y a longtemps, 'devis' un peu mais récemment.
        let stats = {};
        for (let i = 0; i < 5; i++) stats = applyVisit(stats, 'agenda', 0);
        stats = applyVisit(stats, 'devis', 60 * DAY);
        const ranked = rankIds(stats, 60 * DAY);
        expect(ranked[0]).toBe('devis');
    });

    it('renvoie un tableau vide sans données', () => {
        expect(rankIds({}, 0)).toEqual([]);
    });
});
