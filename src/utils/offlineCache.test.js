import { beforeEach, describe, expect, it } from 'vitest';
import { fetchWithOfflineFallback } from './offlineCache';

beforeEach(() => {
    const data = new Map();
    globalThis.localStorage = {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => data.set(k, String(v)),
        removeItem: (k) => data.delete(k),
    };
});

describe('fetchWithOfflineFallback', () => {
    it('en ligne : renvoie les données fraîches et les garde', async () => {
        const res = await fetchWithOfflineFallback('agenda_u1', async () => [{ id: 1 }]);
        expect(res).toMatchObject({ data: [{ id: 1 }], fromCache: false });
        expect(JSON.parse(localStorage.getItem('offline_agenda_u1')).data).toEqual([{ id: 1 }]);
    });

    it('hors-ligne : renvoie la dernière copie avec sa date', async () => {
        await fetchWithOfflineFallback('agenda_u1', async () => [{ id: 1 }]);
        const res = await fetchWithOfflineFallback('agenda_u1', async () => { throw new TypeError('Failed to fetch'); });
        expect(res.fromCache).toBe(true);
        expect(res.data).toEqual([{ id: 1 }]);
        expect(typeof res.savedAt).toBe('number');
    });

    it('une liste vide gardée reste une réponse valable hors-ligne', async () => {
        await fetchWithOfflineFallback('agenda_u1', async () => []);
        const res = await fetchWithOfflineFallback('agenda_u1', async () => { throw new Error('offline'); });
        expect(res).toMatchObject({ data: [], fromCache: true });
    });

    it('hors-ligne sans copie : l’erreur remonte', async () => {
        await expect(
            fetchWithOfflineFallback('agenda_u2', async () => { throw new Error('offline'); })
        ).rejects.toThrow('offline');
    });
});
