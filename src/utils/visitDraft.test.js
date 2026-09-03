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

describe('photos et transcriptions dans le brouillon', () => {
    it("ne garde que les photos déjà envoyées au stockage", async () => {
        const { draftPhotos, restoreDraftPhotos } = await import('./visitDraft');
        const photos = [
            { id: 'a', path: 'visites/u/a.jpg', url: 'https://x/a.jpg', file: {}, preview: 'blob:1' },
            { id: 'b', file: {}, preview: 'blob:2' }, // pas encore envoyée
            { id: 'c', path: 'visites/u/c.jpg', url: 'https://x/c.jpg', name: 'c.jpg', file: {}, preview: 'blob:3' },
        ];
        expect(draftPhotos(photos)).toEqual([
            { id: 'a', path: 'visites/u/a.jpg', url: 'https://x/a.jpg', name: '' },
            { id: 'c', path: 'visites/u/c.jpg', url: 'https://x/c.jpg', name: 'c.jpg' },
        ]);
        const restored = restoreDraftPhotos(draftPhotos(photos));
        expect(restored).toHaveLength(2);
        expect(restored[0]).toMatchObject({ id: 'a', path: 'visites/u/a.jpg', preview: 'https://x/a.jpg', file: null, restored: true });
    });

    it('fait un aller-retour complet du brouillon avec photos, transcriptions et rapport', async () => {
        const { draftPhotos } = await import('./visitDraft');
        const storage = makeStorage();
        saveVisitDraft({
            clientName: 'Rabié',
            photos: draftPhotos([{ id: 'a', path: 'visites/u/a.jpg', url: 'https://x/a.jpg' }]),
            transcripts: { 'seg-1': 'Refaire le tableau', 'seg-2': '' },
            visitReportId: 9,
        }, { storage, now: NOW });
        const draft = loadVisitDraft({ storage, now: NOW + 1000 });
        expect(draft.photos).toHaveLength(1);
        expect(draft.transcripts).toEqual({ 'seg-1': 'Refaire le tableau', 'seg-2': '' });
        expect(draft.visitReportId).toBe(9);
    });

    it('ignore un brouillon aux photos mal formées', async () => {
        const { restoreDraftPhotos } = await import('./visitDraft');
        expect(restoreDraftPhotos(null)).toEqual([]);
        expect(restoreDraftPhotos([{ id: 'x' }, null])).toEqual([]);
    });
});
