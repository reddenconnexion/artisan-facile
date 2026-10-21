import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const { storagePathFromUrl } = await import('./storagePhoto');

const BASE = 'https://x.supabase.co/storage/v1/object/public/project-photos/';

describe('storagePathFromUrl', () => {
    it('retrouve le chemin dans le bucket, décodé et sans paramètres', () => {
        expect(storagePathFromUrl(`${BASE}u1/42/abc.jpg`)).toBe('u1/42/abc.jpg');
        expect(storagePathFromUrl(`${BASE}visites/u1/a%20b.jpg?t=1`)).toBe('visites/u1/a b.jpg');
    });

    it('renvoie null hors du bucket', () => {
        expect(storagePathFromUrl('https://ailleurs.fr/photo.jpg')).toBeNull();
        expect(storagePathFromUrl(null)).toBeNull();
    });
});

const { isMissingObjectError } = await import('./storagePhoto');

describe('isMissingObjectError', () => {
    const response = (status, body) => ({ status, json: async () => body });

    it('reconnaît un objet introuvable (400 + statusCode 404)', async () => {
        expect(await isMissingObjectError({ originalError: response(400, { statusCode: '404', error: 'not_found', message: 'Object not found' }) })).toBe(true);
        expect(await isMissingObjectError({ originalError: response(404, {}) })).toBe(true);
    });

    it("ne confond pas avec un autre refus", async () => {
        expect(await isMissingObjectError({ originalError: response(400, { statusCode: '403', error: 'Unauthorized' }) })).toBe(false);
        expect(await isMissingObjectError({ originalError: response(500, {}) })).toBe(false);
        expect(await isMissingObjectError(null)).toBe(false);
    });
});
