import { describe, it, expect, beforeEach } from 'vitest';
import {
    saveVisitDraft,
    loadVisitDraft,
    clearVisitDraft,
    draftAgeLabel,
    VISIT_DRAFT_KEY,
    VISIT_DRAFT_MAX_AGE_MS,
} from './visitDraft';

const makeStorage = (initial = {}) => {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, v),
        removeItem: (k) => map.delete(k),
        size: () => map.size,
    };
};

const NOW = 1_800_000_000_000;

describe('saveVisitDraft / loadVisitDraft', () => {
    let storage;
    beforeEach(() => { storage = makeStorage(); });

    it('fait un aller-retour du brouillon horodaté', () => {
        saveVisitDraft({ clientName: 'Mme Dupont', survey: { demande: 'refaire le tableau' } }, { storage, now: NOW });
        const draft = loadVisitDraft({ storage, now: NOW + 60_000 });
        expect(draft.clientName).toBe('Mme Dupont');
        expect(draft.survey.demande).toBe('refaire le tableau');
        expect(draft.savedAt).toBe(NOW);
    });

    it('retourne null et nettoie un brouillon périmé', () => {
        saveVisitDraft({ clientName: 'Ancien chantier' }, { storage, now: NOW });
        expect(loadVisitDraft({ storage, now: NOW + VISIT_DRAFT_MAX_AGE_MS + 1 })).toBeNull();
        expect(storage.getItem(VISIT_DRAFT_KEY)).toBeNull();
    });

    it('retourne null et nettoie un contenu illisible', () => {
        const corrupt = makeStorage({ [VISIT_DRAFT_KEY]: '{pas du json' });
        expect(loadVisitDraft({ storage: corrupt, now: NOW })).toBeNull();
        expect(corrupt.getItem(VISIT_DRAFT_KEY)).toBeNull();
    });

    it('ignore un brouillon sans horodatage', () => {
        const stale = makeStorage({ [VISIT_DRAFT_KEY]: JSON.stringify({ clientName: 'X' }) });
        expect(loadVisitDraft({ storage: stale, now: NOW })).toBeNull();
    });

    it('tolère un stockage absent ou en échec', () => {
        expect(saveVisitDraft({ a: 1 }, { storage: null })).toBe(false);
        expect(loadVisitDraft({ storage: null })).toBeNull();
        const failing = {
            getItem: () => { throw new Error('bloqué'); },
            setItem: () => { throw new Error('quota'); },
            removeItem: () => { throw new Error('bloqué'); },
        };
        expect(saveVisitDraft({ a: 1 }, { storage: failing })).toBe(false);
        expect(loadVisitDraft({ storage: failing })).toBeNull();
        expect(() => clearVisitDraft({ storage: failing })).not.toThrow();
    });

    it('efface le brouillon à la demande', () => {
        saveVisitDraft({ clientName: 'Fini' }, { storage, now: NOW });
        clearVisitDraft({ storage });
        expect(loadVisitDraft({ storage, now: NOW })).toBeNull();
    });
});

describe('draftAgeLabel', () => {
    it('formate l\'ancienneté en minutes, heures puis jours', () => {
        expect(draftAgeLabel(NOW, NOW + 10_000)).toBe("à l'instant");
        expect(draftAgeLabel(NOW, NOW + 12 * 60_000)).toBe('il y a 12 min');
        expect(draftAgeLabel(NOW, NOW + 3 * 3_600_000)).toBe('il y a 3 h');
        expect(draftAgeLabel(NOW, NOW + 2 * 86_400_000)).toBe('il y a 2 j');
    });
});
